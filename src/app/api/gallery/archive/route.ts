import { NextRequest, NextResponse } from "next/server";
import { archiveShots } from "@/lib/gallery";

export const maxDuration = 60;

/**
 * The nightly sweep (see vercel.json) and the backfill: archives every shot
 * the after() hooks missed. Loops in batches until the queue is empty or the
 * time budget is nearly spent; the next run picks up anything left.
 *
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET` when that env var is
 * set, so with it set nobody else can make this run.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const started = Date.now();
  let archived = 0;
  let failed = 0;
  let remaining = true;
  try {
    while (remaining && Date.now() - started < 45_000) {
      const r = await archiveShots({ limit: 50 });
      archived += r.archived;
      failed += r.failed;
      // a batch that only failed would loop on the same rows forever
      remaining = r.remaining && r.archived > 0;
    }
    return NextResponse.json({ archived, failed, remaining });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message, archived, failed },
      { status: 500 }
    );
  }
}
