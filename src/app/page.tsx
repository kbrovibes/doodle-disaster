"use client";

import Link from "next/link";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  api,
  getSavedAvatar,
  getSavedName,
  saveAvatar,
  saveName,
  savePlayerId,
} from "@/lib/client";
import { ClientState } from "@/lib/types";
import { IconLogo, IconRocket, Wordmark } from "@/components/icons";
import AvatarPicker from "@/components/AvatarPicker";
import InstallTip from "@/components/InstallTip";
import MyGames from "@/components/MyGames";
import Tally from "@/components/Tally";
import { recordGame } from "@/lib/games";
import { loadRing, syncRing } from "@/lib/played";

export default function Home() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [avatar, setAvatar] = useState("a0");
  const [tab, setTab] = useState<"join" | "new" | "party">("join");

  useEffect(() => {
    setName(getSavedName());
    setAvatar(getSavedAvatar());
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n || busy) return;
    setBusy(true);
    setError("");
    try {
      // hand the server this device's place in the group's word ring, so a
      // second game tonight carries on instead of restarting the same deck
      const ring = loadRing();
      const res = await api<{ roomId: string; playerId: string; state: ClientState }>(
        "",
        {
          name: n,
          avatar,
          seedSalt: ring?.salt,
          seedCursor: ring?.cursor,
        }
      );
      syncRing(res.state.wordSalt, res.state.wordCursor);
      saveName(n);
      saveAvatar(avatar);
      savePlayerId(res.roomId, res.playerId);
      recordGame({ roomId: res.roomId, playerId: res.playerId, name: n, avatar });
      router.push(`/r/${res.roomId}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  function joinExisting(e: React.FormEvent) {
    e.preventDefault();
    const raw = joinCode.trim();
    if (!raw) return;
    // accept a pasted URL or a bare room id
    const m = raw.match(/\/r\/([a-z0-9-]+)/i);
    const id = (m ? m[1] : raw).toLowerCase().replace(/[^a-z0-9-]/g, "");
    if (id) router.push(`/r/${id}`);
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-6 sm:py-10">
      <div className="text-center">
        {/* a plain href, not a router push: tapping the logo is the universal
            "get me back to a clean start", so it fully reloads the page */}
        <a href="/" className="inline-block" aria-label="DoodleDisaster home">
          <span className="animate-wiggle inline-block">
            <IconLogo size={56} className="sm:hidden" />
            <IconLogo size={84} className="hidden sm:inline-block" />
          </span>
          <h1
            className="mt-1 whitespace-nowrap leading-tight"
            style={{ fontSize: "clamp(1.9rem, 8.5vw, 3rem)" }}
          >
            <Wordmark />
          </h1>
        </a>
        <p className="mt-1 text-base text-ink/60 sm:mt-2 sm:text-lg">
          Draw badly. Guess wildly. Blame the pen.
        </p>
      </div>

      {/* one box, three ways in: play online, play in the room, or join */}
      <div className="mt-5 rounded-2xl border-2 border-ink bg-white p-4 shadow-doodle sm:mt-8 sm:p-5">
        <div className="flex gap-1.5 rounded-xl bg-paper p-1">
          {(
            [
              { key: "join", label: "Join", emoji: "🔗" },
              { key: "new", label: "New game", emoji: "🎨" },
              { key: "party", label: "Party", emoji: "📺" },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`flex-1 rounded-lg px-1 py-2 text-center text-xs font-extrabold transition-all sm:text-sm ${
                tab === t.key
                  ? "border-2 border-ink bg-sun shadow-doodle"
                  : "border-2 border-transparent text-ink/50 hover:text-ink"
              }`}
            >
              <span className="mr-1">{t.emoji}</span>
              {t.label}
            </button>
          ))}
        </div>

        {tab === "new" && (
          <form onSubmit={create} className="mt-4">
            <div className="mb-3 flex justify-center">
              <AvatarPicker
                value={avatar}
                onChange={(t) => {
                  setAvatar(t);
                  saveAvatar(t);
                }}
              />
            </div>
            <label className="text-sm font-bold text-ink/70">Your name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Sir Scribbles"
              maxLength={20}
              className="mt-1 w-full rounded-xl border-2 border-ink/20 bg-paper px-4 py-3 text-lg font-bold outline-none focus:border-ink"
            />
            <button
              disabled={!name.trim() || busy}
              className="btn-primary mt-4 w-full text-lg disabled:opacity-40"
            >
              {busy ? (
                "Inventing a room…"
              ) : (
                <>Create a game <IconRocket size={20} /></>
              )}
            </button>
            {error && <p className="mt-2 text-sm text-coral">{error}</p>}
            <p className="mt-3 text-center text-xs text-ink/50">
              You&apos;ll get a four-letter code to read out to your friends.
            </p>
          </form>
        )}

        {tab === "party" && (
          <div className="mt-4">
            <p className="text-sm text-ink/65">
              Everyone in the same room? Cast one device to the telly and play
              in <b>two to four teams</b>, with everybody else on their own
              phone.
            </p>
            <ul className="mt-3 space-y-1.5 text-xs text-ink/55">
              <li>📺 One screen on the TV — that&apos;s the drawing board</li>
              <li>📱 Everyone joins from their phone with a 4-letter code</li>
              <li>🤫 Your team&apos;s word only ever shows on your team&apos;s phones</li>
            </ul>
            <Link
              href="/party"
              className="btn-primary mt-4 w-full text-lg"
            >
              Start party mode 📺
            </Link>
          </div>
        )}

        {tab === "join" && (
          <form onSubmit={joinExisting} className="mt-4">
            <label className="block text-center text-sm font-bold text-ink/70">
              Got a code from a friend?
            </label>
            <input
              autoFocus
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="ABCD"
              maxLength={40}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              className="mt-2 w-full rounded-2xl border-2 border-ink bg-paper py-4 text-center font-mono text-4xl font-black uppercase tracking-[0.35em] outline-none placeholder:text-ink/20 focus:bg-sun/20"
            />
            <button
              disabled={!joinCode.trim()}
              className="btn-primary mt-3 w-full text-xl disabled:opacity-40"
            >
              Join the game 🔗
            </button>
            <p className="mt-2 text-center text-xs text-ink/45">
              A whole invite link works here too.
            </p>
          </form>
        )}
      </div>

      <MyGames />

      <InstallTip />

      <p className="mt-8 text-center text-xs text-ink/40">
        No accounts · no ads · no artistic talent required
      </p>
      <Tally />
    </main>
  );
}
