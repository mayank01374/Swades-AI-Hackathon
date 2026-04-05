"use client";

import Link from "next/link";
import {
  Activity,
  CircleAlert,
  CircleCheckBig,
  Database,
  HardDriveDownload,
  Mic,
  Pause,
  Play,
  RefreshCcw,
  Server,
  Square,
  Trash2,
  Waves,
} from "lucide-react";

import { Button } from "@my-better-t-app/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@my-better-t-app/ui/components/card";
import { LiveWaveform } from "@/components/ui/live-waveform";
import { useReliableRecorder } from "@/hooks/use-reliable-recorder";
import type { StoredChunkRecord } from "@/lib/chunk-types";

function formatElapsed(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  const deciseconds = Math.floor((seconds % 1) * 10);

  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}.${deciseconds}`;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTimestamp(value: string | null) {
  if (!value) {
    return "Pending";
  }

  return new Date(value).toLocaleTimeString();
}

function getStatusTone(syncState: StoredChunkRecord["syncState"]) {
  if (syncState === "acked") {
    return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300";
  }

  if (syncState === "error") {
    return "bg-rose-500/10 text-rose-600 dark:text-rose-300";
  }

  if (syncState === "repairing") {
    return "bg-amber-500/10 text-amber-600 dark:text-amber-300";
  }

  if (syncState === "uploading") {
    return "bg-sky-500/10 text-sky-600 dark:text-sky-300";
  }

  return "bg-zinc-500/10 text-zinc-700 dark:text-zinc-300";
}

function MetricCard({
  description,
  icon: Icon,
  title,
  value,
}: {
  description: string;
  icon: typeof Activity;
  title: string;
  value: number | string;
}) {
  return (
    <Card className="border border-border/60 bg-background/80">
      <CardHeader className="border-b border-border/50 pb-4">
        <CardDescription className="flex items-center gap-2 uppercase tracking-[0.2em]">
          <Icon className="size-3.5" />
          {title}
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-4">
        <div className="text-2xl font-semibold tracking-tight">{value}</div>
        <p className="mt-2 text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

function ChunkRow({ record }: { record: StoredChunkRecord }) {
  return (
    <div className="grid gap-2 border-b border-border/50 px-4 py-3 last:border-b-0 md:grid-cols-[minmax(0,1.8fr)_auto_auto_auto] md:items-center">
      <div className="min-w-0">
        <div className="truncate font-medium">{record.chunkId}</div>
        <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
          <span>{record.source}</span>
          <span>{formatBytes(record.sizeBytes)}</span>
          <span>{record.contentType}</span>
          <span>attempts {record.attemptCount}</span>
        </div>
      </div>
      <div
        className={`inline-flex w-fit items-center rounded-full px-2 py-1 text-[11px] font-medium uppercase tracking-[0.18em] ${getStatusTone(record.syncState)}`}
      >
        {record.syncState}
      </div>
      <div className="text-[11px] text-muted-foreground">
        <div>acked {formatTimestamp(record.serverAckedAt)}</div>
        <div>verified {formatTimestamp(record.verifiedAt)}</div>
      </div>
      <div className="text-[11px] text-muted-foreground">
        {record.lastError ?? "No pipeline errors recorded."}
      </div>
    </div>
  );
}

export default function RecorderDashboard() {
  const {
    chunkRecords,
    counts,
    elapsedSeconds,
    generateSyntheticChunk,
    hydrationComplete,
    lastMismatchCount,
    lastPipelineError,
    opfsAvailable,
    pauseRecording,
    pruneVerifiedChunks,
    recorderStatus,
    refreshFromOpfs,
    resumeRecording,
    serverSummary,
    startRecording,
    stopRecording,
    stream,
  } = useReliableRecorder();

  const isActive = recorderStatus === "recording" || recorderStatus === "paused";
  const isPaused = recorderStatus === "paused";

  return (
    <div className="min-h-full bg-[radial-gradient(circle_at_top,rgba(14,165,233,0.12),transparent_35%),linear-gradient(180deg,rgba(15,23,42,0.02),transparent_28%),linear-gradient(135deg,rgba(226,232,240,0.45),transparent_40%)]">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 md:px-6">
        <section className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(22rem,0.9fr)]">
          <Card className="border border-border/60 bg-background/85 backdrop-blur">
            <CardHeader className="border-b border-border/50 pb-4">
              <CardDescription className="uppercase tracking-[0.25em] text-[11px]">
                Reliable recording chunking pipeline
              </CardDescription>
              <CardTitle className="text-3xl font-semibold tracking-tight">
                Browser recording buffered in OPFS before every upload
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-6 pt-5">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                  title="Recorder"
                  value={recorderStatus}
                  description="Microphone capture state in the browser."
                  icon={Mic}
                />
                <MetricCard
                  title="OPFS Chunks"
                  value={counts.opfs}
                  description="Durable local buffer entries still retained in OPFS."
                  icon={HardDriveDownload}
                />
                <MetricCard
                  title="Server Acks"
                  value={serverSummary?.ackedChunkRecords ?? counts.acked}
                  description="Chunks acknowledged only after bucket upload and DB write."
                  icon={Database}
                />
                <MetricCard
                  title="Mismatches"
                  value={serverSummary?.mismatchCount ?? lastMismatchCount}
                  description="DB rows missing in the bucket and queued for repair."
                  icon={Server}
                />
              </div>

              <div className="overflow-hidden border border-border/60 bg-background">
                <div className="border-b border-border/50 px-4 py-3 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  Live input waveform
                </div>
                <div className="px-3 py-4">
                  <LiveWaveform
                    active={recorderStatus === "recording"}
                    processing={recorderStatus === "paused"}
                    stream={stream}
                    height={88}
                    barWidth={3}
                    barGap={1}
                    barRadius={2}
                    sensitivity={1.8}
                    smoothingTimeConstant={0.84}
                    fadeEdges
                    fadeWidth={36}
                    mode="static"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  size="lg"
                  className="gap-2"
                  onClick={() => {
                    if (isActive) {
                      stopRecording();
                      return;
                    }

                    void startRecording();
                  }}
                  disabled={!opfsAvailable || recorderStatus === "requesting"}
                >
                  {isActive ? <Square className="size-4" /> : <Mic className="size-4" />}
                  {isActive
                    ? "Stop capture"
                    : (recorderStatus === "requesting"
                      ? "Requesting microphone"
                      : "Start capture")}
                </Button>
                {isActive ? (
                  <Button
                    size="lg"
                    variant="outline"
                    className="gap-2"
                    onClick={() => {
                      if (isPaused) {
                        resumeRecording();
                        return;
                      }

                      pauseRecording();
                    }}
                  >
                    {isPaused ? <Play className="size-4" /> : <Pause className="size-4" />}
                    {isPaused ? "Resume" : "Pause"}
                  </Button>
                ) : null}
                <Button
                  size="lg"
                  variant="outline"
                  className="gap-2"
                  onClick={() => {
                    void generateSyntheticChunk();
                  }}
                >
                  <Waves className="size-4" />
                  Generate 1 KB test chunk
                </Button>
                <Button
                  size="lg"
                  variant="ghost"
                  className="gap-2"
                  onClick={() => {
                    void refreshFromOpfs();
                  }}
                >
                  <RefreshCcw className="size-4" />
                  Retry + reconcile
                </Button>
                <Button
                  size="lg"
                  variant="ghost"
                  className="gap-2 text-destructive"
                  onClick={() => {
                    void pruneVerifiedChunks();
                  }}
                >
                  <Trash2 className="size-4" />
                  Prune verified copies
                </Button>
              </div>

              <div className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-3">
                <div className="border border-border/50 px-3 py-3">
                  <div className="text-[11px] uppercase tracking-[0.18em]">Elapsed</div>
                  <div className="mt-2 font-mono text-2xl text-foreground">
                    {formatElapsed(elapsedSeconds)}
                  </div>
                </div>
                <div className="border border-border/50 px-3 py-3">
                  <div className="text-[11px] uppercase tracking-[0.18em]">OPFS readiness</div>
                  <div className="mt-2 flex items-center gap-2 text-foreground">
                    {opfsAvailable ? (
                      <CircleCheckBig className="size-4 text-emerald-500" />
                    ) : (
                      <CircleAlert className="size-4 text-rose-500" />
                    )}
                    {opfsAvailable ? "Supported" : "Unsupported"}
                  </div>
                </div>
                <div className="border border-border/50 px-3 py-3">
                  <div className="text-[11px] uppercase tracking-[0.18em]">Hydration</div>
                  <div className="mt-2 text-foreground">
                    {hydrationComplete ? "Recovered local chunk inventory." : "Scanning OPFS..."}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border border-border/60 bg-background/85 backdrop-blur">
            <CardHeader className="border-b border-border/50 pb-4">
              <CardDescription className="uppercase tracking-[0.18em]">Durability rules</CardDescription>
              <CardTitle>Recovery-first behavior</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-5 text-sm text-muted-foreground">
              <div className="border border-border/50 px-4 py-3">
                Every chunk is written into OPFS before the browser attempts any network request.
              </div>
              <div className="border border-border/50 px-4 py-3">
                Server acknowledgments are only emitted after the chunk is in the bucket and the DB
                row is written.
              </div>
              <div className="border border-border/50 px-4 py-3">
                Acked chunks are retained locally so the reconciliation loop can repair bucket drift
                from OPFS.
              </div>
              <div className="border border-border/50 px-4 py-3">
                Verified chunks can be pruned manually once you are comfortable with the repair
                window.
              </div>
              <div className="border border-border/50 px-4 py-3">
                Load-test scripts live under{" "}
                <span className="font-mono text-foreground">apps/server/load-tests</span>.
              </div>
              <div className="pt-2 text-xs">
                <Link className="underline underline-offset-4" href="/">
                  Back to project overview
                </Link>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(22rem,0.85fr)]">
          <Card className="border border-border/60 bg-background/85">
            <CardHeader className="border-b border-border/50 pb-4">
              <CardTitle>OPFS chunk ledger</CardTitle>
              <CardDescription>
                Local chunk copies remain available for retries and reconciliation repair.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {chunkRecords.length === 0 ? (
                <div className="px-4 py-10 text-sm text-muted-foreground">
                  No local chunks yet. Start the recorder or generate a test chunk to exercise the
                  pipeline.
                </div>
              ) : (
                chunkRecords.map((record) => <ChunkRow key={record.chunkId} record={record} />)
              )}
            </CardContent>
          </Card>

          <Card className="border border-border/60 bg-background/85">
            <CardHeader className="border-b border-border/50 pb-4">
              <CardTitle>Runtime counters</CardTitle>
              <CardDescription>
                Local queue state plus the latest server reconciliation snapshot.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 pt-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <MetricCard
                  title="Buffered"
                  value={counts.buffered}
                  description="Chunks persisted locally and waiting for their next upload attempt."
                  icon={HardDriveDownload}
                />
                <MetricCard
                  title="Uploading"
                  value={counts.uploading}
                  description="Chunks currently being pushed toward the server."
                  icon={Activity}
                />
                <MetricCard
                  title="Repairing"
                  value={counts.repairing}
                  description="Chunks re-queued because DB and bucket drifted out of sync."
                  icon={RefreshCcw}
                />
                <MetricCard
                  title="Verified"
                  value={counts.verified}
                  description="Acked chunks that completed a clean reconciliation pass."
                  icon={CircleCheckBig}
                />
              </div>
              <div className="border border-border/50 px-4 py-3 text-sm">
                <div className="font-medium text-foreground">Latest pipeline note</div>
                <p className="mt-2 text-muted-foreground">
                  {lastPipelineError ?? "No active pipeline errors. Uploads and recovery are healthy."}
                </p>
              </div>
              <div className="border border-border/50 px-4 py-3 text-sm">
                <div className="font-medium text-foreground">Server totals</div>
                <div className="mt-2 grid gap-2 text-muted-foreground">
                  <div>Total DB rows: {serverSummary?.totalChunkRecords ?? 0}</div>
                  <div>
                    Bucket mismatch count: {serverSummary?.mismatchCount ?? lastMismatchCount}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
