import {
  CreateBucketCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { env } from "@my-better-t-app/env/server";

const CHUNK_KEY_PREFIX = "chunks/";

const s3Client = new S3Client({
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
  },
  endpoint: env.S3_ENDPOINT,
  forcePathStyle: env.S3_FORCE_PATH_STYLE,
  region: env.S3_REGION,
});

let bucketReadyPromise: Promise<void> | null = null;

function getObjectKey(chunkId: string) {
  return `${CHUNK_KEY_PREFIX}${chunkId}`;
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
  if (!bucketReadyPromise) {
    bucketReadyPromise = (async () => {
      try {
        await s3Client.send(
          new HeadBucketCommand({
            Bucket: env.S3_BUCKET_NAME,
          }),
        );
      } catch (error) {
        if (!isMissingBucketError(error)) {
          throw error;
        }

        await s3Client.send(
          new CreateBucketCommand({
            Bucket: env.S3_BUCKET_NAME,
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

  await s3Client.send(
    new PutObjectCommand({
      Body: input.body,
      Bucket: env.S3_BUCKET_NAME,
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

  try {
    await s3Client.send(
      new HeadObjectCommand({
        Bucket: env.S3_BUCKET_NAME,
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

  const chunkIds: string[] = [];
  let continuationToken: string | undefined;

  do {
    const response = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: env.S3_BUCKET_NAME,
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
