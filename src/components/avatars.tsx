"use client";

import type { CSSProperties } from "react";

/**
 * DoodleDisaster cast: 40 hand-built cartoon faces — grown-ups and kids,
 * all mid-expression. Tokens stay "aN" so existing rooms keep their avatars.
 */

const INK = "#26232e";

type Hair =
  | "short"
  | "spiky"
  | "bob"
  | "long"
  | "ponytail"
  | "pigtails"
  | "bald"
  | "cap"
  | "curly"
  | "bun"
  | "beanie"
  | "flattop"
  | "bangs"
  | "mohawk"
  | "buns"
  | "braids"
  | "swoop";

type Expr =
  | "grin"
  | "laugh"
  | "wink"
  | "tongue"
  | "shock"
  | "cool"
  | "smirk"
  | "happy"
  | "derp"
  | "surprised"
  | "crosseyed"
  | "shout";

interface Face {
  skin: string;
  hair: string;
  style: Hair;
  expr: Expr;
  sex: "boy" | "girl";
  kid?: boolean;
  beard?: boolean;
  mustache?: boolean;
  glasses?: boolean;
  freckles?: boolean;
  unibrow?: boolean;
  buckteeth?: boolean;
  eyepatch?: boolean;
  monocle?: boolean;
  bignose?: boolean;
  blush?: boolean;
  sweat?: boolean;
  browRaise?: boolean;
  earring?: boolean;
  bandaid?: boolean;
}

