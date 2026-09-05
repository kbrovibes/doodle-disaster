import { NextResponse } from "next/server";
import { db, RoomError } from "@/lib/server";

type Params = { params: Promise<{ id: string }> };

/**
 * The night's drawings, kept server-side so every player sees the same
 * gallery — including anyone who joined late or refreshed mid-game.
 */
export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  try {
    const { data, error } = await db
      .from("doodle_shots")
      .select("turn, word, drawer_id, image")
      .eq("room_id", id.toLowerCase())
      .order("turn", { ascending: true })
      .limit(24);
    if (error) throw new RoomError(error.message, 500);
    return NextResponse.json({
      shots: (data ?? []).map((r) => ({
        turn: r.turn as number,
        word: r.word as string,
        drawerId: r.drawer_id as string,
        image: r.image as string,
      })),
    });
  } catch (e) {
    const maybe = (e as { status?: number }).status;
    return NextResponse.json(
      { error: (e as Error).message },
      { status: typeof maybe === "number" ? maybe : 500 }
    );
  }
}
