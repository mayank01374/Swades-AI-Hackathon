# Reliable Recording Chunking Pipeline

A hackathon project for building a durable chunking pipeline with browser-side OPFS buffering, backend acknowledgments, and storage/database reconciliation.

## Goal

The system is designed to avoid silent failures and data loss:

1. The browser records and chunks data.
2. Every chunk is written to OPFS before any upload.
3. The backend stores the chunk.
4. Only after storage succeeds does the backend write a PostgreSQL acknowledgment.
5. The client can re-upload retained chunks if storage and DB drift out of sync.

## Tech Stack

- Next.js frontend in `apps/web`
- Hono + Bun backend in `apps/server`
- Drizzle ORM + PostgreSQL in `packages/db`
- Turborepo monorepo

## Storage Modes

The backend supports two storage modes:

- `Local storage fallback`
  The default mode. If `S3_*` environment variables are not provided, uploaded chunks are stored on local disk.
- `S3-compatible object storage`
  If all required `S3_*` values are provided, the backend stores chunks in object storage such as MinIO, Cloudflare R2, or AWS S3.

This makes the project hackathon-friendly: it works without external object storage, but can switch to real object storage later using environment variables only.

## Local Setup

Install dependencies:

```bash
npm install
```

Copy environment files:

```bash
cp apps/server/.env.example apps/server/.env
cp apps/web/.env.example apps/web/.env.local
```

Configure the backend:

- `DATABASE_URL` must point to PostgreSQL.
- `LOCAL_STORAGE_DIR` controls where chunks are stored when object storage is not configured.
- Leave `S3_*` values empty to use local disk storage.
- Fill `S3_*` values to use object storage instead.

Apply the schema:

```bash
npm run db:push
```

Run development:

```bash
npm run dev
```

Apps:

- Web: `http://localhost:3001`
- Server: `http://localhost:3000`

## What The App Does

- Records microphone audio in the browser with `MediaRecorder`
- Persists every chunk into OPFS before upload
- Uploads chunks to the backend API
- Stores chunk data first, then writes PostgreSQL acknowledgments
- Retains acknowledged OPFS copies for repair
- Reconciles storage vs DB and re-uploads missing chunks from OPFS

## Environment Variables

### Frontend

Required for `apps/web`:

- `NEXT_PUBLIC_SERVER_URL`
- `NEXT_PUBLIC_CHUNK_DURATION_MS`
- `NEXT_PUBLIC_RECONCILIATION_INTERVAL_MS`
- `NEXT_PUBLIC_RETRY_INTERVAL_MS`

### Backend

Required for `apps/server`:

- `DATABASE_URL`
- `DATABASE_POOL_MAX`
- `CORS_ORIGIN`
- `LOCAL_STORAGE_DIR`
- `PORT`

Optional for object storage:

- `S3_BUCKET_NAME`
- `S3_ENDPOINT`
- `S3_REGION`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`
- `S3_FORCE_PATH_STYLE`

Backend behavior:

- If `S3_*` values are present, object storage is used.
- If `S3_*` values are missing, local disk storage is used automatically.

## Deployment Notes

### Frontend

Deploy `apps/web` to Vercel.

### Backend

Deploy `apps/server` to any Bun-compatible host.

For hackathon evaluation, the backend can run with:

- PostgreSQL provided by organizers
- local disk storage only

Or, if organizers want, they can additionally connect:

- Cloudflare R2
- AWS S3
- MinIO
- any S3-compatible store

After infrastructure is connected, run:

```bash
npm run db:push
```

## Load Testing

Example k6 run:

```bash
k6 run apps/server/load-tests/chunk-upload.k6.js
```

Verify after the reconciliation loop settles:

```bash
node apps/server/load-tests/verify-summary.mjs
```

Validate:

- every DB acknowledgment has a matching chunk in the configured storage backend
- OPFS recovery survives retry scenarios
- reconciliation repairs storage/DB mismatches
- the backend sustains target throughput for the test environment

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
