import { NextRequest, NextResponse } from "next/server";
import { THEMES } from "@/lib/wordbank/themes";
import {
  addBot,
  addPlayer,
  advance,
  chooseWord,
  endGame,
  giveWord,
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
import { generateThemedWords, parseWordList } from "@/lib/theme";
import { db, loadRoom, RoomError, withRoom } from "@/lib/server";
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
          player.avatar = /^a([0-9]|[1-3][0-9])$/.test(chosen)
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
        const drawOk = [60, 75, 120].includes(drawSeconds);
        const diffOk = ["kids", "medium", "hard", "ultra"].includes(difficulty);
        const wordSource = String(body.wordSource ?? "");
        const sourceOk = ["bank", "giver"].includes(wordSource);
        const rawPacks = body.themePacks;
        const known = new Set(THEMES.map((t) => t.key));
        const themePacks = Array.isArray(rawPacks)
          ? rawPacks
              .filter((k: unknown): k is string => typeof k === "string")
              .filter((k) => known.has(k))
              .slice(0, 12)
          : [];
        // an unknown pack used to be stored verbatim and would have dealt from
        // an empty pool
        if (Array.isArray(rawPacks) && themePacks.length !== rawPacks.length)
          return NextResponse.json(
            { error: "Unknown theme pack" },
            { status: 400 }
          );
        const themeOk = Array.isArray(rawPacks) || rawPacks === null;
        // a bad value must not ride along unnoticed just because a sibling
        // field was valid — the caller would think it applied
        const sent = (k: string) => body[k] !== undefined && body[k] !== null;
        if ((sent("rounds") && !roundsOk) || (sent("drawSeconds") && !drawOk) ||
            (sent("difficulty") && !diffOk) ||
            (sent("wordSource") && !sourceOk)) {
          return NextResponse.json(
            {
              error:
                "Bad value: rounds (1-20), drawSeconds (60|75|120), difficulty (kids|medium|hard|ultra), wordSource (bank|giver)",
            },
            { status: 400 }
          );
        }
        if (!roundsOk && !drawOk && !diffOk && !themeOk && !sourceOk) {
          return NextResponse.json(
            {
              error:
                "Pass rounds (1-20), drawSeconds (60|75|120) and/or difficulty (kids|medium|hard|ultra) at the top level",
            },
            { status: 400 }
          );
        }
        const { state } = await withRoom(id, (s) => {
          if (s.hostId !== playerId) throw new RoomError("Only the host");
          // settings can be tuned mid-game too; they apply from the next turn
          if (roundsOk) s.settings.rounds = rounds;
          if (drawOk) s.settings.drawSeconds = drawSeconds;
          if (diffOk)
            s.settings.difficulty = difficulty as "kids" | "medium" | "hard" | "ultra";
          if (themeOk)
            s.settings.themePacks = themePacks.length ? themePacks : null;
          // takes effect from the next turn, like every other setting here
          if (sourceOk) s.settings.wordSource = wordSource as "bank" | "giver";
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
      case "give": {
        // giver mode: a word one player typed for another to draw
        const { state } = await withRoom(id, (s, now) => {
          giveWord(s, playerId, String(body.word ?? ""), now);
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
      case "shot": {
        // the artist (or the host, when a bot drew) uploads the finished
        // drawing once per turn so everyone's gallery matches
        const image = String(body.image ?? "");
        const { state: s } = await loadRoom(id);
        if (s.phase !== "reveal" || !s.lastTurn || s.lastTurn.skipped)
          return NextResponse.json({ ok: false });
        const artist = s.players.find((p) => p.id === s.lastTurn!.drawerId);
        const mayUpload =
          playerId === s.lastTurn.drawerId ||
          (artist?.isBot && s.hostId === playerId);
        if (!mayUpload) return NextResponse.json({ ok: false });
        if (!image.startsWith("data:image/") || image.length > 90_000)
          return NextResponse.json({ ok: false });
        const turn = s.round * 1000 + s.turnIndex;
        const { error } = await db.from("doodle_shots").upsert(
          {
            room_id: id,
            turn,
            word: s.lastTurn.word,
            drawer_id: s.lastTurn.drawerId,
            image,
          },
          { onConflict: "room_id,turn" }
        );
        if (error) console.error("shot upload failed", error.message);
        return NextResponse.json({ ok: !error });
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
          // a pasted list is used as-is; anything else goes to the word wizard.
          // Either way, generate BEFORE taking the room lock.
          const words =
            parseWordList(themeText) ?? (await generateThemedWords(themeText));
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
      case "pass": {
        // the drawer giving up on their own turn
        const { state } = await withRoom(id, (s, now) => {
          if (s.drawerId !== playerId)
            throw new RoomError("Only the drawer can pass");
          skipTurn(s, now);
        });
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
      case "endgame": {
        const { state } = await withRoom(id, (s) => {
          if (s.hostId !== playerId) throw new RoomError("Only the host");
          endGame(s);
        });
        return NextResponse.json({
          state: sanitize(state, playerId, Date.now()),
        });
      }
      case "again": {
        await db.from("doodle_shots").delete().eq("room_id", id);
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