const CAST: Face[] = [
  // Every single one carries at least one daft feature, and no two share the
  // same combination — hair colours are deliberately unserious.
  { skin: "#f1c27d", hair: "#2b2118", style: "short", expr: "derp", sex: "boy", unibrow: true },
  { skin: "#ffdbac", hair: "#7ac74f", style: "long", expr: "laugh", sex: "girl", blush: true },
  { skin: "#ffe8d1", hair: "#e8c56a", style: "spiky", expr: "tongue", sex: "boy", kid: true, buckteeth: true },
  { skin: "#c68642", hair: "#2b2118", style: "bald", expr: "smirk", sex: "boy", mustache: true, monocle: true },
  { skin: "#ffdbac", hair: "#a03a2f", style: "pigtails", expr: "shout", sex: "girl", kid: true, freckles: true },
  { skin: "#8d5524", hair: "#3b5ba5", style: "cap", expr: "cool", sex: "boy", earring: true },
  { skin: "#f1c27d", hair: "#d94f70", style: "bob", expr: "wink", sex: "girl", blush: true, freckles: true },
  { skin: "#e0ac69", hair: "#5a3a22", style: "curly", expr: "shock", sex: "boy", kid: true, sweat: true },
  { skin: "#ffdbac", hair: "#8b5a2b", style: "short", expr: "happy", sex: "boy", beard: true, bandaid: true },
  { skin: "#f1c27d", hair: "#9b5de5", style: "bun", expr: "smirk", sex: "girl", browRaise: true },
  { skin: "#c68642", hair: "#2b2118", style: "cap", expr: "crosseyed", sex: "boy", kid: true, buckteeth: true },
  { skin: "#ffe8d1", hair: "#6e6e78", style: "short", expr: "derp", sex: "boy", glasses: true, bignose: true },
  { skin: "#ffdbac", hair: "#00b4d8", style: "long", expr: "tongue", sex: "girl", earring: true },
  { skin: "#8d5524", hair: "#2b2118", style: "bangs", expr: "surprised", sex: "girl", kid: true, blush: true },
  { skin: "#e0ac69", hair: "#ff7b00", style: "spiky", expr: "shout", sex: "boy", sweat: true },
  { skin: "#f1c27d", hair: "#2b2118", style: "ponytail", expr: "cool", sex: "girl", monocle: true },
  { skin: "#ffe8d1", hair: "#5a3a22", style: "beanie", expr: "wink", sex: "boy", kid: true, freckles: true },
  { skin: "#c68642", hair: "#2b2118", style: "flattop", expr: "laugh", sex: "boy", unibrow: true, bignose: true },
  { skin: "#ffdbac", hair: "#e8c56a", style: "curly", expr: "surprised", sex: "girl", browRaise: true, blush: true },
  { skin: "#ffe8d1", hair: "#c98a3b", style: "bangs", expr: "grin", sex: "girl", kid: true, bandaid: true },
  { skin: "#f1c27d", hair: "#e63946", style: "mohawk", expr: "shout", sex: "boy", earring: true },
  { skin: "#ffdbac", hair: "#2b2118", style: "buns", expr: "tongue", sex: "girl", freckles: true, blush: true },
  { skin: "#c68642", hair: "#9b5de5", style: "braids", expr: "grin", sex: "girl", kid: true, buckteeth: true },
  { skin: "#ffe8d1", hair: "#c98a3b", style: "swoop", expr: "crosseyed", sex: "boy", buckteeth: true, sweat: true },
  { skin: "#e0ac69", hair: "#6e6e78", style: "bald", expr: "smirk", sex: "boy", monocle: true, beard: true },
  { skin: "#ffdbac", hair: "#ff8fab", style: "pigtails", expr: "derp", sex: "girl", kid: true, bandaid: true },
  { skin: "#8d5524", hair: "#2b2118", style: "curly", expr: "laugh", sex: "boy", bignose: true, glasses: true },
  { skin: "#f1c27d", hair: "#7ac74f", style: "long", expr: "crosseyed", sex: "girl", earring: true },
  { skin: "#ffe8d1", hair: "#5a3a22", style: "spiky", expr: "happy", sex: "boy", eyepatch: true, bandaid: true },
  { skin: "#c68642", hair: "#3b5ba5", style: "buns", expr: "wink", sex: "girl", blush: true, browRaise: true },
  { skin: "#ffdbac", hair: "#2b2118", style: "short", expr: "shock", sex: "boy", unibrow: true, sweat: true },
  { skin: "#e0ac69", hair: "#a03a2f", style: "bob", expr: "tongue", sex: "girl", freckles: true, browRaise: true },
  { skin: "#f1c27d", hair: "#8b5a2b", style: "beanie", expr: "shout", sex: "boy", beard: true, unibrow: true },
  { skin: "#ffe8d1", hair: "#00b4d8", style: "swoop", expr: "cool", sex: "girl", earring: true, blush: true },
  { skin: "#8d5524", hair: "#2b2118", style: "flattop", expr: "crosseyed", sex: "boy", glasses: true, mustache: true },
  { skin: "#ffdbac", hair: "#ff7b00", style: "braids", expr: "surprised", sex: "girl", sweat: true },
  { skin: "#c68642", hair: "#e63946", style: "mohawk", expr: "grin", sex: "boy", kid: true, buckteeth: true, freckles: true },
  { skin: "#f1c27d", hair: "#6e6e78", style: "bun", expr: "laugh", sex: "girl", glasses: true, bandaid: true },
  { skin: "#ffe8d1", hair: "#a03a2f", style: "cap", expr: "derp", sex: "boy", kid: true, bignose: true },
  { skin: "#e0ac69", hair: "#ff8fab", style: "bangs", expr: "shock", sex: "girl", kid: true, browRaise: true, blush: true },
];

/** picker tabs */
export const AVATARS_BY_SEX = {
  boy: CAST.map((f, i) => ({ f, i })).filter((x) => x.f.sex === "boy").map((x) => x.i),
  girl: CAST.map((f, i) => ({ f, i })).filter((x) => x.f.sex === "girl").map((x) => x.i),
};

export const AVATAR_COUNT = CAST.length;

/**
 * A face for someone who never picked one. Party players join by typing a
 * name and nothing else, so their id is hashed into the cast — stable for as
 * long as that phone keeps its id, and different for every phone in the room.
 */
export function avatarToken(seed: string, chosen?: string): string {
  if (chosen && /^a\d+$/.test(chosen)) return chosen;
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `a${(h >>> 0) % CAST.length}`;
}

const S = { stroke: INK, strokeWidth: 1.5, strokeLinejoin: "round" as const };

