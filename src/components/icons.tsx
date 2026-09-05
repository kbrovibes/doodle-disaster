/**
 * DoodleDisaster proprietary glyph set.
 * Hand-drawn doodle style: round 2.2px strokes in currentColor, warm accent
 * fills. Everything is inline SVG — no emoji, no icon fonts, no CDNs.
 */
import type { SVGProps, CSSProperties } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 20, ...rest }: P, children: React.ReactNode) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={{ display: "inline-block", verticalAlign: "-0.18em" }}
      {...rest}
    >
      {children}
    </svg>
  );
}

/* ---------------- brand ---------------- */

export function IconLogo(p: P) {
  // wonky painter's palette with a bitten edge
  return base(p, (
    <>
      <path
        d="M12 3c5.8-.4 9.5 3 9.3 7.2-.15 3-2.3 3.6-4.1 3.4-1.5-.17-2.9.5-2.6 2.3.3 1.8-.6 4.6-3.6 4.9C6.6 21.2 2.6 17.8 2.8 12 3 6.6 7 3.4 12 3Z"
        fill="var(--sun, #ffd93d)"
        stroke="currentColor"
      />
      <circle cx="8" cy="9" r="1.35" fill="#e23e3e" stroke="none" />
      <circle cx="13.5" cy="7.5" r="1.35" fill="#2b6fe3" stroke="none" />
      <circle cx="7.6" cy="14" r="1.35" fill="#1e7d32" stroke="none" />
      <circle cx="17" cy="11" r="1.1" fill="#8e44ad" stroke="none" />
    </>
  ));
}

export function IconPen(p: P) {
  return base(p, (
    <>
      <path d="M4.5 19.5c.2-1.8.7-3.3 1.4-4L15.5 6c1-1 2.6-1 3.5 0 1 1 1 2.5 0 3.5l-9.6 9.5c-.7.7-2.2 1.2-4 1.4-.6 0-.9-.3-.9-.9Z" />
      <path d="M13.8 7.7l3.4 3.4" />
    </>
  ));
}

export function IconEraser(p: P) {
  return base(p, (
    <>
      <path
        d="M9.2 19l-4.6-4.6c-.8-.8-.8-2 0-2.8l6.7-6.7c.8-.8 2-.8 2.8 0l4.9 4.9c.8.8.8 2 0 2.8L13 19c-.5.5-1 .8-1.9.8s-1.4-.3-1.9-.8Z"
        fill="var(--paper, #fdf8ef)"
      />
      <path d="M7.5 8.9l7 7" />
      <path d="M4 21h16" />
    </>
  ));
}

export function IconFill(p: P) {
  return base(p, (
    <>
      <path
        d="M11.2 3.6l6.4 6.4c.6.6.6 1.5 0 2.1l-4.6 4.6c-1.2 1.2-3.1 1.2-4.2 0l-3.2-3.2c-1.2-1.2-1.2-3.1 0-4.2l5.6-5.7Z"
        fill="var(--sun, #ffd93d)"
      />
      <path d="M5.2 9.7h11.9" />
      <path d="M11.2 3.6L9 1.5" />
      <path
        d="M19.8 13.6c.9 1.4 1.7 2.7 1.7 3.8 0 1-.8 1.9-1.8 1.9s-1.8-.9-1.8-1.9c0-1.1.9-2.4 1.9-3.8Z"
        fill="#53c2f0"
        stroke="currentColor"
      />
    </>
  ));
}

export function IconUndo(p: P) {
  return base(p, (
    <>
      <path d="M7.5 4.5L3.5 8.5l4 4" />
      <path d="M3.8 8.5h10.4c3.3 0 6 2.6 6 5.9 0 3.2-2.7 5.9-6 5.9H8.5" />
    </>
  ));
}

