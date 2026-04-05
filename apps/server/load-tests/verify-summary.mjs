const summaryUrl = process.env.SUMMARY_URL ?? "http://localhost:3000/api/chunks/summary";

async function main() {
  const response = await fetch(summaryUrl, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Summary request failed with status ${response.status}.`);
  }

  const payload = await response.json();

  if (!payload.ok) {
    throw new Error("Server summary returned a failed status.");
  }

  if (payload.mismatchCount > 0) {
    throw new Error(`Found ${payload.mismatchCount} DB-to-bucket mismatches after reconciliation.`);
  }

  process.stdout.write(
    `Verified ${payload.ackedChunkRecords} acknowledged chunks with zero outstanding mismatches.\n`,
  );
}

await main();
