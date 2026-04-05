import { env } from "@my-better-t-app/env/server";
import { and, count, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: env.DATABASE_POOL_MAX,
});

export function createDb() {
  return drizzle(pool, { schema });
}

export const db = createDb();
export const { chunks } = schema;

export interface ChunkSummary {
  totalChunkRecords: number;
  ackedChunkRecords: number;
}

export async function recordChunkAck(chunkId: string) {
  await db
    .insert(chunks)
    .values({
      bucketSynced: true,
      chunkId,
      dbAcked: true,
    })
    .onConflictDoUpdate({
      set: {
        bucketSynced: true,
        dbAcked: true,
      },
      target: chunks.chunkId,
    });
}

export async function getAckedChunkIds(chunkIds?: string[]) {
  const whereClause =
    chunkIds && chunkIds.length > 0
      ? and(
          inArray(chunks.chunkId, chunkIds),
          eq(chunks.bucketSynced, true),
          eq(chunks.dbAcked, true),
        )
      : and(eq(chunks.bucketSynced, true), eq(chunks.dbAcked, true));

  return db
    .select({
      chunkId: chunks.chunkId,
    })
    .from(chunks)
    .where(whereClause);
}

export async function getChunkSummary(): Promise<ChunkSummary> {
  const [totalResult, ackedResult] = await Promise.all([
    db.select({ value: count() }).from(chunks),
    db
      .select({ value: count() })
      .from(chunks)
      .where(and(eq(chunks.bucketSynced, true), eq(chunks.dbAcked, true))),
  ]);

  return {
    ackedChunkRecords: ackedResult[0]?.value ?? 0,
    totalChunkRecords: totalResult[0]?.value ?? 0,
  };
}
