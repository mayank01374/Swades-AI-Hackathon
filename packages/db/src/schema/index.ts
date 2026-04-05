import { boolean, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const chunks = pgTable(
  "chunks",
  {
    bucketSynced: boolean("bucket_synced").notNull().default(false),
    chunkId: text("chunk_id").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    dbAcked: boolean("db_acked").notNull().default(false),
    id: uuid("id").defaultRandom().primaryKey(),
  },
  (table) => ({
    chunkIdIndex: index("chunks_chunk_id_idx").on(table.chunkId),
    createdAtIndex: index("chunks_created_at_idx").on(table.createdAt),
  }),
);

export type ChunkRow = typeof chunks.$inferSelect;
export type NewChunkRow = typeof chunks.$inferInsert;
