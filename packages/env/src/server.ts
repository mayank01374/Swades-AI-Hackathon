import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  emptyStringAsUndefined: true,
  runtimeEnv: process.env,
  server: {
    CORS_ORIGIN: z.url(),
    DATABASE_POOL_MAX: z.coerce.number().int().positive().default(30),
    DATABASE_URL: z.string().min(1),
    LOCAL_STORAGE_DIR: z.string().min(1).default("./data/chunks"),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    PORT: z.coerce.number().int().positive().default(3000),
    S3_ACCESS_KEY_ID: z.string().min(1).optional(),
    S3_BUCKET_NAME: z.string().min(1).optional(),
    S3_ENDPOINT: z.url().optional(),
    S3_FORCE_PATH_STYLE: z
      .enum(["true", "false"])
      .default("true")
      .transform((value) => value === "true"),
    S3_REGION: z.string().min(1).default("us-east-1"),
    S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  },
});