function Hairdo({ f }: { f: Face }) {
  const c = f.hair;
  switch (f.style) {
    case "short":
      return <path d="M6.6 15.4 Q6.8 5.6 16 5.6 Q25.2 5.6 25.4 15.4 Q21 10.8 16 10.8 Q11 10.8 6.6 15.4 Z" fill={c} {...S} />;
    case "spiky":
      return (
        <path
          d="M6.7 14.6 L9 7 L11.4 12 L13.8 5.9 L16.3 11.4 L18.8 6.2 L21.3 11.8 L23.9 7.1 L25.3 14.6 Q16 10.2 6.7 14.6 Z"
          fill={c}
          {...S}
        />
      );
    case "bob":
      return <path d="M5.8 17 Q5.8 5.4 16 5.4 Q26.2 5.4 26.2 17 L26.2 21 Q24.4 13.6 16 12.4 Q7.6 13.6 5.8 21 Z" fill={c} {...S} />;
    case "long":
      return <path d="M5.6 17 Q5.6 5.2 16 5.2 Q26.4 5.2 26.4 17 L26.4 28 Q25 15.4 16 12.6 Q7 15.4 5.6 28 Z" fill={c} {...S} />;
    case "bangs":
      return <path d="M5.8 17 Q5.8 5.4 16 5.4 Q26.2 5.4 26.2 17 L26.2 26 Q25 14 16 13.4 Q7 14 5.8 26 Z" fill={c} {...S} />;
    case "ponytail":
      return (
        <>
          <ellipse cx="27.4" cy="15.6" rx="3.6" ry="4.6" fill={c} {...S} />
          <path d="M6.6 15.4 Q6.8 5.6 16 5.6 Q25.2 5.6 25.4 15.4 Q21 10.8 16 10.8 Q11 10.8 6.6 15.4 Z" fill={c} {...S} />
        </>
      );
    case "pigtails":
      return (
        <>
          <circle cx="5.2" cy="17.4" r="3.8" fill={c} {...S} />
          <circle cx="26.8" cy="17.4" r="3.8" fill={c} {...S} />
          <path d="M6.6 15 Q6.8 5.4 16 5.4 Q25.2 5.4 25.4 15 Q21 10.4 16 10.4 Q11 10.4 6.6 15 Z" fill={c} {...S} />
        </>
      );
    case "curly":
      return (
        <>
          <circle cx="9.8" cy="10.4" r="4.2" fill={c} {...S} />
          <circle cx="16" cy="7.6" r="4.6" fill={c} {...S} />
          <circle cx="22.2" cy="10.4" r="4.2" fill={c} {...S} />
        </>
      );
    case "bun":
      return (
        <>
          <circle cx="16" cy="4.8" r="3.4" fill={c} {...S} />
          <path d="M6.6 15.4 Q6.8 6 16 6 Q25.2 6 25.4 15.4 Q21 10.8 16 10.8 Q11 10.8 6.6 15.4 Z" fill={c} {...S} />
        </>
      );
    case "flattop":
      return <path d="M6.8 14.8 L6.8 8.2 L25.2 8.2 L25.2 14.8 Q16 10.6 6.8 14.8 Z" fill={c} {...S} />;
    case "cap":
      return (
        <>
          <path d="M6.4 14 Q6.8 4.8 16 4.8 Q25.2 4.8 25.6 14 Z" fill={c} {...S} />
          <path d="M24.6 13.6 Q31.4 13.4 30.6 17 L23.6 15.6 Z" fill={c} {...S} />
          <circle cx="16" cy="4.6" r="1.2" fill={c} {...S} />
        </>
      );
    case "beanie":
      return (
        <>
          <path d="M6.6 13.4 Q7 5 16 5 Q25 5 25.4 13.4 Z" fill={c} {...S} />
          <rect x="6" y="12.6" width="20" height="3.4" rx="1.4" fill={c} {...S} />
          <circle cx="16" cy="3.6" r="1.9" fill={c} {...S} />
        </>
      );
    case "mohawk":
      return (
        <>
          <path d="M6.8 15.6 Q7 8.6 11 6.6 Q10.4 12 10.6 14.8 Z" fill={c} {...S} />
          <path d="M25.2 15.6 Q25 8.6 21 6.6 Q21.6 12 21.4 14.8 Z" fill={c} {...S} />
          <path d="M12.6 12.6 Q16 1.6 19.4 12.6 Q16 10.2 12.6 12.6 Z" fill={c} {...S} />
        </>
      );
    case "buns":
      return (
        <>
          <circle cx="7.6" cy="7.2" r="3.6" fill={c} {...S} />
          <circle cx="24.4" cy="7.2" r="3.6" fill={c} {...S} />
          <path d="M6.6 15 Q6.8 5.4 16 5.4 Q25.2 5.4 25.4 15 Q21 10.4 16 10.4 Q11 10.4 6.6 15 Z" fill={c} {...S} />
        </>
      );
    case "braids":
      return (
        <>
          <path d="M5.8 17 Q5.8 5.4 16 5.4 Q26.2 5.4 26.2 17 L26.2 20 Q24.4 13.2 16 12.2 Q7.6 13.2 5.8 20 Z" fill={c} {...S} />
          <path d="M6.6 19 q-1.4 5 0.6 8.6" stroke={c} strokeWidth={3.4} fill="none" strokeLinecap="round" />
          <path d="M25.4 19 q1.4 5 -0.6 8.6" stroke={c} strokeWidth={3.4} fill="none" strokeLinecap="round" />
          <circle cx="7.6" cy="28" r="1.5" fill="#e86868" stroke={INK} strokeWidth={1.2} />
          <circle cx="24.4" cy="28" r="1.5" fill="#e86868" stroke={INK} strokeWidth={1.2} />
        </>
      );
    case "swoop":
      return (
        <path d="M6.4 15.6 Q6.6 5 16 5 Q25.6 5 25.8 12 Q22 6.6 15 9.6 Q9.4 12 6.4 15.6 Z" fill={c} {...S} />
      );
    default:
      return null;
  }
}

