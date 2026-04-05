import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  client: {
    NEXT_PUBLIC_CHUNK_DURATION_MS: z.coerce.number().int().positive().default(5000),
    NEXT_PUBLIC_RECONCILIATION_INTERVAL_MS: z.coerce.number().int().positive().default(10000),
    NEXT_PUBLIC_RETRY_INTERVAL_MS: z.coerce.number().int().positive().default(4000),
    NEXT_PUBLIC_SERVER_URL: z.url(),
  },
  emptyStringAsUndefined: true,
  runtimeEnv: {
    NEXT_PUBLIC_CHUNK_DURATION_MS: process.env.NEXT_PUBLIC_CHUNK_DURATION_MS,
    NEXT_PUBLIC_RECONCILIATION_INTERVAL_MS: process.env.NEXT_PUBLIC_RECONCILIATION_INTERVAL_MS,
    NEXT_PUBLIC_RETRY_INTERVAL_MS: process.env.NEXT_PUBLIC_RETRY_INTERVAL_MS,
    NEXT_PUBLIC_SERVER_URL: process.env.NEXT_PUBLIC_SERVER_URL,
  },
});
