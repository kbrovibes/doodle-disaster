import { NextResponse } from "next/server";
import { readStats } from "@/lib/server";

/**
 * Numbers for the home screen footer. Public, anonymous, and deliberately
 * coarse — two integers, no room ids, nothing about who is playing.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const stats = await readStats();
    return NextResponse.json(stats, {
      // a minute of staleness is invisible in a footer and keeps a busy night
      // from turning every home-screen visit into two database queries
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
    });
  } catch {
    return NextResponse.json({ played: 0, live: 0 });
  }
}