export function IconTrash(p: P) {
  return base(p, (
    <>
      <path d="M4.5 6.5h15" />
      <path d="M9 6V4.4c0-.8.6-1.4 1.4-1.4h3.2c.8 0 1.4.6 1.4 1.4V6" />
      <path d="M6.3 6.7l.8 12c.06 1 .9 1.8 1.9 1.8h6c1 0 1.85-.8 1.9-1.8l.8-12" />
      <path d="M10 10.5l.3 6M14 10.5l-.3 6" />
    </>
  ));
}

export function IconBrush(p: P) {
  // the "now drawing" indicator
  return base(p, (
    <>
      <path d="M20 4c-3.6.9-7.3 3.6-9.8 6.6l3.1 3.1C16.4 11.2 19.1 7.6 20 4Z" fill="var(--coral, #ff6b6b)" />
      <path d="M10 10.8c-1.6-.2-3.2.7-3.7 2.3-.4 1.2-.2 2.6-1.8 3.6-.5.3-.4.9.1 1.1 2.4 1 5.6 1.1 7.3-.7 1.2-1.2 1.5-3 .5-4.4" />
    </>
  ));
}

export function IconCrown(p: P) {
  return base(p, (
    <>
      <path
        d="M4.5 9.5L7 17.5h10l2.5-8-4.3 2.6L12 6.8l-3.2 5.3L4.5 9.5Z"
        fill="var(--sun, #ffd93d)"
      />
      <circle cx="4.2" cy="8.2" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="5.4" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="19.8" cy="8.2" r="1.1" fill="currentColor" stroke="none" />
    </>
  ));
}

export function IconCheck(p: P) {
  return base(p, (
    <path d="M4.5 12.8l4.6 4.9c2-4.6 5.4-8.6 10.4-12" stroke="#1e7d32" strokeWidth={3} />
  ));
}

export function IconLink(p: P) {
  return base(p, (
    <>
      <path d="M10.3 13.7a4.2 4.2 0 006 0l3.2-3.2a4.24 4.24 0 00-6-6l-1.8 1.8" />
      <path d="M13.7 10.3a4.2 4.2 0 00-6 0l-3.2 3.2a4.24 4.24 0 006 6l1.8-1.8" />
    </>
  ));
}

export function IconSoundOn(p: P) {
  return base(p, (
    <>
      <path d="M4 9.8v4.4h3.2L12 18.6V5.4L7.2 9.8H4Z" fill="var(--sun, #ffd93d)" />
      <path d="M15.5 9.5c1.3 1.5 1.3 3.5 0 5" />
      <path d="M18.3 7.3c2.4 2.7 2.4 6.7 0 9.4" />
    </>
  ));
}

export function IconSoundOff(p: P) {
  return base(p, (
    <>
      <path d="M4 9.8v4.4h3.2L12 18.6V5.4L7.2 9.8H4Z" />
      <path d="M15.5 9.5l5 5M20.5 9.5l-5 5" stroke="var(--coral, #ff6b6b)" />
    </>
  ));
}

export function IconRocket(p: P) {
  return base(p, (
    <>
      <path
        d="M12 2.8c3 1.6 4.6 4.9 4.6 8.7 0 1.6-.3 3.1-.8 4.4H8.2a11.6 11.6 0 01-.8-4.4c0-3.8 1.6-7.1 4.6-8.7Z"
        fill="#fff"
      />
      <circle cx="12" cy="9.5" r="1.9" fill="#53c2f0" />
      <path d="M8.2 12.6c-1.8 1-2.9 2.7-3.2 5.1 1.6 0 2.9-.4 4-1.2M15.8 12.6c1.8 1 2.9 2.7 3.2 5.1-1.6 0-2.9-.4-4-1.2" fill="var(--coral, #ff6b6b)" />
      <path d="M10.3 18.5c.3 1.4.9 2.5 1.7 3.4.8-.9 1.4-2 1.7-3.4" stroke="var(--coral, #ff6b6b)" />
    </>
  ));
}

