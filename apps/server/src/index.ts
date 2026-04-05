import type { StatusCode } from "hono/utils/http-status";
import { env } from "@my-better-t-app/env/server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { z } from "zod";

import { findMissingChunkIds, getPipelineSummary, persistChunkAndAck } from "./lib/chunk-service";

const app = new Hono();
const uploadChunkPayloadSchema = z.object({
  chunkId: z.string().min(1),
  contentType: z.string().min(1).default("application/octet-stream"),
  createdAt: z.string().datetime().default(() => new Date().toISOString()),
  data: z.string().min(1),
  encoding: z.enum(["base64", "utf-8"]).default("utf-8"),
});

function jsonErrorResponse(
  message: string,
  status: StatusCode,
  issues?: z.ZodIssue[],
) {
  return Response.json(
    {
      error: message,
      issues,
    },
    {
      status,
    },
  );
}

function decodeChunkBody(data: string, encoding: "base64" | "utf-8") {
  if (encoding === "base64") {
    return Buffer.from(data, "base64");
  }

  return Buffer.from(data, "utf-8");
}

app.use(logger());
app.use(
  "/*",
  cors({
    allowMethods: ["GET", "POST", "OPTIONS"],
    origin: env.CORS_ORIGIN,
  }),
);

app.get("/", (c) => c.json({
    ok: true,
    service: "reliable-recording-pipeline",
  }));

app.post("/api/chunks/upload", async (c) => {
  const rawPayload = await c.req.json();
  const parseResult = uploadChunkPayloadSchema.safeParse(rawPayload);

  if (!parseResult.success) {
    return jsonErrorResponse("Invalid chunk upload payload.", 400, parseResult.error.issues);
  }

  const payload = parseResult.data;
  const chunkBody = decodeChunkBody(payload.data, payload.encoding);

  await persistChunkAndAck({
    body: chunkBody,
    chunkId: payload.chunkId,
    contentType: payload.contentType,
    createdAt: payload.createdAt,
  });

  return c.json({
    bucketSynced: true,
    chunkId: payload.chunkId,
    dbAcked: true,
    ok: true,
  });
});

app.get("/api/chunks/mismatches", async (c) => {
  const url = new URL(c.req.url);
  const chunkIds = url.searchParams.getAll("chunkId").filter((chunkId) => chunkId.length > 0);
  const reconciliation = await findMissingChunkIds(chunkIds);

  return c.json({
    ok: true,
    ...reconciliation,
  });
});

app.get("/api/chunks/summary", async (c) => {
  const summary = await getPipelineSummary();

  return c.json({
    ok: true,
    ...summary,
  });
});

app.onError((error, c) => c.json(
    {
      error: error.message,
    },
    500,
  ));

const server = Bun.serve({
  fetch: app.fetch,
  port: env.PORT,
});

export default server;