/**
 * Where a face's parts live, in one place.
 *
 * Cuteness is mostly geometry, and the old cast got the geometry of an adult:
 * 1.3px pupils sitting above the middle of the head. The baby schema is the
 * opposite — big glossy eyes, set low and wide, with a small mouth tucked
 * close underneath. Everything that hangs off a face (glasses, a monocle, an
 * eyepatch) reads from here, so a decoration can never drift off the eye it
 * belongs to.
 */
const GEO = (f: Face) => ({
  cx: 16,
  headY: f.kid ? 17.9 : 17.6,
  headRx: f.kid ? 10.3 : 10.0,
  headRy: f.kid ? 10.4 : 10.5,
  earY: f.kid ? 19.0 : 18.8,
  eyeL: f.kid ? 11.4 : 11.7,
  eyeR: f.kid ? 20.6 : 20.3,
  eyeY: f.kid ? 18.6 : 18.2,
  /** white of the eye */
  iris: f.kid ? 3.25 : 3.0,
  pupil: f.kid ? 1.95 : 1.8,
  mouthY: f.kid ? 23.2 : 22.9,
  blushY: f.kid ? 21.8 : 21.4,
});

/**
 * One eye: white, a big pupil sitting slightly low in it, and the highlight
 * that does most of the work. Take the highlight away and the same face reads
 * as a doll rather than a child.
 */
function Eye({
  x,
  y,
  iris,
  pupil,
  look = 0,
}: {
  x: number;
  y: number;
  iris: number;
  pupil: number;
  /** shifts the pupil sideways, for a squint or a cross-eyed stare */
  look?: number;
}) {
  const px = x + look;
  return (
    <>
      <circle cx={x} cy={y} r={iris} fill="#fff" stroke={INK} strokeWidth={1.35} />
      <circle cx={px} cy={y + iris * 0.13} r={pupil} fill={INK} />
      <circle
        cx={px - pupil * 0.4}
        cy={y + iris * 0.13 - pupil * 0.5}
        r={pupil * 0.42}
        fill="#fff"
      />
    </>
  );
}