export function IconParty(p: P) {
  // party popper
  return base(p, (
    <>
      <path d="M7.6 10.2L3 21l10.8-4.6" fill="var(--sun, #ffd93d)" />
      <path d="M7.6 10.2c1.7-.5 5 1.7 6.2 6.2" />
      <path d="M13 8.5c1.4-1.8 3.4-2.4 5.6-2M15.5 11.4c1.9-.3 3.4.2 4.7 1.4" />
      <circle cx="15.5" cy="4.5" r="1.1" fill="#e23e3e" stroke="none" />
      <circle cx="20.5" cy="9" r="1.1" fill="#2b6fe3" stroke="none" />
      <circle cx="19" cy="16.5" r="1.1" fill="#1e7d32" stroke="none" />
    </>
  ));
}

export function IconFlag(p: P) {
  return base(p, (
    <>
      <path d="M5.5 21.5v-18" />
      <path
        d="M5.5 4.5c3.6-2 6.4 1.6 10 .1 1.5-.6 2.6-.3 3 .5l-1.8 4.4 1.8 4.3c-.5.9-1.7 1.1-3.2.5-3.5-1.4-6.3 2.1-9.8.2"
        fill="var(--coral, #ff6b6b)"
      />
    </>
  ));
}

export function IconReplay(p: P) {
  return base(p, (
    <>
      <path d="M4.2 10a8.1 8.1 0 0115.4-.7M19.8 14a8.1 8.1 0 01-15.4.7" />
      <path d="M19.6 4.7l.1 4.6-4.6-.1M4.4 19.3l-.1-4.6 4.6.1" />
    </>
  ));
}

export function IconGallery(p: P) {
  return base(p, (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" fill="#fff" />
      <circle cx="8.6" cy="9.4" r="1.5" fill="var(--sun, #ffd93d)" stroke="none" />
      <path d="M3.8 16.5c2.2-2.7 4-4.1 5.6-2.6 1.3 1.2 2.4 1 3.6-.4 1.9-2.3 4.4-2 7 1.9" />
    </>
  ));
}

export function IconHole(p: P) {
  return base(p, (
    <>
      <ellipse cx="12" cy="15" rx="8.5" ry="4.5" fill="currentColor" opacity={0.85} />
      <path d="M5 8.5c1.2-2.6 3.9-4 7-4s5.8 1.4 7 4" opacity={0.4} />
      <path d="M8.5 5.2l-1-2.2M15.5 5.2l1-2.2M12 4.2V1.8" opacity={0.4} />
    </>
  ));
}

export function IconCrayon(p: P) {
  return base(p, (
    <>
      <path
        d="M6 20.5l-1.6-1.6L15.6 5.7c.9-.9 2.3-.9 3.2 0l-.9-.9c.9.9.9 2.3 0 3.2L6 20.5Z"
        fill="var(--coral, #ff6b6b)"
      />
      <path d="M14.5 6.8l2.7 2.7" />
      <path d="M6 20.5l-3.5 1 1-3.5" fill="#fff" />
    </>
  ));
}

export function IconWhisper(p: P) {
  // shushing speech bubble
  return base(p, (
    <>
      <path
        d="M12 3.5c4.9 0 8.5 2.9 8.5 6.9s-3.6 6.9-8.5 6.9c-.8 0-1.6-.1-2.3-.2L5 19.5l.9-3.6c-1.5-1.2-2.4-3-2.4-5.5 0-4 3.6-6.9 8.5-6.9Z"
        fill="#fff"
      />
      <path d="M9 10.4h6M12 8v4.8" transform="rotate(24 12 10.4)" />
    </>
  ));
}

export function IconMedal({ rank, ...p }: P & { rank: 1 | 2 | 3 }) {
  const fills = { 1: "#f7c948", 2: "#c8ccd6", 3: "#d99a6c" } as const;
  return base(p, (
    <>
      <path d="M8.4 3.5L6 9.5M15.6 3.5L18 9.5" stroke="var(--coral, #ff6b6b)" />
      <path d="M10.5 3.5l-1.4 4M13.5 3.5l1.4 4" stroke="var(--coral, #ff6b6b)" />
      <circle cx="12" cy="14.5" r="6" fill={fills[rank]} />
      <text
        x="12"
        y="17.6"
        textAnchor="middle"
        fontSize="8.5"
        fontWeight="800"
        fill="#26232e"
        stroke="none"
        fontFamily="inherit"
      >
        {rank}
      </text>
    </>
  ));
}

