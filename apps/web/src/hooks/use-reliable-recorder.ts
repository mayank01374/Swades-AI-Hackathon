"use client";

import { env } from "@my-better-t-app/env/web";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { blobToBase64 } from "@/lib/chunk-codec";
import {
  fetchChunkMismatches,
  fetchServerPipelineSummary,
  uploadChunkRecord,
} from "@/lib/chunk-api";
import type { ServerPipelineSummary, StoredChunkRecord } from "@/lib/chunk-types";
import {
  deleteChunkFromOPFS,
  isOpfsSupported,
  listAllOPFSChunks,
  readChunkFromOPFS,
  saveChunkToOPFS,
} from "@/lib/opfs";

const MAX_CONCURRENT_UPLOADS = 3;
const RETRYABLE_STATES = new Set(["buffered", "error", "repairing"] as const);
const SUPPORTED_MIME_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"] as const;

export type RecorderPipelineStatus = "idle" | "requesting" | "recording" | "paused" | "error";

export interface RecorderPipelineCounts {
  acked: number;
  buffered: number;
  error: number;
  opfs: number;
  repairing: number;
  uploading: number;
  verified: number;
}

function getPreferredMimeType() {
  for (const mimeType of SUPPORTED_MIME_TYPES) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(mimeType)) {
      return mimeType;
    }
  }

  return;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown pipeline error.";
}

function sortChunkRecords(records: StoredChunkRecord[]) {
  return [...records].toSorted((left, right) => left.createdAt.localeCompare(right.createdAt));
}

function createSyntheticPayload() {
  return `synthetic-${new Date().toISOString()}-${crypto.randomUUID()}`.padEnd(1024, "x");
}

function createChunkId(sessionId: string) {
  return `${sessionId}-${Date.now()}-${crypto.randomUUID()}`;
}

function isRetryableState(syncState: StoredChunkRecord["syncState"]): syncState is "buffered" | "error" | "repairing" {
  return RETRYABLE_STATES.has(syncState as "buffered" | "error" | "repairing");
}

