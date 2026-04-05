import {
  CreateBucketCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { env } from "@my-better-t-app/env/server";
import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const CHUNK_KEY_PREFIX = "chunks/";
const STORAGE_MODES = {
  local: "local",
  s3: "s3",
} as const;

type StorageMode = (typeof STORAGE_MODES)[keyof typeof STORAGE_MODES];

let bucketReadyPromise: Promise<void> | null = null;
const localStorageRoot = resolve(process.cwd(), env.LOCAL_STORAGE_DIR);

const configuredStorageMode = getStorageMode();
const s3Client =
  configuredStorageMode === STORAGE_MODES.s3
    ? new S3Client({
        credentials: {
          accessKeyId: env.S3_ACCESS_KEY_ID!,
          secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
        },
        endpoint: env.S3_ENDPOINT,
        forcePathStyle: env.S3_FORCE_PATH_STYLE,
        region: env.S3_REGION,
      })
    : null;

function getObjectKey(chunkId: string) {
  return `${CHUNK_KEY_PREFIX}${chunkId}`;
}

function getStorageMode(): StorageMode {
  const hasCompleteS3Config =
    Boolean(env.S3_ACCESS_KEY_ID) &&
    Boolean(env.S3_BUCKET_NAME) &&
    Boolean(env.S3_ENDPOINT) &&
    Boolean(env.S3_SECRET_ACCESS_KEY);

  return hasCompleteS3Config ? STORAGE_MODES.s3 : STORAGE_MODES.local;
}

function getLocalChunkPath(chunkId: string) {
  return join(localStorageRoot, CHUNK_KEY_PREFIX, chunkId);
}

function isMissingBucketError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  return error.name === "NotFound" || error.name === "NoSuchBucket";
}

function isMissingObjectError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  return error.name === "NotFound" || error.name === "NoSuchKey";
}

export async function ensureBucketExists() {
  if (configuredStorageMode === STORAGE_MODES.local) {
    await mkdir(join(localStorageRoot, CHUNK_KEY_PREFIX), {
      recursive: true,
    });
    return;
  }

  if (!bucketReadyPromise) {
    bucketReadyPromise = (async () => {
      if (!s3Client) {
        throw new Error("S3 client was not initialized.");
      }

      try {
        await s3Client.send(
          new HeadBucketCommand({
            Bucket: env.S3_BUCKET_NAME!,
          }),
        );
      } catch (error) {
        if (!isMissingBucketError(error)) {
          throw error;
        }

        await s3Client.send(
          new CreateBucketCommand({
            Bucket: env.S3_BUCKET_NAME!,
          }),
        );
      }
    })();
  }

  await bucketReadyPromise;
}

export interface BucketUploadInput {
  chunkId: string;
  body: Buffer | Uint8Array;
  contentType: string;
  createdAt: string;
}

export async function uploadChunkToBucket(input: BucketUploadInput) {
  await ensureBucketExists();

  if (configuredStorageMode === STORAGE_MODES.local) {
    const targetPath = getLocalChunkPath(input.chunkId);

    await mkdir(dirname(targetPath), {
      recursive: true,
    });
    await writeFile(targetPath, input.body);
    return;
  }

  if (!s3Client) {
    throw new Error("S3 client was not initialized.");
  }

  await s3Client.send(
    new PutObjectCommand({
      Body: input.body,
      Bucket: env.S3_BUCKET_NAME!,
      ContentLength: input.body.byteLength,
      ContentType: input.contentType,
      Key: getObjectKey(input.chunkId),
      Metadata: {
        "chunk-id": input.chunkId,
        "created-at": input.createdAt,
      },
    }),
  );
}

export async function bucketHasChunk(chunkId: string) {
  await ensureBucketExists();

  if (configuredStorageMode === STORAGE_MODES.local) {
    try {
      await stat(getLocalChunkPath(chunkId));
      return true;
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        return false;
      }

      throw error;
    }
  }

  if (!s3Client) {
    throw new Error("S3 client was not initialized.");
  }

  try {
    await s3Client.send(
      new HeadObjectCommand({
        Bucket: env.S3_BUCKET_NAME!,
        Key: getObjectKey(chunkId),
      }),
    );

    return true;
  } catch (error) {
    if (isMissingObjectError(error)) {
      return false;
    }

    throw error;
  }
}

export async function listBucketChunkIds() {
  await ensureBucketExists();

  if (configuredStorageMode === STORAGE_MODES.local) {
    const entries = await readdir(join(localStorageRoot, CHUNK_KEY_PREFIX), {
      withFileTypes: true,
    });

    return entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
  }

  if (!s3Client) {
    throw new Error("S3 client was not initialized.");
  }

  const chunkIds: string[] = [];
  let continuationToken: string | undefined;

  do {
    const response = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: env.S3_BUCKET_NAME!,
        ContinuationToken: continuationToken,
        MaxKeys: 1000,
        Prefix: CHUNK_KEY_PREFIX,
      }),
    );

    for (const item of response.Contents ?? []) {
      if (!item.Key?.startsWith(CHUNK_KEY_PREFIX)) {
        continue;
      }

      chunkIds.push(item.Key.slice(CHUNK_KEY_PREFIX.length));
    }

    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);

  return chunkIds;
}

export function getBucketDriver() {
  return configuredStorageMode;
}
