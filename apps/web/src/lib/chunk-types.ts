export const CHUNK_SYNC_STATES = ["buffered", "uploading", "acked", "repairing", "error"] as const;
export type ChunkSyncState = (typeof CHUNK_SYNC_STATES)[number];

export const CHUNK_SOURCES = ["recording", "synthetic"] as const;
export type ChunkSource = (typeof CHUNK_SOURCES)[number];

export interface StoredChunkRecord {
  attemptCount: number;
  chunkId: string;
  contentType: string;
  createdAt: string;
  data: string;
  encoding: "base64" | "utf-8";
  lastError: string | null;
  lastUploadedAt: string | null;
  serverAckedAt: string | null;
  sizeBytes: number;
  source: ChunkSource;
  syncState: ChunkSyncState;
  verifiedAt: string | null;
}

export interface ChunkMismatchResponse {
  checkedChunkIds: number;
  mismatches: string[];
  ok: boolean;
}

export interface ServerPipelineSummary {
  ackedChunkRecords: number;
  mismatchCount: number;
  ok: boolean;
  totalChunkRecords: number;
}