export function useReliableRecorder() {
  const [recorderStatus, setRecorderStatus] = useState<RecorderPipelineStatus>("idle");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [chunkRecords, setChunkRecords] = useState<StoredChunkRecord[]>([]);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [opfsAvailable, setOpfsAvailable] = useState(false);
  const [hydrationComplete, setHydrationComplete] = useState(false);
  const [lastMismatchCount, setLastMismatchCount] = useState(0);
  const [lastPipelineError, setLastPipelineError] = useState<string | null>(null);
  const [serverSummary, setServerSummary] = useState<ServerPipelineSummary | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunkRecordMapRef = useRef(new Map<string, StoredChunkRecord>());
  const activeUploadsRef = useRef(new Set<string>());
  const queuePumpInFlightRef = useRef(false);
  const sessionIdRef = useRef(crypto.randomUUID());
  const elapsedStartedAtRef = useRef<number | null>(null);
  const pausedElapsedSecondsRef = useRef(0);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const publishChunkRecords = useCallback((records: StoredChunkRecord[]) => {
    const sorted = sortChunkRecords(records);
    chunkRecordMapRef.current = new Map(sorted.map((record) => [record.chunkId, record]));
    setChunkRecords(sorted);
  }, []);

  const upsertChunkRecord = useCallback(
    (record: StoredChunkRecord) => {
      const nextMap = new Map(chunkRecordMapRef.current);
      nextMap.set(record.chunkId, record);
      publishChunkRecords([...nextMap.values()]);
    },
    [publishChunkRecords],
  );

  const removeChunkRecord = useCallback(
    (chunkId: string) => {
      const nextMap = new Map(chunkRecordMapRef.current);
      nextMap.delete(chunkId);
      publishChunkRecords([...nextMap.values()]);
    },
    [publishChunkRecords],
  );

  const persistChunkRecord = useCallback(
    async (record: StoredChunkRecord) => {
      await saveChunkToOPFS(record.chunkId, record);
      upsertChunkRecord(record);
    },
    [upsertChunkRecord],
  );

  const updateServerSummary = useCallback(async () => {
    try {
      const summary = await fetchServerPipelineSummary();
      setServerSummary(summary);
    } catch (error) {
      setLastPipelineError(getErrorMessage(error));
    }
  }, []);

  const pumpUploadQueue = useCallback(async () => {
    if (queuePumpInFlightRef.current) {
      return;
    }

    queuePumpInFlightRef.current = true;

    try {
      while (activeUploadsRef.current.size < MAX_CONCURRENT_UPLOADS) {
        const nextRecord = sortChunkRecords([...chunkRecordMapRef.current.values()]).find(
          (record) => !activeUploadsRef.current.has(record.chunkId) && isRetryableState(record.syncState),
        );

        if (!nextRecord) {
          break;
        }

        activeUploadsRef.current.add(nextRecord.chunkId);

        void (async () => {
          const latestRecord = await readChunkFromOPFS(nextRecord.chunkId);

          if (!latestRecord) {
            activeUploadsRef.current.delete(nextRecord.chunkId);
            removeChunkRecord(nextRecord.chunkId);
            return;
          }

          const uploadState = latestRecord.syncState === "repairing" ? "repairing" : "uploading";
          const attemptRecord: StoredChunkRecord = {
            ...latestRecord,
            attemptCount: latestRecord.attemptCount + 1,
            lastError: null,
            syncState: uploadState,
          };

          await persistChunkRecord(attemptRecord);

          try {
            await uploadChunkRecord(attemptRecord);

            const ackedAt = new Date().toISOString();
            const ackedRecord: StoredChunkRecord = {
              ...attemptRecord,
              lastUploadedAt: ackedAt,
              serverAckedAt: ackedAt,
              syncState: "acked",
            };

            await persistChunkRecord(ackedRecord);
            setLastPipelineError(null);
          } catch (error) {
            const failedRecord: StoredChunkRecord = {
              ...attemptRecord,
              lastError: getErrorMessage(error),
              syncState: "error",
            };

            await persistChunkRecord(failedRecord);
            setLastPipelineError(failedRecord.lastError);
          } finally {
            activeUploadsRef.current.delete(nextRecord.chunkId);
            void updateServerSummary();
            void pumpUploadQueue();
          }
        })();
      }
    } finally {
      queuePumpInFlightRef.current = false;
    }
  }, [persistChunkRecord, removeChunkRecord, updateServerSummary]);

  const enqueueChunk = useCallback(
    async (
      input:
        | {
            blob: Blob;
            source: "recording";
          }
        | {
            source: "synthetic";
            text: string;
          },
    ) => {
      const chunkId = createChunkId(sessionIdRef.current);
      const createdAt = new Date().toISOString();

      const record: StoredChunkRecord =
        input.source === "recording"
          ? {
              attemptCount: 0,
              chunkId,
              contentType: input.blob.type || "application/octet-stream",
              createdAt,
              data: await blobToBase64(input.blob),
              encoding: "base64",
              lastError: null,
              lastUploadedAt: null,
              serverAckedAt: null,
              sizeBytes: input.blob.size,
              source: input.source,
              syncState: "buffered",
              verifiedAt: null,
            }
          : {
              attemptCount: 0,
              chunkId,
              contentType: "text/plain; charset=utf-8",
              createdAt,
              data: input.text,
              encoding: "utf-8",
              lastError: null,
              lastUploadedAt: null,
              serverAckedAt: null,
              sizeBytes: input.text.length,
              source: input.source,
              syncState: "buffered",
              verifiedAt: null,
            };

      await persistChunkRecord(record);
      void pumpUploadQueue();
    },
    [persistChunkRecord, pumpUploadQueue],
  );

  const repairMismatches = useCallback(async () => {
    const localChunkIds = [...chunkRecordMapRef.current.keys()];

    if (localChunkIds.length === 0) {
      setLastMismatchCount(0);
      return;
    }

    try {
      const response = await fetchChunkMismatches(localChunkIds);
      const mismatchSet = new Set(response.mismatches);
      const verifiedAt = new Date().toISOString();

      setLastMismatchCount(response.mismatches.length);

      for (const record of chunkRecordMapRef.current.values()) {
        if (record.syncState === "acked" && !mismatchSet.has(record.chunkId) && !record.verifiedAt) {
          await persistChunkRecord({
            ...record,
            verifiedAt,
          });
        }
      }

      for (const chunkId of mismatchSet) {
        const existingRecord = chunkRecordMapRef.current.get(chunkId);

        if (!existingRecord) {
          continue;
        }

        await persistChunkRecord({
          ...existingRecord,
          lastError: "Bucket mismatch detected. Re-upload queued from OPFS.",
          syncState: "repairing",
        });
      }

      if (response.mismatches.length > 0) {
        toast.warning("Recovery loop found missing bucket chunks and queued a repair.");
      }

      void pumpUploadQueue();
      void updateServerSummary();
    } catch (error) {
      setLastPipelineError(getErrorMessage(error));
    }
  }, [persistChunkRecord, pumpUploadQueue, updateServerSummary]);

  const hydrateFromOpfs = useCallback(async () => {
    try {
      const opfsRecords = await listAllOPFSChunks();
      publishChunkRecords(opfsRecords);
      setHydrationComplete(true);
      void updateServerSummary();
    } catch (error) {
      setHydrationComplete(true);
      setLastPipelineError(getErrorMessage(error));
    }
  }, [publishChunkRecords, updateServerSummary]);

  const stopElapsedTimer = useCallback(() => {
    if (elapsedTimerRef.current) {
      clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }
  }, []);

  const startElapsedTimer = useCallback(() => {
    stopElapsedTimer();
    elapsedStartedAtRef.current = Date.now();

    elapsedTimerRef.current = setInterval(() => {
      if (!elapsedStartedAtRef.current) {
        return;
      }

      const elapsed =
        pausedElapsedSecondsRef.current + (Date.now() - elapsedStartedAtRef.current) / 1000;
      setElapsedSeconds(elapsed);
    }, 100);
  }, [stopElapsedTimer]);

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();

    for (const track of streamRef.current?.getTracks() ?? []) {
      track.stop();
    }

    mediaRecorderRef.current = null;
    streamRef.current = null;
    setStream(null);
    setRecorderStatus("idle");
    pausedElapsedSecondsRef.current = 0;
    elapsedStartedAtRef.current = null;
    stopElapsedTimer();
  }, [stopElapsedTimer]);

  const startRecording = useCallback(async () => {
    if (!opfsAvailable) {
      const message = "OPFS support is required before recording can begin.";
      setLastPipelineError(message);
      setRecorderStatus("error");
      return;
    }

    setRecorderStatus("requesting");

    try {
      const userMedia = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      const mimeType = getPreferredMimeType();
      const recorder = mimeType ? new MediaRecorder(userMedia, { mimeType }) : new MediaRecorder(userMedia);

      recorder.addEventListener("dataavailable", (event: BlobEvent) => {
        if (event.data.size === 0) {
          return;
        }

        void enqueueChunk({
          blob: event.data,
          source: "recording",
        });
      });

      recorder.addEventListener("stop", () => {
        setRecorderStatus("idle");
      });

      recorder.start(env.NEXT_PUBLIC_CHUNK_DURATION_MS);
      streamRef.current = userMedia;
      mediaRecorderRef.current = recorder;
      pausedElapsedSecondsRef.current = 0;
      setElapsedSeconds(0);
      setStream(userMedia);
      setRecorderStatus("recording");
      startElapsedTimer();
    } catch (error) {
      setRecorderStatus("error");
      setLastPipelineError(getErrorMessage(error));
    }
  }, [enqueueChunk, opfsAvailable, startElapsedTimer]);

  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state !== "recording") {
      return;
    }

    mediaRecorderRef.current.pause();

    if (elapsedStartedAtRef.current) {
      pausedElapsedSecondsRef.current += (Date.now() - elapsedStartedAtRef.current) / 1000;
    }

    elapsedStartedAtRef.current = null;
    stopElapsedTimer();
    setRecorderStatus("paused");
  }, [stopElapsedTimer]);

  const resumeRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state !== "paused") {
      return;
    }

    mediaRecorderRef.current.resume();
    setRecorderStatus("recording");
    startElapsedTimer();
  }, [startElapsedTimer]);

  const generateSyntheticChunk = useCallback(async () => {
    await enqueueChunk({
      source: "synthetic",
      text: createSyntheticPayload(),
    });
  }, [enqueueChunk]);

  const pruneVerifiedChunks = useCallback(async () => {
    const verifiedChunks = chunkRecords.filter((record) => record.syncState === "acked" && record.verifiedAt);

    for (const record of verifiedChunks) {
      await deleteChunkFromOPFS(record.chunkId);
      removeChunkRecord(record.chunkId);
    }
  }, [chunkRecords, removeChunkRecord]);

  const refreshFromOpfs = useCallback(async () => {
    await hydrateFromOpfs();
    void repairMismatches();
    void pumpUploadQueue();
  }, [hydrateFromOpfs, pumpUploadQueue, repairMismatches]);

  useEffect(() => {
    setOpfsAvailable(isOpfsSupported());
    void hydrateFromOpfs();

    return () => {
      stopElapsedTimer();

      for (const track of streamRef.current?.getTracks() ?? []) {
        track.stop();
      }
    };
  }, [hydrateFromOpfs, stopElapsedTimer]);

  useEffect(() => {
    if (!hydrationComplete) {
      return;
    }

    void pumpUploadQueue();
    void repairMismatches();
  }, [hydrationComplete, pumpUploadQueue, repairMismatches]);

  useEffect(() => {
    if (!hydrationComplete) {
      return;
    }

    const retryTimer = setInterval(() => {
      void pumpUploadQueue();
    }, env.NEXT_PUBLIC_RETRY_INTERVAL_MS);

    const reconciliationTimer = setInterval(() => {
      void repairMismatches();
    }, env.NEXT_PUBLIC_RECONCILIATION_INTERVAL_MS);

    const summaryTimer = setInterval(() => {
      void updateServerSummary();
    }, env.NEXT_PUBLIC_RECONCILIATION_INTERVAL_MS);

    return () => {
      clearInterval(retryTimer);
      clearInterval(reconciliationTimer);
      clearInterval(summaryTimer);
    };
  }, [hydrationComplete, pumpUploadQueue, repairMismatches, updateServerSummary]);

  const counts = useMemo<RecorderPipelineCounts>(() => {
    const nextCounts: RecorderPipelineCounts = {
      acked: 0,
      buffered: 0,
      error: 0,
      opfs: chunkRecords.length,
      repairing: 0,
      uploading: 0,
      verified: 0,
    };

    for (const record of chunkRecords) {
      if (record.verifiedAt) {
        nextCounts.verified += 1;
      }

      if (record.syncState === "acked") {
        nextCounts.acked += 1;
      }

      if (record.syncState === "buffered") {
        nextCounts.buffered += 1;
      }

      if (record.syncState === "error") {
        nextCounts.error += 1;
      }

      if (record.syncState === "repairing") {
        nextCounts.repairing += 1;
      }

      if (record.syncState === "uploading") {
        nextCounts.uploading += 1;
      }
    }

    return nextCounts;
  }, [chunkRecords]);

  return {
    chunkRecords,
    counts,
    elapsedSeconds,
    generateSyntheticChunk,
    hydrationComplete,
    lastMismatchCount,
    lastPipelineError,
    opfsAvailable,
    pauseRecording,
    pruneVerifiedChunks,
    recorderStatus,
    refreshFromOpfs,
    resumeRecording,
    serverSummary,
    startRecording,
    stopRecording,
    stream,
  };
}
