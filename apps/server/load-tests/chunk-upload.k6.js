import http from "k6/http";
import { check } from "k6";

const targetUrl = __ENV.TARGET_URL ?? "http://localhost:3000/api/chunks/upload";

export const options = {
  scenarios: {
    chunk_uploads: {
      duration: "1m",
      executor: "constant-arrival-rate",
      maxVUs: 1500,
      preAllocatedVUs: 500,
      rate: 5000,
      timeUnit: "1s",
    },
  },
  thresholds: {
    http_req_duration: ["p(95)<250"],
    http_req_failed: ["rate<0.001"],
  },
};

export default function () {
  const payload = JSON.stringify({
    chunkId: `chunk-${__VU}-${__ITER}`,
    contentType: "text/plain; charset=utf-8",
    data: "x".repeat(1024),
    encoding: "utf-8",
  });

  const response = http.post(targetUrl, payload, {
    headers: {
      "Content-Type": "application/json",
    },
  });

  check(response, {
    "status is 200": (result) => result.status === 200,
  });
}
