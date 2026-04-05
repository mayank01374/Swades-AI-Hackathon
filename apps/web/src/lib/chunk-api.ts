import { env } from "@my-better-t-app/env/web";

import type {
  ChunkMismatchResponse,
  ServerPipelineSummary,
  StoredChunkRecord,
} from "./chunk-types";

function getApiUrl(pathname: string) {
  return new URL(pathname, env.NEXT_PUBLIC_SERVER_URL).toString();
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = `Request failed with status ${response.status}.`;

    try {
      const payload = (await response.json()) as { error?: string };
      message = payload.error ?? message;
    } catch {
      // Ignore JSON parsing failures and keep the generic message.
    }

    throw new Error(message);
  }

  return (await response.json()) as T;
}

export async function uploadChunkRecord(record: StoredChunkRecord) {
  const response = await fetch(getApiUrl("/api/chunks/upload"), {
    body: JSON.stringify({
      chunkId: record.chunkId,
      contentType: record.contentType,
      createdAt: record.createdAt,
      data: record.data,
      encoding: record.encoding,
    }),
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  return parseJsonResponse<{
    bucketSynced: boolean;
    chunkId: string;
    dbAcked: boolean;
    ok: boolean;
  }>(response);
}

export async function fetchChunkMismatches(chunkIds: string[]) {
  const url = new URL(getApiUrl("/api/chunks/mismatches"));

  for (const chunkId of chunkIds) {
    url.searchParams.append("chunkId", chunkId);
  }

  const response = await fetch(url.toString(), {
    cache: "no-store",
  });

  return parseJsonResponse<ChunkMismatchResponse>(response);
}

export async function fetchServerPipelineSummary() {
  const response = await fetch(getApiUrl("/api/chunks/summary"), {
    cache: "no-store",
  });

  return parseJsonResponse<ServerPipelineSummary>(response);
}
