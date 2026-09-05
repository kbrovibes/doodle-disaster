"use client";

import { useCallback, useMemo, useState } from "react";
import { encodeQr, qrPath } from "@/lib/qr";
import { joinHost, joinUrl } from "@/lib/party";
import { IconCheck, IconLink, IconX } from "../icons";

/**
 * How a phone gets into the party.
 *
 * The four-letter code exists because it can be read off a television from the
 * sofa; the QR exists because nobody wants to type it. The buttons exist
 * because half the room is not in the room — somebody always needs the link
 * pasted into a group chat.
 *
 * Everything here points at /party/CODE, the REMOTE address. The /screen URL
 * this component is rendered on is the one device nobody else should open.
 */

export function QrBlock({
  text,
  size,
  className,
}: {
  text: string;
  /** px per side; omit to fill whatever box the parent gives it */
  size?: number;
  className?: string;
}) {
  const qr = useMemo(() => {
    try {
      const code = encodeQr(text);
      return { d: qrPath(code), span: code.size + 4 };
    } catch {
      return null;
    }
  }, [text]);

  if (!qr) return null;
  return (
    <svg
      viewBox={`0 0 ${qr.span} ${qr.span}`}
      width={size ?? "100%"}
      height={size ?? "100%"}
      className={className}
      shapeRendering="crispEdges"
      role="img"
      aria-label={`QR code for ${text}`}
    >
      {/* the quiet zone is part of the symbol: without white around it, a
          camera cannot find the edges */}
      <rect width={qr.span} height={qr.span} fill="#fff" />
      <path d={qr.d} fill="#241b12" />
    </svg>
  );
}

function useCopy(): [string | null, (key: string, text: string) => void] {
  const [done, setDone] = useState<string | null>(null);
  const copy = useCallback((key: string, text: string) => {
    const ok = () => {
      setDone(key);
      setTimeout(() => setDone((d) => (d === key ? null : d)), 1600);
    };
    navigator.clipboard?.writeText(text).then(ok, () => {
      // clipboard is blocked outside a secure context, and a cast browser is
      // exactly where that happens — fall back to the old execCommand path
      try {
        const el = document.createElement("textarea");
        el.value = text;
        el.style.position = "fixed";
        el.style.opacity = "0";
        document.body.appendChild(el);
        el.select();
        document.execCommand("copy");
        el.remove();
        ok();
      } catch {}
    });
  }, []);
  return [done, copy];
}

function InviteButtons({ code, big }: { code: string; big?: boolean }) {
  const [done, copy] = useCopy();
  const url = joinUrl(code);
  const canShare = typeof navigator !== "undefined" && !!navigator.share;
  const pad = big ? "px-4 py-2.5" : "px-3 py-2";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        onClick={() => copy("link", url)}
        className={`with-glyph inline-flex items-center gap-1.5 rounded-xl border-2 border-ink bg-coral font-display font-black text-white shadow-doodle transition-transform active:translate-y-[2px] active:shadow-none ${pad}`}
      >
        {done === "link" ? (
          <>Copied! <IconCheck size={16} /></>
        ) : (
          <>Copy link <IconLink size={16} /></>
        )}
      </button>
      <button
        onClick={() => copy("code", code)}
        className={`inline-flex items-center gap-1.5 rounded-xl border-2 border-ink bg-sun font-display font-black shadow-doodle transition-transform active:translate-y-[2px] active:shadow-none ${pad}`}
      >
        {done === "code" ? (
          <>Copied! <IconCheck size={16} /></>
        ) : (
          <>Copy code</>
        )}
      </button>
      {canShare && (
        <button
          onClick={() =>
            navigator
              .share({
                title: "DoodleDisaster party",
                text: `Join the party — code ${code}`,
                url,
              })
              .catch(() => {})
          }
          className={`inline-flex items-center gap-1.5 rounded-xl border-2 border-ink/20 bg-white font-display font-black transition-transform active:translate-y-[2px] ${pad}`}
        >
          Share ↗
        </button>
      )}
    </div>
  );
}

/**
 * The lobby hero. Sized in viewport units because it lives on a television
 * whose height we do not get to choose.
 */
export function InvitePanel({
  code,
  qrSize,
  codeSize,
  className,
}: {
  code: string;
  qrSize: string;
  codeSize: string;
  className?: string;
}) {
  return (
    <div
      className={`flex shrink-0 items-center gap-4 rounded-3xl border-2 border-ink bg-white px-4 py-3 shadow-doodle ${className ?? ""}`}
    >
      <div
        className="shrink-0 rounded-2xl border-2 border-ink/10 bg-white p-1.5"
        style={{ width: qrSize, height: qrSize }}
      >
        <QrBlock text={joinUrl(code)} className="block h-full w-full" />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="font-bold uppercase tracking-[0.18em] text-ink/50 text-[clamp(9px,1.6vh,15px)]">
          point a camera at the square
        </span>
        <span className="truncate font-display font-black leading-none text-[clamp(13px,2.6vh,30px)]">
          {joinHost(code)}
        </span>
        <InviteButtons code={code} />
      </div>

      <div className="shrink-0 text-center">
        <span className="block font-bold uppercase tracking-[0.18em] text-ink/50 text-[clamp(9px,1.5vh,14px)]">
          or type the code
        </span>
        <span
          className="block font-display font-black leading-none tracking-[0.14em]"
          style={{ fontSize: codeSize }}
        >
          {code}
        </span>
      </div>
    </div>
  );
}

/**
 * The same invite, over the top of a running game — for the friend who turns
 * up at half time. Deliberately a big translucent sheet: it has to be readable
 * from the sofa and obviously dismissable from the iPad.
 */
export function InviteOverlay({
  code,
  onClose,
}: {
  code: string;
  onClose: () => void;
}) {
  return (
    <div
      className="dd-frost fixed inset-0 z-50 flex items-center justify-center p-6"
      onClick={onClose}
    >
      <div
        className="relative flex max-w-3xl flex-col items-center gap-4 rounded-3xl border-2 border-ink bg-white px-8 py-7 text-center shadow-doodle"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 rounded-full border-2 border-ink/15 p-2 text-ink/50 hover:border-ink hover:text-ink"
        >
          <IconX size={16} />
        </button>

        <h2 className="font-display text-2xl font-black">Join this party</h2>
        <QrBlock text={joinUrl(code)} size={220} />
        <span className="font-display text-lg font-black leading-none">
          {joinHost(code)}
        </span>
        <span className="font-display text-5xl font-black tracking-[0.14em]">
          {code}
        </span>
        <InviteButtons code={code} big />
        <p className="max-w-sm text-sm text-ink/55">
          Latecomers land in the lobby list — put them on a team from this
          screen and they are in from the next turn.
        </p>
      </div>
    </div>
  );
}
