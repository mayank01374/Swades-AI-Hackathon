import Link from "next/link";
import { ArrowRight, Database, HardDriveDownload, Server, Waves } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@my-better-t-app/ui/components/card";

const PIPELINE_STEPS = [
  {
    description: "The browser records audio and immediately writes each chunk into OPFS before any upload.",
    icon: HardDriveDownload,
    title: "Durable browser buffer",
  },
  {
    description: "Hono receives the chunk, writes it to the bucket, and only then persists the acknowledgment row in PostgreSQL.",
    icon: Server,
    title: "Bucket-first server ack",
  },
  {
    description: "The browser polls for mismatches and can re-upload missing bucket objects from its retained OPFS copy.",
    icon: Database,
    title: "Self-healing reconciliation",
  },
] as const;

export default function Home() {
  return (
    <div className="min-h-full bg-[linear-gradient(180deg,rgba(14,165,233,0.08),transparent_20%),radial-gradient(circle_at_top_left,rgba(56,189,248,0.15),transparent_28%)]">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 md:px-6">
        <Card className="border border-border/60 bg-background/85 backdrop-blur">
          <CardHeader className="border-b border-border/50 pb-5">
            <CardDescription className="uppercase tracking-[0.25em] text-[11px]">
              Swades AI hackathon
            </CardDescription>
            <CardTitle className="max-w-4xl text-4xl font-semibold tracking-tight">
              Reliable recording chunking pipeline with OPFS durability, bucket reconciliation, and
              DB acknowledgments
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-6 pt-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)]">
            <div className="space-y-4 text-sm text-muted-foreground">
              <p>
                This build focuses on zero silent failures. Chunks are durably buffered in the
                browser first, uploaded second, acknowledged in PostgreSQL only after storage
                succeeds, and retained locally long enough to repair bucket drift.
              </p>
              <p>
                Open the recorder dashboard to generate real microphone chunks or 1 KB synthetic
                chunks, inspect OPFS state, and exercise retry and reconciliation loops.
              </p>
              <Link
                href="/recorder"
                className="inline-flex h-9 items-center gap-2 border border-transparent bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Open pipeline dashboard
                <ArrowRight className="size-4" />
              </Link>
            </div>
            <div className="border border-border/50 px-4 py-4">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Waves className="size-4" />
                What is included
              </div>
              <div className="mt-4 grid gap-3 text-sm text-muted-foreground">
                <div>Typed Drizzle chunk schema with pooled PostgreSQL access.</div>
                <div>Hono upload, mismatch, and summary APIs backed by an S3-compatible bucket.</div>
                <div>
                  Typed OPFS utilities, retry queue, mismatch repair loop, and a live Next.js
                  dashboard.
                </div>
                <div>Load-test scripts for 300,000 requests in 60 seconds plus a verification helper.</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <section className="grid gap-4 md:grid-cols-3">
          {PIPELINE_STEPS.map(({ description, icon: Icon, title }) => (
            <Card key={title} className="border border-border/60 bg-background/85">
              <CardHeader className="border-b border-border/50 pb-4">
                <CardDescription className="flex items-center gap-2 uppercase tracking-[0.18em]">
                  <Icon className="size-3.5" />
                  {title}
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-4 text-sm text-muted-foreground">{description}</CardContent>
            </Card>
          ))}
        </section>
      </div>
    </div>
  );
}
