"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { newPartyCode } from "@/lib/party";

export default function PartyLanding() {
  const router = useRouter();
  const [code, setCode] = useState("");

  return (
    <main className="mx-auto w-full max-w-md px-5 py-10">
      <h1 className="text-center font-display text-4xl font-black">
        Party mode
      </h1>
      <p className="mt-2 text-center text-ink/60">
        Two to four teams in one room. One screen on the telly, and everyone
        else playing from their own phone.
      </p>

      <button
        onClick={() => router.push(`/party/${newPartyCode()}/screen`)}
        className="mt-6 w-full rounded-2xl border-2 border-ink bg-coral px-5 py-4 text-left text-white shadow-doodle transition-transform active:translate-y-[2px] active:shadow-none"
      >
        <span className="flex items-center gap-3">
          <span className="text-3xl">📺</span>
          <span>
            <span className="block font-display text-xl font-black leading-tight">
              This is the screen
            </span>
            <span className="block text-sm text-white/85">
              Cast this to the TV. The host sorts the teams here, and it's
              what everyone draws on.
            </span>
          </span>
        </span>
      </button>

      <div className="mt-6 rounded-2xl border-2 border-ink/15 bg-white p-4">
        <span className="flex items-center gap-2 font-display font-bold">
          <span className="text-2xl">📱</span> I'm a player
        </span>
        <p className="mt-1 text-sm text-ink/55">
          Type the code on the telly and pop your name in. Your phone shows
          your team's word when it's your turn to set one — and nothing at all
          when it isn't.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const c = code.trim().toUpperCase();
            if (c.length >= 3) router.push(`/party/${c}`);
          }}
          className="mt-3 flex gap-2"
        >
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="CODE"
            maxLength={6}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            className="min-w-0 flex-1 rounded-xl border-2 border-ink/20 bg-paper px-4 py-3 text-center font-mono text-2xl font-bold tracking-[0.3em] outline-none focus:border-ink"
          />
          <button
            disabled={code.trim().length < 3}
            className="rounded-xl border-2 border-ink bg-sun px-5 font-bold shadow-doodle disabled:opacity-40"
          >
            Go
          </button>
        </form>
      </div>

      <div className="mt-8 rounded-2xl border-2 border-dashed border-ink/20 p-4 text-sm text-ink/60">
        <b className="text-ink">How a turn goes.</b> One team huddles over their
        phones and agrees on a word. They call someone over from the other team,
        show them the phone, and that person draws it on the big screen while
        their own team shouts guesses. Then it flips.
      </div>

      <p className="mt-6 text-center">
        <Link href="/" className="text-sm font-bold text-ink/40 underline">
          back to online games
        </Link>
      </p>
    </main>
  );
}
