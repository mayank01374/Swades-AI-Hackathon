import type { StoredChunkRecord } from "./chunk-types";

const OPFS_DIRECTORY_NAME = "recording-chunks";

function getChunkFileName(chunkId: string) {
  return `${chunkId}.json`;
}

function wrapOpfsError(action: string, error: unknown) {
  if (error instanceof Error) {
    return new Error(`${action} failed: ${error.message}`);
  }

  return new Error(`${action} failed.`);
}

async function getChunkDirectory() {
  if (!("storage" in navigator) || typeof navigator.storage.getDirectory !== "function") {
    throw new Error("Origin Private File System is not supported in this browser.");
  }

  const rootDirectory = await navigator.storage.getDirectory();
  return rootDirectory.getDirectoryHandle(OPFS_DIRECTORY_NAME, {
    create: true,
  });
}

interface IterableDirectoryHandle extends FileSystemDirectoryHandle {
  entries(): AsyncIterable<[string, FileSystemHandle]>;
}

export function isOpfsSupported() {
  return "storage" in navigator && typeof navigator.storage.getDirectory === "function";
}

export async function saveChunkToOPFS(chunkId: string, data: StoredChunkRecord) {
  try {
    const directoryHandle = await getChunkDirectory();
    const fileHandle = await directoryHandle.getFileHandle(getChunkFileName(chunkId), {
      create: true,
    });
    const writable = await fileHandle.createWritable();

    await writable.write(JSON.stringify(data));
    await writable.close();
  } catch (error) {
    throw wrapOpfsError(`Saving chunk ${chunkId} to OPFS`, error);
  }
}

export async function readChunkFromOPFS(chunkId: string) {
  try {
    const directoryHandle = await getChunkDirectory();
    const fileHandle = await directoryHandle.getFileHandle(getChunkFileName(chunkId));
    const file = await fileHandle.getFile();
    const text = await file.text();

    return JSON.parse(text) as StoredChunkRecord;
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotFoundError") {
      return null;
    }

    throw wrapOpfsError(`Reading chunk ${chunkId} from OPFS`, error);
  }
}

export async function deleteChunkFromOPFS(chunkId: string) {
  try {
    const directoryHandle = await getChunkDirectory();
    await directoryHandle.removeEntry(getChunkFileName(chunkId));
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotFoundError") {
      return;
    }

    throw wrapOpfsError(`Deleting chunk ${chunkId} from OPFS`, error);
  }
}

export async function listAllOPFSChunks() {
  try {
    const directoryHandle = await getChunkDirectory();
    const records: StoredChunkRecord[] = [];

    const iterableDirectoryHandle = directoryHandle as IterableDirectoryHandle;

    for await (const [name, handle] of iterableDirectoryHandle.entries()) {
      if (handle.kind !== "file" || !name.endsWith(".json")) {
        continue;
      }

      const fileHandle = handle as FileSystemFileHandle;
      const file = await fileHandle.getFile();
      const text = await file.text();
      records.push(JSON.parse(text) as StoredChunkRecord);
    }

    records.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    return records;
  } catch (error) {
    throw wrapOpfsError("Listing OPFS chunks", error);
  }
}