function Eyes({ f }: { f: Face }) {
  const g = GEO(f);
  const { eyeL: lx, eyeR: rx, eyeY: y, iris, pupil } = g;
  const pair = (look = 0, scale = 1) => (
    <>
      <Eye x={lx} y={y} iris={iris * scale} pupil={pupil * scale} look={look} />
      <Eye x={rx} y={y} iris={iris * scale} pupil={pupil * scale} look={-look} />
    </>
  );

  switch (f.expr) {
    case "laugh":
      // squeezed shut — two happy arches, the one place there is no pupil
      return (
        <g stroke={INK} strokeWidth={2} fill="none" strokeLinecap="round">
          <path d={`M${lx - 2.6} ${y + 1.2} q2.6 -3.6 5.2 0`} />
          <path d={`M${rx - 2.6} ${y + 1.2} q2.6 -3.6 5.2 0`} />
        </g>
      );
    case "wink":
      return (
        <>
          <Eye x={lx} y={y} iris={iris} pupil={pupil} />
          <path
            d={`M${rx - 2.6} ${y + 0.6} q2.6 -3.2 5.2 0`}
            stroke={INK}
            strokeWidth={2}
            fill="none"
            strokeLinecap="round"
          />
        </>
      );
    case "shock":
    case "surprised":
      return pair(0, 1.16);
    case "cool":
      return (
        <>
          <path
            d={`M${lx - 4.6} ${y - 2.6} H${rx + 4.6}`}
            stroke={INK}
            strokeWidth={1.6}
            strokeLinecap="round"
          />
          <rect x={lx - 4.4} y={y - 2.9} width="8.4" height="5.6" rx="2.4" fill={INK} />
          <rect x={rx - 4.0} y={y - 2.9} width="8.4" height="5.6" rx="2.4" fill={INK} />
        </>
      );
    case "derp":
      // deliberately mismatched: one wide, one small and lower
      return (
        <>
          <Eye x={lx - 0.2} y={y - 0.7} iris={iris * 1.1} pupil={pupil * 0.9} look={0.5} />
          <Eye x={rx} y={y + 0.7} iris={iris * 0.78} pupil={pupil * 0.72} look={-0.4} />
        </>
      );
    case "crosseyed":
      return pair(1.15);
    case "shout":
      return (
        <>
          {pair(0, 0.92)}
          <g stroke={INK} strokeWidth={1.7} fill="none" strokeLinecap="round">
            <path d={`M${lx - 3.4} ${y - 4.6} q2.4 -1.6 4.8 0.4`} />
            <path d={`M${rx + 3.4} ${y - 4.6} q-2.4 -1.6 -4.8 0.4`} />
          </g>
        </>
      );
    case "smirk":
      return (
        <>
          {pair(0.5)}
          <path
            d={`M${rx - 3} ${y - 4.8} q3 -1.6 5.6 0.6`}
            stroke={INK}
            strokeWidth={1.5}
            fill="none"
            strokeLinecap="round"
          />
        </>
      );
    default:
      return pair();
  }
}

