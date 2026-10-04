import { NextResponse } from "next/server";
import { db, loadRoom, RoomError } from "@/lib/server";
import { SHOT_GAME_STRIDE } from "@/lib/shots";

type Params = { params: Promise<{ id: string }> };

/**
 * The night's drawings, kept server-side so every player sees the same
 * gallery — including anyone who joined late or refreshed mid-game.
 */
export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  try {
    // only the game that just ended — earlier games in this room are in the
    // gallery, and a not-yet-tidied one must not leak into this one's photos
    const { state } = await loadRoom(id.toLowerCase());
    const game = state.game ?? 0;
    const { data, error } = await db
      .from("doodle_shots")
      .select("turn, word, drawer_id, image")
      .eq("room_id", id.toLowerCase())
      .gte("turn", game * SHOT_GAME_STRIDE)
      .lt("turn", (game + 1) * SHOT_GAME_STRIDE)
      .order("turn", { ascending: true })
      // a draw-a-thon keeps one per player per round
      .limit(120);
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
