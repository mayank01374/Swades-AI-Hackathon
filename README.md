# Reliable Recording Chunking Pipeline

An assignment for building a reliable chunking setup that ensures recording data stays accurate in all cases — no data loss, no silent failures.

## How It Works

```
Client (Browser)
    │
    ├── 1. Record & chunk data on the client side
    ├── 2. Store chunks in OPFS (Origin Private File System)
    ├── 3. Upload chunks to a storage bucket
    ├── 4. On success → acknowledge (ack) to the database
    │
    └── Recovery: if DB has ack but chunk is missing from bucket
        └── Re-send from OPFS → bucket
```

**Main objective:** In all cases, the recording data stays accurate. OPFS acts as the durable client-side buffer — chunks are only cleared after the bucket and DB are both confirmed in sync.

### Flow Details

1. **Client-side chunking** — Recording data is split into chunks in the browser
2. **OPFS storage** — Each chunk is persisted to the Origin Private File System before any network call, so nothing is lost if the tab closes or the network drops
3. **Bucket upload** — Chunks are uploaded to a storage bucket (can be a local bucket for testing, e.g. MinIO or a local S3-compatible store)
4. **DB acknowledgment** — Once the bucket confirms receipt, an ack record is written to the database
5. **Reconciliation** — If the DB shows an ack but the chunk is missing from the bucket (e.g. bucket purge, replication lag), the client re-uploads from OPFS to restore consistency

## Tech Stack

- **Next.js** — Frontend (App Router)
- **Hono** — Backend API server
- **Bun** — Runtime
- **Drizzle ORM + PostgreSQL** — Database
- **TailwindCSS + shadcn/ui** — UI
- **Turborepo** — Monorepo build system

## Getting Started

```bash
npm install
```

### Environment Setup

1. Copy `apps/server/.env.example` to `apps/server/.env`.
2. Copy `apps/web/.env.example` to `apps/web/.env.local`.
3. Point the server env at your PostgreSQL instance and your S3-compatible bucket (MinIO works well for local development).
4. Apply the schema:

```bash
npm run db:push
```

### Run Development

```bash
npm run dev
```

- Web app: [http://localhost:3001](http://localhost:3001)
- API server: [http://localhost:3000](http://localhost:3000)

### What The App Now Does

- Records microphone audio in the browser with `MediaRecorder`
- Persists every chunk into OPFS before attempting an upload
- Uploads chunks to the Hono API as JSON payloads
- Writes bucket objects first, then PostgreSQL acknowledgment rows
- Retains acknowledged local copies for reconciliation repair
- Periodically checks for DB rows missing from the bucket and re-uploads the missing chunks from OPFS

## Load Testing

Target: **300,000 requests** to validate the chunking pipeline under heavy load.

### Setup

Use a load testing tool like [k6](https://k6.io), [autocannon](https://github.com/mcollina/autocannon), or [artillery](https://artillery.io) to simulate concurrent chunk uploads.

Example with **k6**:

```js
import http from "k6/http";
import { check } from "k6";

export const options = {
  scenarios: {
    chunk_uploads: {
      executor: "constant-arrival-rate",
      rate: 5000,           // 5,000 req/s
      timeUnit: "1s",
      duration: "1m",       // → 300K requests in 60s
      preAllocatedVUs: 500,
      maxVUs: 1000,
    },
  },
};

export default function () {
  const payload = JSON.stringify({
    chunkId: `chunk-${__VU}-${__ITER}`,
    data: "x".repeat(1024), // 1KB dummy chunk
  });

  const res = http.post("http://localhost:3000/api/chunks/upload", payload, {
    headers: { "Content-Type": "application/json" },
  });

  check(res, {
    "status 200": (r) => r.status === 200,
  });
}
```

Run:

```bash
k6 run apps/server/load-tests/chunk-upload.k6.js
```

Verify after the reconciliation loop settles:

```bash
node apps/server/load-tests/verify-summary.mjs
```

### What to Validate

- **No data loss** — every ack in the DB has a matching chunk in the bucket
- **OPFS recovery** — chunks survive client disconnects and can be re-uploaded
- **Throughput** — server handles sustained 5K req/s without dropping chunks
- **Consistency** — reconciliation catches and repairs any bucket/DB mismatches after the run

## Project Structure

```
recoding-assignment/
├── apps/
│   ├── web/         # Frontend (Next.js) — chunking, OPFS, upload logic
│   └── server/      # Backend API (Hono) — bucket upload, DB ack
├── packages/
│   ├── ui/          # Shared shadcn/ui components and styles
│   ├── db/          # Drizzle ORM schema & queries
│   ├── env/         # Type-safe environment config
│   └── config/      # Shared TypeScript config
```

## Available Scripts

- `npm run dev` — Start all apps in development mode
- `npm run build` — Build all apps
- `npm run dev:web` — Start only the web app
- `npm run dev:server` — Start only the server
- `npm run check-types` — TypeScript type checking
- `npm run db:push` — Push schema changes to database
- `npm run db:generate` — Generate database client/types
- `npm run db:migrate` — Run database migrations
- `npm run db:studio` — Open database studio UI