function Mouth({ f }: { f: Face }) {
  const y = GEO(f).mouthY;
  const st = { stroke: INK, strokeWidth: 1.6, fill: "none", strokeLinecap: "round" as const };
  switch (f.expr) {
    case "laugh":
      return (
        <>
          <path d={`M11.4 ${y - 0.6} q4.6 5.4 9.2 0 Z`} fill={INK} />
          <path d={`M12.6 ${y - 0.2} q3.4 1 6.8 0`} stroke="#fff" strokeWidth={1.4} fill="none" />
        </>
      );
    case "tongue":
      return (
        <>
          <path d={`M12 ${y - 0.4} q4 4.4 8 0`} {...st} />
          <path d={`M14.6 ${y + 1.6} q1.6 3.4 3.6 0.4 q-0.4 3 -2 3 q-1.6 0 -1.6 -3.4 Z`} fill="#e86868" stroke={INK} strokeWidth={1.2} />
        </>
      );
    case "shock":
      return <ellipse cx="16" cy={y + 0.4} rx="2.1" ry="2.5" fill={INK} />;
    case "shout":
      return (
        <>
          <ellipse cx="16" cy={y + 0.7} rx="3.1" ry="3.4" fill={INK} />
          <path d={`M13.6 ${y + 2.5} q2.4 1.7 4.8 0`} stroke="#e86868" strokeWidth={1.8} fill="none" />
        </>
      );
    case "crosseyed":
      return <path d={`M12.4 ${y} q1.8 2.2 3.6 0 q1.8 -2.2 3.6 0`} {...st} />;
    case "surprised":
      return <ellipse cx="16" cy={y + 0.4} rx="1.7" ry="2.1" fill={INK} />;
    case "cool":
      return <path d={`M12.6 ${y} q3.4 2.6 6.8 -1`} {...st} />;
    case "smirk":
      return <path d={`M12.4 ${y + 0.4} q3.6 2.4 7 -1.6`} {...st} />;
    case "derp":
      return <path d={`M12 ${y} q1.6 -1.6 3.2 0 q1.6 1.6 3.2 0 q1.6 -1.6 2.6 0.4`} {...st} />;
    case "grin":
      return (
        <>
          <path d={`M11.8 ${y - 0.6} q4.2 4.2 8.4 0 Z`} fill="#fff" stroke={INK} strokeWidth={1.4} strokeLinejoin="round" />
          <path d={`M11.8 ${y - 0.6} h8.4`} stroke={INK} strokeWidth={1.2} />
        </>
      );
    default:
      return <path d={`M12.2 ${y - 0.4} q3.8 4 7.6 0`} {...st} />;
  }
}