export function IconHint(p: P) {
  return base(p, (
    <>
      <path
        d="M12 3.2c3.7 0 6.4 2.6 6.4 6 0 2.1-1 3.4-2 4.6-.7.8-1.2 1.5-1.4 2.4h-6c-.2-.9-.7-1.6-1.4-2.4-1-1.2-2-2.5-2-4.6 0-3.4 2.7-6 6.4-6Z"
        fill="var(--sun, #ffd93d)"
      />
      <path d="M9.6 19.3h4.8M10.4 21.6h3.2" />
      <path d="M12 6.2c-1.7.2-2.9 1.3-3.2 3" stroke="#fff" strokeWidth={1.6} />
    </>
  ));
}

/** An "O" that is secretly an eye: glances around, blinks now and then. */
function EyeO({ delay = 0 }: { delay?: number }) {
  return (
    <svg
      viewBox="0 0 24 26"
      aria-hidden
      className="wm-eye"
      style={{
        width: "0.72em",
        height: "0.78em",
        display: "inline-block",
        verticalAlign: "-0.06em",
        margin: "0 0.015em",
        animationDelay: `${delay}s`,
      }}
    >
      <ellipse
        cx="12"
        cy="13"
        rx="9.6"
        ry="11"
        fill="#fff"
        stroke="currentColor"
        strokeWidth="3.4"
      />
      <circle
        className="wm-pupil"
        cx="12"
        cy="14"
        r="4.4"
        fill="currentColor"
        style={{ animationDelay: `${delay}s` }}
      />
    </svg>
  );
}

/**
 * Wordmark: "DOODLE" in caps (a touch bigger, the O's are living eyes),
 * "Disaster" in coral title case.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={`wordmark inline-block whitespace-nowrap font-display font-semibold tracking-tight ${className ?? ""}`}
    >
      <span className="text-[1.08em]">
        D<EyeO />
        <EyeO delay={0.15} />
        DLE
      </span>
      <span className="text-coral">&nbsp;Disaster</span>
    </span>
  );
}

/** Three finder squares and a scattering of modules — a QR, at 24px. */
export function IconQr(p: P) {
  return base(p, (
    <>
      <rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1.4" />
      <rect x="14" y="3.5" width="6.5" height="6.5" rx="1.4" />
      <rect x="3.5" y="14" width="6.5" height="6.5" rx="1.4" />
      <path d="M14 14h2.5v2.5H14zM18 18h2.5v2.5H18M14 20.5h2.5" />
    </>
  ));
}

export function IconX(p: P) {
  return base(p, (
    <path d="M6 6.5c4 3.6 8 7.5 11.5 11.5M18 6c-4.2 3.8-8 7.8-11.5 11.5" stroke="var(--coral, #ff6b6b)" />
  ));
}

export function IconGear(p: P) {
  return base(p, (
    <>
      <path
        d="M12 3.2l1.5 2.3 2.7-.5.6 2.7 2.5 1.1-1.3 2.4 1.3 2.4-2.5 1.1-.6 2.7-2.7-.5L12 20.8l-1.5-2.3-2.7.5-.6-2.7-2.5-1.1 1.3-2.4-1.3-2.4 2.5-1.1.6-2.7 2.7.5L12 3.2Z"
        fill="var(--sun, #ffd93d)"
      />
      <circle cx="12" cy="12" r="3.1" fill="#fff" />
    </>
  ));
}

export function IconSkip(p: P) {
  return base(p, (
    <>
      <path d="M5 5.5c3.4 2 5.6 4.2 7 6.5-1.4 2.3-3.6 4.5-7 6.5V5.5Z" fill="var(--sun, #ffd93d)" />
      <path d="M12.5 5.5c3.4 2 5.6 4.2 7 6.5-1.4 2.3-3.6 4.5-7 6.5V5.5Z" fill="var(--sun, #ffd93d)" />
    </>
  ));
}

