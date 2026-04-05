import { getAckedChunkIds, getChunkSummary, recordChunkAck } from "@my-better-t-app/db";

import { bucketHasChunk, listBucketChunkIds, uploadChunkToBucket } from "./bucket";

export interface UploadChunkInput {
  chunkId: string;
  body: Buffer | Uint8Array;
  contentType: string;
  createdAt: string;
}

export interface ReconciliationResult {
  checkedChunkIds: number;
  mismatches: string[];
}

function toDistinctChunkIds(chunkIds: string[]) {
  return [...new Set(chunkIds)];
}

export async function persistChunkAndAck(input: UploadChunkInput) {
  await uploadChunkToBucket(input);
  await recordChunkAck(input.chunkId);
}

export async function findMissingChunkIds(chunkIds?: string[]): Promise<ReconciliationResult> {
  const distinctChunkIds = chunkIds ? toDistinctChunkIds(chunkIds) : undefined;
  const ackedRows = await getAckedChunkIds(distinctChunkIds);
  const ackedChunkIds = ackedRows.map((row) => row.chunkId);

  if (ackedChunkIds.length === 0) {
    return {
      checkedChunkIds: 0,
      mismatches: [],
    };
  }

  if (distinctChunkIds && distinctChunkIds.length > 0) {
    const mismatches: string[] = [];

    for (const chunkId of ackedChunkIds) {
      const existsInBucket = await bucketHasChunk(chunkId);

      if (!existsInBucket) {
        mismatches.push(chunkId);
      }
    }

    return {
      checkedChunkIds: ackedChunkIds.length,
      mismatches,
    };
  }

  const bucketChunkIds = await listBucketChunkIds();
  const bucketChunkIdSet = new Set(bucketChunkIds);
  const mismatches = ackedChunkIds.filter((chunkId) => !bucketChunkIdSet.has(chunkId));

  return {
    checkedChunkIds: ackedChunkIds.length,
    mismatches,
  };
}

export async function getPipelineSummary() {
  const [databaseSummary, reconciliation] = await Promise.all([
    getChunkSummary(),
    findMissingChunkIds(),
  ]);

  return {
    ...databaseSummary,
    mismatchCount: reconciliation.mismatches.length,
  };
}