/** Renders an "aN" token as a cartoon face. */
export function PlayerAvatar({
  token,
  size = 26,
  className,
  style,
}: {
  token: string;
  size?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const m = /^a(\d+)$/.exec(token ?? "");
  if (!m) {
    return (
      <span className={className} style={{ fontSize: size * 0.85, lineHeight: 1, ...style }}>
        {token}
      </span>
    );
  }
  const f = CAST[Number(m[1]) % CAST.length];
  const g = GEO(f);
  const hidesEars = ["long", "bob", "bangs", "pigtails"].includes(f.style);
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      aria-hidden
      className={className}
      style={{ display: "inline-block", verticalAlign: "-0.24em", ...style }}
    >
      {!hidesEars && (
        <>
          <circle cx={g.cx - g.headRx + 0.6} cy={g.earY} r="2.1" fill={f.skin} stroke={INK} strokeWidth={1.4} />
          <circle cx={g.cx + g.headRx - 0.6} cy={g.earY} r="2.1" fill={f.skin} stroke={INK} strokeWidth={1.4} />
        </>
      )}
      <ellipse
        cx="16"
        cy={g.headY}
        rx={g.headRx}
        ry={g.headRy}
        fill={f.skin}
        stroke={INK}
        strokeWidth={1.7}
      />
      {f.beard && (
        <path
          d={`M6.8 18.6 Q7.6 29.2 16 29.2 Q24.4 29.2 25.2 18.6 Q22 ${g.mouthY + 2.8} 16 ${g.mouthY + 2.8} Q10 ${g.mouthY + 2.8} 6.8 18.6 Z`}
          fill={f.hair}
          stroke={INK}
          strokeWidth={1.4}
          strokeLinejoin="round"
        />
      )}
      <Hairdo f={f} />
      <g fill="#e86868" opacity={f.kid ? 0.42 : 0.26}>
        <ellipse cx={g.eyeL - 2.6} cy={g.blushY} rx={f.kid ? 2.1 : 1.9} ry={f.kid ? 1.5 : 1.3} />
        <ellipse cx={g.eyeR + 2.6} cy={g.blushY} rx={f.kid ? 2.1 : 1.9} ry={f.kid ? 1.5 : 1.3} />
      </g>
      {f.freckles && (
        <g fill={INK} opacity="0.45">
          <circle cx="10.4" cy="20" r="0.5" />
          <circle cx="12.2" cy="21" r="0.5" />
          <circle cx="19.8" cy="21" r="0.5" />
          <circle cx="21.6" cy="20" r="0.5" />
        </g>
      )}
      <Eyes f={f} />
      {f.glasses && (
        <g stroke={INK} strokeWidth={1.4} fill="none">
          <circle cx={g.eyeL} cy={g.eyeY} r={g.iris + 0.75} />
          <circle cx={g.eyeR} cy={g.eyeY} r={g.iris + 0.75} />
          <path d={`M${g.eyeL + g.iris + 0.75} ${g.eyeY} H${g.eyeR - g.iris - 0.75}`} />
        </g>
      )}
      <Mouth f={f} />
      {f.bignose && (
        <ellipse cx={g.cx} cy={g.eyeY + 2.6} rx="2.6" ry="2.1" fill={f.skin} stroke={INK} strokeWidth={1.4} />
      )}
      {f.unibrow && (
        <path d="M9.4 13.4 q6.6 -2.2 13.2 0 q-6.6 1.2 -13.2 0 Z" fill={f.hair} stroke={INK} strokeWidth={1.2} strokeLinejoin="round" />
      )}
      {f.buckteeth && (
        <g stroke={INK} strokeWidth={1.1}>
          <rect x="13.8" y={g.mouthY + 0.5} width="2.1" height="3" rx="0.5" fill="#fff" />
          <rect x="16.1" y={g.mouthY + 0.5} width="2.1" height="3" rx="0.5" fill="#fff" />
        </g>
      )}
      {f.eyepatch && (
        <g>
          <path d={`M6.4 ${g.eyeY - 4.2} Q16 ${g.eyeY - 6.4} 25.6 ${g.eyeY - 4.2}`} stroke={INK} strokeWidth={1.3} fill="none" />
          <circle cx={g.eyeR} cy={g.eyeY} r={g.iris + 0.4} fill={INK} />
        </g>
      )}
      {f.monocle && (
        <g stroke={INK} strokeWidth={1.4} fill="none">
          <circle cx={g.eyeR} cy={g.eyeY} r={g.iris + 0.95} fill="rgba(255,255,255,0.35)" />
          <path d={`M${g.eyeR + 3} ${g.eyeY + 2.6} q1.6 3.4 0.4 6`} />
        </g>
      )}
      {f.mustache && (
        <path
          d={`M11.6 ${g.mouthY - 1.9} q4.4 -2.2 8.8 0 q-2.6 2.8 -4.4 0.6 q-1.8 2.2 -4.4 -0.6 Z`}
          fill={f.hair}
          stroke={INK}
          strokeWidth={1.2}
          strokeLinejoin="round"
        />
      )}
      {f.blush && (
        <g fill="#ff8a8a" opacity="0.5">
          <ellipse cx={g.eyeL - 2.6} cy={g.blushY} rx="2.4" ry="1.6" />
          <ellipse cx={g.eyeR + 2.6} cy={g.blushY} rx="2.4" ry="1.6" />
        </g>
      )}
      {f.browRaise && (
        <path d="M18.1 12.4 q1.9 -1.6 3.8 -0.4" stroke={INK} strokeWidth={1.4} fill="none" strokeLinecap="round" />
      )}
      {f.sweat && (
        <path d="M24.6 12.2 q1.9 2.6 0 3.9 q-1.9 -1.3 0 -3.9 Z" fill="#8fd3f4" stroke={INK} strokeWidth={1} strokeLinejoin="round" />
      )}
      {f.earring && (
        <g stroke={INK} strokeWidth={1.1} fill="#f7c948">
          <circle cx="6.5" cy="19.4" r="1.3" />
        </g>
      )}
      {f.bandaid && (
        <g transform="rotate(-18 22 12.6)">
          <rect x="19.4" y="11.2" width="5.4" height="2.7" rx="1.2" fill="#ffd9a8" stroke={INK} strokeWidth={1.1} />
          <circle cx="22.1" cy="12.55" r="0.9" fill="#e8b878" />
        </g>
      )}
    </svg>
  );
}
