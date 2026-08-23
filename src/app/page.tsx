"use client";

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

export default function Home() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [avatar, setAvatar] = useState("a0");

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
      const res = await api<{ roomId: string; playerId: string; state: ClientState }>(
        "",
        { name: n, avatar }
      );
      saveName(n);
      saveAvatar(avatar);
      savePlayerId(res.roomId, res.playerId);
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
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10">
      <div className="text-center">
        <div className="animate-wiggle inline-block"><IconLogo size={84} /></div>
        <h1 className="mt-2 text-5xl leading-tight">
          <Wordmark />
        </h1>
        <p className="mt-2 text-lg text-ink/60">
          Draw badly. Guess wildly. Blame the pen.
        </p>
      </div>

      <form
        onSubmit={create}
        className="mt-8 rounded-2xl border-2 border-ink bg-white p-6 shadow-doodle"
      >
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
          autoFocus
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
          You&apos;ll get a goofy link like{" "}
          <span className="font-mono">/r/soggy-walrus-fiesta</span> to send your
          friends.
        </p>
      </form>

      <form onSubmit={joinExisting} className="mt-4 flex gap-2">
        <input
          value={joinCode}
          onChange={(e) => setJoinCode(e.target.value)}
          placeholder="…or paste an invite link"
          className="min-w-0 flex-1 rounded-xl border-2 border-ink/20 bg-white px-4 py-2.5 outline-none focus:border-ink"
        />
        <button
          disabled={!joinCode.trim()}
          className="rounded-xl border-2 border-ink bg-sun px-4 font-bold shadow-doodle transition-transform active:scale-95 disabled:opacity-40"
        >
          Join
        </button>
      </form>

      <InstallTip />

      <p className="mt-8 text-center text-xs text-ink/40">
        No accounts · no ads · no artistic talent required
      </p>
    </main>
  );
}
