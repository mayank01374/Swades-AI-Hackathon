# Reliable Recording Chunking Pipeline

This project implements a durable recording pipeline for the hackathon requirement:

- chunks are created in the browser
- every chunk is saved to OPFS before upload
- the backend stores the chunk first
- PostgreSQL is acknowledged only after storage succeeds
- the client can reconcile and repair missing stored chunks from OPFS

## Submission Overview

Current deployment model:

- frontend deployed on `Vercel`
- backend deployed on `Railway`
- PostgreSQL deployed on `Railway`
- object storage is optional

Default backend behavior:

- if no object-storage environment variables are provided, uploaded chunks are stored locally on the backend filesystem
- if `S3_*` environment variables are provided, the backend automatically switches to S3-compatible object storage such as Cloudflare R2, AWS S3, or MinIO

This means the project works for hackathon evaluation even without external object storage.

## Core Flow

1. The browser records data and splits it into chunks.
2. Each chunk is written to OPFS immediately.
3. The chunk is uploaded to the backend API.
4. The backend stores the chunk in the active storage backend.
5. Only after storage succeeds does the backend write the PostgreSQL acknowledgment row.
6. The client retains acknowledged OPFS copies long enough to repair storage mismatches.
7. The reconciliation loop checks for DB rows that are missing in storage and re-uploads them from OPFS.

## Tech Stack

- `apps/web`: Next.js frontend
- `apps/server`: Hono API running on Bun
- `packages/db`: Drizzle ORM + PostgreSQL schema/client
- `packages/env`: shared environment validation
- `packages/ui`: shared UI components
- `Turborepo`: monorepo orchestration

## Deployment Architecture

### Frontend

Deploy `apps/web` to Vercel.

Required frontend environment variables:

- `NEXT_PUBLIC_SERVER_URL`
- `NEXT_PUBLIC_CHUNK_DURATION_MS`
- `NEXT_PUBLIC_RECONCILIATION_INTERVAL_MS`
- `NEXT_PUBLIC_RETRY_INTERVAL_MS`

### Backend

Deploy `apps/server` to Railway or another Bun-compatible host.

Required backend environment variables:

- `DATABASE_URL`
- `DATABASE_POOL_MAX`
- `CORS_ORIGIN`
- `LOCAL_STORAGE_DIR`
- `PORT`

Optional object-storage environment variables:

- `S3_BUCKET_NAME`
- `S3_ENDPOINT`
- `S3_REGION`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`
- `S3_FORCE_PATH_STYLE`

Backend storage behavior:

- if all required `S3_*` values are present, object storage is used
- if `S3_*` values are omitted, local disk storage is used automatically

## Environment Setup

### Frontend `.env.local`

Copy:

```bash
cp apps/web/.env.example apps/web/.env.local
```

Expected values:

```env
NEXT_PUBLIC_SERVER_URL=https://your-backend-domain
NEXT_PUBLIC_CHUNK_DURATION_MS=5000
NEXT_PUBLIC_RECONCILIATION_INTERVAL_MS=10000
NEXT_PUBLIC_RETRY_INTERVAL_MS=4000
```

### Backend `.env`

Copy:

```bash
cp apps/server/.env.example apps/server/.env
```

### Option A: Use the existing Railway PostgreSQL connection

If PostgreSQL is already connected on Railway, set:

```env
DATABASE_URL=<railway-postgres-url>
DATABASE_POOL_MAX=30
CORS_ORIGIN=https://your-vercel-domain
LOCAL_STORAGE_DIR=./data/chunks
PORT=3000
```

Leave all `S3_*` variables empty if you want local storage.

### Option B: Connect your own PostgreSQL database

If you want to use your own database instead of Railway PostgreSQL:

1. provision a PostgreSQL database
2. copy its connection string
3. replace `DATABASE_URL` with your own value
4. keep the rest of the backend variables the same
5. run schema push:

```bash
npm run db:push
```

Example:

```env
DATABASE_URL=postgresql://user:password@host:5432/dbname
DATABASE_POOL_MAX=30
CORS_ORIGIN=https://your-vercel-domain
LOCAL_STORAGE_DIR=./data/chunks
PORT=3000
```

### Option C: Connect object storage later

If you want to switch from local backend storage to object storage, add the `S3_*` variables:

```env
S3_BUCKET_NAME=recording-chunks
S3_ENDPOINT=https://your-object-storage-endpoint
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=your-access-key
S3_SECRET_ACCESS_KEY=your-secret-key
S3_FORCE_PATH_STYLE=false
```

Supported object-storage targets:

- Cloudflare R2
- AWS S3
- MinIO
- any S3-compatible bucket

If these variables are not supplied, the backend continues using local storage automatically.

## Local Development

Install dependencies:

```bash
npm install
```

Copy env files:

```bash
cp apps/server/.env.example apps/server/.env
cp apps/web/.env.example apps/web/.env.local
```

Apply the schema:

```bash
npm run db:push
```

Run both apps:

```bash
npm run dev
```

Local URLs:

- frontend: `http://localhost:3001`
- backend: `http://localhost:3000`

## Runtime Behavior

What the app does:

- records microphone audio in the browser using `MediaRecorder`
- persists every chunk into OPFS before any network call
- uploads chunks to the backend as JSON payloads
- stores chunk data before writing PostgreSQL acknowledgments
- keeps acknowledged local OPFS copies for mismatch repair
- periodically checks storage vs DB consistency and repairs missing chunks

What the backend root endpoint returns:

```json
{
  "bucketDriver": "local",
  "ok": true,
  "service": "reliable-recording-pipeline"
}
```

If object storage is enabled, `bucketDriver` becomes `s3`.

## Verification Steps

### Basic verification

1. Open the deployed frontend.
2. Go to `/recorder`.
3. Generate a `1 KB test chunk`.
4. Confirm the chunk appears in OPFS and is acknowledged by the server.
5. Confirm a row is written into PostgreSQL.

### Recovery verification

1. Upload a chunk successfully.
2. Remove the corresponding stored chunk from the active storage backend.
3. Trigger the reconciliation loop or wait for the retry interval.
4. Confirm the client re-uploads the missing chunk from OPFS.

### Storage-mode verification

To verify local storage mode:

- omit all `S3_*` variables
- confirm `/` returns `"bucketDriver": "local"`

To verify object-storage mode:

- provide all `S3_*` variables
- redeploy
- confirm `/` returns `"bucketDriver": "s3"`

## Load Testing

k6 script:

```bash
k6 run apps/server/load-tests/chunk-upload.k6.js
```

Post-run verification:

```bash
node apps/server/load-tests/verify-summary.mjs
```

Things to validate:

- every DB acknowledgment has a matching chunk in the configured storage backend
- OPFS recovery survives retry scenarios
- reconciliation repairs storage/DB mismatches
- the backend sustains the target throughput for the chosen environment

## Project Structure

```text
apps/
  web/        Next.js frontend
  server/     Hono + Bun backend
packages/
  db/         Drizzle schema and DB client
  env/        Shared environment validation
  ui/         Shared UI components
  config/     Shared TypeScript config
```

## Useful Scripts

- `npm run dev`
- `npm run build`
- `npm run check-types`
- `npm run db:push`
- `npm run db:generate`
- `npm run db:migrate`
- `npm run db:studio`
