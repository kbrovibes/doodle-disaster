import { NextRequest, NextResponse } from "next/server";
import { newRoom, sanitize } from "@/lib/engine";
import { goofyRoomId, pickAvatar } from "@/lib/names";
import { insertRoom, RoomError } from "@/lib/server";
import { Player } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const name = String(body.name ?? "").trim().slice(0, 20);
    if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 });

    const chosen = String(body.avatar ?? "");
    const player: Player = {
      id: crypto.randomUUID(),
      name,
      avatar: /^a(\d|1\d)$/.test(chosen) ? chosen : pickAvatar([]),
      score: 0,
      connected: true,
      joinedAt: Date.now(),
    };
    const state = newRoom(player);

    let roomId = goofyRoomId();
    for (let i = 0; i < 5; i++) {
      if (await insertRoom(roomId, state)) break;
      roomId = goofyRoomId();
      if (i === 4) throw new RoomError("Could not create room", 500);
    }

    return NextResponse.json({
      roomId,
      playerId: player.id,
      state: sanitize(state, player.id, Date.now()),
    });
  } catch (e) {
    const maybe = (e as { status?: number }).status;
    const status = typeof maybe === "number" ? maybe : 500;
    return NextResponse.json({ error: (e as Error).message }, { status });
  }
}