/* ---------------- reactions ---------------- */

export function IconLaugh(p: P) {
  return base(p, (
    <>
      <circle cx="12" cy="12" r="9" fill="var(--sun, #ffd93d)" />
      <path d="M7.5 9.6c.8-.9 2-.9 2.8 0M13.7 9.6c.8-.9 2-.9 2.8 0" />
      <path d="M7 13c.8 3 2.6 4.6 5 4.6s4.2-1.6 5-4.6c-3.3.9-6.7.9-10 0Z" fill="#fff" />
    </>
  ));
}

export function IconHeart(p: P) {
  return base(p, (
    <path
      d="M12 20.3C6.4 16.9 3.2 13.7 3.4 9.9c.15-2.6 2-4.4 4.4-4.4 1.7 0 3.2.9 4.2 2.5 1-1.6 2.5-2.5 4.2-2.5 2.4 0 4.25 1.8 4.4 4.4.2 3.8-3 7-8.6 10.4Z"
      fill="var(--coral, #ff6b6b)"
    />
  ));
}

export function IconFire(p: P) {
  return base(p, (
    <>
      <path
        d="M12.5 2.8c.6 2.6 2 4.3 3.8 6.1 1.8 1.9 2.9 3.7 2.9 6 0 4-3.2 6.9-7.2 6.9s-7.2-2.9-7.2-6.9c0-2.9 1.6-4.6 3.1-6.4.5 1 .8 1.7 1.7 2.4-.3-3.3.9-6.3 2.9-8.1Z"
        fill="#f5862c"
      />
      <path
        d="M12 21.6c-2 0-3.6-1.5-3.6-3.5 0-1.7 1.2-2.6 2.1-3.9.5.8 1.1 1.2 1.9 1.5-.1-1.1.2-2 .9-2.8 1.5 1.7 2.3 3.2 2.3 5.2s-1.6 3.5-3.6 3.5Z"
        fill="var(--sun, #ffd93d)"
        stroke="none"
      />
    </>
  ));
}

export function IconShock(p: P) {
  return base(p, (
    <>
      <circle cx="12" cy="12" r="9" fill="#fff" />
      <circle cx="8.7" cy="9.7" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="15.3" cy="9.7" r="1.2" fill="currentColor" stroke="none" />
      <ellipse cx="12" cy="15.4" rx="2" ry="2.8" fill="#53c2f0" />
    </>
  ));
}

export function IconClap(p: P) {
  return base(p, (
    <>
      <path
        d="M7.2 11.2L5.5 9.4c-.8-.8-.7-2 .1-2.7.7-.7 1.9-.7 2.6 0l3.6 3.6-1-4.8c-.2-1 .4-1.9 1.4-2.1 1-.2 1.9.4 2.1 1.4l1.2 5.5c.9-.4 2-.3 2.7.5l1.2 1.2c1.1 1.1 1.2 2.9.1 4.1l-3.3 3.7c-2 2.2-5.4 2.3-7.5.2l-3.4-3.4"
        fill="#eecfa5"
      />
      <path d="M3.2 13.5l2.3 2.3M2 17.5l2 .4M19.5 3l-1.6 2M22 6.5l-2.4.9" stroke="var(--coral, #ff6b6b)" />
    </>
  ));
}

export const REACTION_ICONS: Record<string, (p: P) => React.ReactElement> = {
  laugh: IconLaugh,
  heart: IconHeart,
  fire: IconFire,
  shock: IconShock,
  clap: IconClap,
};

export const REACTION_TOKENS = ["laugh", "heart", "fire", "shock", "clap"];

export function ReactionGlyph({ token, size = 20 }: { token: string; size?: number }) {
  const C = REACTION_ICONS[token];
  return C ? <C size={size} /> : <span>{token}</span>;
}

/* ---------------- avatars ---------------- */

export { PlayerAvatar, AVATAR_COUNT } from "./avatars";
