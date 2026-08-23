# Doodle Disaster

**Draw badly. Guess wildly. Blame the pen.**

A multiplayer draw-and-guess party game that runs in a browser tab. Make a room,
send the link, take turns scribbling while everyone else shouts guesses into the
chat. No accounts, no installs, no ads.

- **Play it:** <https://doodle-disaster.vercel.app>
- **About page:** <https://kbrovibes.github.io/doodle-disaster/>

---

## How to play

1. **Make a room.** Type a display name, pick one of twenty hand-drawn avatars,
   hit *Create a game*. You get a nonsense three-word address like
   `/r/soggy-walrus-fiesta`.
2. **Send the link.** Anyone who opens it types a name and they're in. Two
   connected players is the minimum, at least one of whom has to be human, and
   ten is the cap.
3. **Set the rules.** The host picks a difficulty (easy / medium / hard),
   5, 10 or 15 rounds, and a 45, 60 or 75 second draw timer — and can add up to
   three bots to fill out a small room.
4. **Take turns.** Each turn one player gets three words tagged *easy*, *normal*
   or *chaos* and fifteen seconds to choose one. Dither and the turn is
   forfeited. Everyone else types guesses.
5. **Score.** Guessing early is worth more than typing fast: 100 points for
   first, then 85, 70, 60, 55, 50, plus up to 25 for time left on the clock. The
   drawer earns 35 per correct guess, +25 if everybody gets it, and 10 bravery
   points if nobody does.
6. **Read the damage.** After the last round: medals, confetti, and a gallery of
   every drawing the room produced.

### Things that are in there

- **A real-time canvas** — pen, eraser, flood fill, undo, clear, fourteen
  colours, four brush sizes, `B`/`E`/`F`/`U`/`C` shortcuts. Strokes stream to the
  room over a Supabase Realtime channel; someone joining mid-turn gets the board
  resent by the drawer.
- **Bots that actually draw** — three of them (Botrick, Doodl-E, Crayon.exe),
  with 101 hand-authored doodle recipes run through a `humanize()` pass that adds
  line tremor, per-stroke rotation drift, circles that overshoot, hesitation
  before details, and the occasional stroke that gets undone. Their strokes go
  out over the same channel a human's do.
- **Bots that actually guess** — the host's browser sends a downscaled snapshot
  of the canvas to the server, which asks Claude Haiku 4.5 to guess it against
  the same letter mask everyone else can see. If the model is unavailable it
  falls back to a local simulator so turns still resolve.
- **499 curated words** across three tiers, dealt like a deck: no word repeats
  while the room still has unplayed ones.
- **AI word themes** — the host can type a theme ("cricket", "90s cartoons") and
  the room gets its own easy / normal / chaos lists. Rude themes are refused by
  the model, with a regex backstop behind it.
- **Hints** — letters unlock for the whole room at 50%, 75% and 88% of the
  timer. Each player also holds one personal hint token that reveals an extra
  letter only they can see; five correct guesses earns another.
- **Near misses** — a guess within one or two edits of the word comes back as
  "sooo close", privately.
- **Host controls** — skip a stuck drawer, remove a player, add or drop bots.
- **Phone support** — separate portrait and landscape layouts, an in-app QWERTY
  so the system keyboard never covers the drawing, haptics, and a web manifest +
  service worker so it can be installed to the home screen. There is no offline
  mode; the game is live by definition.
- **Sound** — a tiny WebAudio synth for correct guesses, the countdown tick, and
  the end of a game. Mutable.

## Stack

| | |
|---|---|
| Framework | Next.js 16 (App Router), React 19, TypeScript |
| Styling | Tailwind CSS v4 (CSS-first, `@theme` in `globals.css`) |
| Type / display | Nunito + Fredoka via `next/font` |
| State | One JSON row per room in Supabase Postgres, written with optimistic concurrency (`version` column + compare-and-set) |
| Transport | Supabase Realtime broadcast channel per room, plus presence for connect/disconnect |
| AI | Vercel AI SDK → Claude Haiku 4.5, for bot guessing and themed word lists |
| Hosting | Vercel |

There are no background timers anywhere: the app is serverless, so phase
deadlines are enforced lazily. Any client reading state on an overdue room
advances it, which means a room can never stall because everybody's tab slept.

### Layout of the code

```
src/
  app/
    page.tsx                 create-or-join screen
    r/[roomId]/page.tsx      the room
    api/rooms/route.ts       POST: create a room
    api/rooms/[id]/route.ts  GET state, POST every game action
    globals.css              the theme (paper / ink / coral / sun)
    manifest.ts              PWA manifest
  components/
    Room.tsx                 the whole game shell and client-side loop
    Canvas.tsx               drawing surface, tools, stroke wire format
    Chat.tsx GuessClouds.tsx two ways of showing guesses
    Players.tsx AvatarPicker.tsx avatars.tsx icons.tsx
    VirtualKeyboard.tsx      touch keyboard
  lib/
    engine.ts                pure game state machine (phases, scoring, hints)
    words.ts                 the three word pools and the dealer
    botdraw.ts               101 doodle recipes + the humanizer
    bots.ts                  vision guessing and the offline fallback
    theme.ts                 AI-generated themed word lists
    server.ts client.ts      Supabase access, realtime, local identity
    text.ts                  guess normalisation and near-miss matching
```

## Local development

Requires Node 20+ and a Supabase project.

```bash
git clone https://github.com/kbrovibes/doodle-disaster
cd doodle-disaster
npm install
npm run dev
```

Create `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

Bot guessing and themed word lists go through the Vercel AI Gateway, which
authenticates with an OIDC token — `vercel env pull` puts one in `.env.local`.
Without gateway credentials the game still runs: bots fall back to the offline
guess simulator, and asking for a themed word list returns an error.

The database needs one table:

```sql
create table doodle_rooms (
  id         text primary key,
  state      jsonb not null,
  version    integer not null default 0,
  updated_at timestamptz not null default now()
);
```

Rooms are written only by the server using the service-role key, so the table
does not need to be exposed to clients.

## Privacy

Your display name, avatar and which seat you hold in a room live in your own
browser's storage and are never sent anywhere else. Room state — players,
scores, the current word — is a row in Postgres. A drawing only leaves the room when a bot
is guessing it, and then only as a downscaled snapshot with no names attached.
No analytics, no ads, no accounts.

## Licence

No licence file yet — all rights reserved. Ask if you want to reuse something.
