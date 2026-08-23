import { NextRequest, NextResponse } from "next/server";
import {
  addBot,
  addPlayer,
  advance,
  chooseWord,
  handleGuess,
  kickPlayer,
  markConnected,
  playAgain,
  removeBot,
  sanitize,
  skipTurn,
  startGame,
  useHint,
} from "@/lib/engine";
import { simulatedGuess, visionGuess } from "@/lib/bots";
import { buildPlan, hashStr } from "@/lib/botdraw";
import { pickAvatar } from "@/lib/names";
import { generateThemedWords } from "@/lib/theme";
import { loadRoom, RoomError, withRoom } from "@/lib/server";
import { Player } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const playerId = req.nextUrl.searchParams.get("playerId");
    let { state } = await loadRoom(id.toLowerCase());
    // lazy advance: if every client slept through a phase deadline, any state
    // read heals the room instead of letting it stall forever
    const overdue =
      ["choosing", "drawing", "reveal"].includes(state.phase) &&
      Date.now() > state.phaseEndsAt + 4000;
    if (overdue) {
      const healed = await withRoom(id.toLowerCase(), (s, now) => {
        const before = s.phase + s.phaseEndsAt;
        advance(s, now);
        return before !== s.phase + s.phaseEndsAt;
      }, { saveIf: (changed) => changed === true });
      state = healed.state;
    }
    return NextResponse.json({ state: sanitize(state, playerId, Date.now()) });
  } catch (e) {
    const maybe = (e as { status?: number }).status;
    const status = typeof maybe === "number" ? maybe : 500;
    return NextResponse.json({ error: (e as Error).message }, { status });
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id: rawId } = await params;
  const id = rawId.toLowerCase();
  try {
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const type = String(body.type ?? "");
    const playerId = String(body.playerId ?? "");

    switch (type) {
      case "join": {
        let name = String(body.name ?? "").trim().slice(0, 20);
        if (!name)
          return NextResponse.json({ error: "Name required" }, { status: 400 });
        const player: Player = {
          id: crypto.randomUUID(),
          name,
          avatar: "",
          score: 0,
          connected: true,
          joinedAt: Date.now(),
        };
        let joinedId = player.id;
        const { state } = await withRoom(id, (s) => {
          // reclaim: same name as a disconnected player -> take over
          // that seat (score and turn order intact)
          const ghost = s.players.find(
            (p) => !p.connected && p.name.toLowerCase() === name.toLowerCase()
          );
          if (ghost) {
            ghost.connected = true;
            joinedId = ghost.id;
            if (!s.players.some((p) => p.connected && p.id === s.hostId))
              s.hostId = ghost.id;
            return;
          }
          if (s.players.length >= 10) throw new RoomError("Room is full");
          // duplicate live name -> auto-suffix so the scoreboard stays legible
          const taken = new Set(s.players.map((p) => p.name.toLowerCase()));
          if (taken.has(name.toLowerCase())) {
            let n = 2;
            while (taken.has(`${name} (${n})`.toLowerCase())) n++;
            name = `${name} (${n})`.slice(0, 24);
          }
          player.name = name;
          const chosen = String(body.avatar ?? "");
          player.avatar = /^a(\d|1\d)$/.test(chosen)
            ? chosen
            : pickAvatar(s.players.map((p) => p.avatar));
          addPlayer(s, player);
          joinedId = player.id;
        });
        return NextResponse.json({
          playerId: joinedId,
          state: sanitize(state, joinedId, Date.now()),
        });
      }
      case "rejoin": {
        const { state } = await withRoom(id, (s) => {
          markConnected(s, playerId, true);
        });
        return NextResponse.json({
          state: sanitize(state, playerId, Date.now()),
        });
      }
      case "leave": {
        await withRoom(id, (s, now) => {
          markConnected(s, playerId, false);
          // if the drawer bailed, let the round resolve
          if (
            (s.phase === "drawing" || s.phase === "choosing") &&
            s.drawerId === playerId
          ) {
            advance(s, now);
          }
        });
        return NextResponse.json({ ok: true });
      }
      case "start": {
        const { state } = await withRoom(id, (s, now) => {
          if (s.hostId !== playerId) throw new RoomError("Only the host can start");
          if (s.phase !== "lobby") throw new RoomError("Already started");
          startGame(s, now);
        });
        return NextResponse.json({
          state: sanitize(state, playerId, Date.now()),
        });
      }
      case "settings": {
        const rounds = Number(body.rounds);
        const drawSeconds = Number(body.drawSeconds);
        const difficulty = String(body.difficulty ?? "");
        const roundsOk = Number.isInteger(rounds) && rounds >= 1 && rounds <= 20;
        const drawOk = [45, 60, 75, 90].includes(drawSeconds);
        const diffOk = ["easy", "medium", "hard"].includes(difficulty);
        if (!roundsOk && !drawOk && !diffOk) {
          return NextResponse.json(
            {
              error:
                "Pass rounds (1-20), drawSeconds (45|60|75|90) and/or difficulty (easy|medium|hard) at the top level",
            },
            { status: 400 }
          );
        }
        const { state } = await withRoom(id, (s) => {
          if (s.hostId !== playerId) throw new RoomError("Only the host");
          if (s.phase !== "lobby") throw new RoomError("Game in progress");
          if (roundsOk) s.settings.rounds = rounds;
          if (drawOk) s.settings.drawSeconds = drawSeconds;
          if (diffOk)
            s.settings.difficulty = difficulty as "easy" | "medium" | "hard";
        });
        return NextResponse.json({
          state: sanitize(state, playerId, Date.now()),
        });
      }
      case "choose": {
        const { state } = await withRoom(id, (s, now) => {
          chooseWord(s, playerId, Number(body.index), now);
        });
        return NextResponse.json({
          state: sanitize(state, playerId, Date.now()),
        });
      }
      case "guess": {
        const text = String(body.text ?? "").slice(0, 100);
        const { state, result } = await withRoom(
          id,
          (s, now) => handleGuess(s, playerId, text, now),
          { saveIf: (r) => r === "correct" || r === "expired" }
        );
        return NextResponse.json({
          result,
          state: sanitize(state, playerId, Date.now()),
        });
      }
      case "advance": {
        const { state } = await withRoom(id, (s, now) => {
          if (!s.players.some((p) => p.id === playerId))
            throw new RoomError("Unknown player");
          const before = s.phase + s.phaseEndsAt;
          advance(s, now);
          return before !== s.phase + s.phaseEndsAt;
        }, { saveIf: (changed) => changed === true });
        return NextResponse.json({
          state: sanitize(state, playerId, Date.now()),
        });
      }
      case "addbot": {
        const { state } = await withRoom(id, (s) => {
          if (s.hostId !== playerId) throw new RoomError("Only the host");
          addBot(s);
        });
        return NextResponse.json({
          state: sanitize(state, playerId, Date.now()),
        });
      }
      case "removebot": {
        const { state } = await withRoom(id, (s) => {
          if (s.hostId !== playerId) throw new RoomError("Only the host");
          removeBot(s, String(body.botId ?? ""));
        });
        return NextResponse.json({
          state: sanitize(state, playerId, Date.now()),
        });
      }
      case "botchoose": {
        const { state } = await withRoom(id, (s, now) => {
          if (s.hostId !== playerId) throw new RoomError("Only the host");
          if (s.phase !== "choosing") throw new RoomError("Not choosing");
          const d = s.players.find((p) => p.id === s.drawerId);
          if (!d?.isBot) throw new RoomError("Drawer is not a bot");
          const idx = Math.floor(Math.random() * s.wordChoices.length);
          chooseWord(s, s.drawerId!, idx, now);
        });
        return NextResponse.json({
          state: sanitize(state, playerId, Date.now()),
        });
      }
      case "botplan": {
        // returns coordinates only — never the word, so driving the bot
        // gives the host no more information than watching the canvas
        const { state: s } = await loadRoom(id);
        if (s.hostId !== playerId)
          return NextResponse.json({ error: "Only the host" }, { status: 400 });
        const d = s.players.find((p) => p.id === s.drawerId);
        if (!d?.isBot || s.phase !== "drawing" || !s.word)
          return NextResponse.json({ items: [] });
        const seed = hashStr(`${id}:${s.round}:${s.turnIndex}:${s.word}`);
        return NextResponse.json({
          items: buildPlan(s.word, seed, s.settings.drawSeconds),
        });
      }
      case "botguess": {
        // host's client drives bots: it sends a canvas snapshot, the server
        // asks a vision model (or the offline simulator) for a guess, then
        // scores it exactly like a human guess
        const botId = String(body.botId ?? "");
        const image = String(body.image ?? "");
        const attempt = Math.min(Number(body.attempt) || 1, 6);
        const { state: pre } = await loadRoom(id);
        if (pre.hostId !== playerId)
          return NextResponse.json({ error: "Only the host" }, { status: 400 });
        const bot = pre.players.find((p) => p.id === botId && p.isBot);
        if (!bot || pre.phase !== "drawing" || !pre.word)
          return NextResponse.json({ result: "chat", guess: null });
        if (pre.guessed[botId] !== undefined)
          return NextResponse.json({ result: "chat", guess: null });

        const maskNow = sanitize(pre, null, Date.now()).mask ?? "";
        let guess: string | null = null;
        if (image.startsWith("data:image/") && image.length < 400_000) {
          guess = await visionGuess(image, maskNow, attempt);
        }
        if (!guess) guess = simulatedGuess(pre.word, attempt);

        const { result } = await withRoom(
          id,
          (s, now) => handleGuess(s, botId, guess!, now),
          { saveIf: (r) => r === "correct" || r === "expired" }
        );
        return NextResponse.json({ guess, result });
      }
      case "theme": {
        const themeText = String(body.theme ?? "").trim();
        if (themeText) {
          // generate BEFORE taking the room lock; can take a few seconds
          const words = await generateThemedWords(themeText);
          const { state } = await withRoom(id, (s) => {
            if (s.hostId !== playerId) throw new RoomError("Only the host");
            if (s.phase !== "lobby") throw new RoomError("Game in progress");
            s.customWords = words;
          });
          return NextResponse.json({
            state: sanitize(state, playerId, Date.now()),
          });
        }
        const { state } = await withRoom(id, (s) => {
          if (s.hostId !== playerId) throw new RoomError("Only the host");
          s.customWords = null;
        });
        return NextResponse.json({
          state: sanitize(state, playerId, Date.now()),
        });
      }
      case "usehint": {
        const { state } = await withRoom(id, (s, now) => {
          useHint(s, playerId, now);
        }, { broadcast: false });
        return NextResponse.json({
          state: sanitize(state, playerId, Date.now()),
        });
      }
      case "skip": {
        const { state } = await withRoom(id, (s, now) => {
          if (s.hostId !== playerId) throw new RoomError("Only the host can skip");
          skipTurn(s, now);
        });
        return NextResponse.json({
          state: sanitize(state, playerId, Date.now()),
        });
      }
      case "kick": {
        const targetId = String(body.targetId ?? "");
        const { state } = await withRoom(id, (s, now) => {
          if (s.hostId !== playerId) throw new RoomError("Only the host can kick");
          if (targetId === playerId) throw new RoomError("Can't kick yourself");
          kickPlayer(s, targetId, now);
        });
        return NextResponse.json({
          state: sanitize(state, playerId, Date.now()),
        });
      }
      case "again": {
        const { state } = await withRoom(id, (s) => {
          playAgain(s);
        });
        return NextResponse.json({
          state: sanitize(state, playerId, Date.now()),
        });
      }
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (e) {
    const maybe = (e as { status?: number }).status;
    const status = typeof maybe === "number" ? maybe : 500;
    return NextResponse.json({ error: (e as Error).message }, { status });
  }
}
