"use client";

import type { CSSProperties } from "react";

/**
 * DoodleDisaster cast: 20 hand-built cartoon faces — grown-ups and kids,
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
  | "bangs";

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
  | "surprised";

interface Face {
  skin: string;
  hair: string;
  style: Hair;
  expr: Expr;
  kid?: boolean;
  beard?: boolean;
  mustache?: boolean;
  glasses?: boolean;
  freckles?: boolean;
}

const CAST: Face[] = [
  { skin: "#f1c27d", hair: "#2b2118", style: "short", expr: "grin" },
  { skin: "#ffdbac", hair: "#5a3a22", style: "long", expr: "laugh" },
  { skin: "#ffe8d1", hair: "#e8c56a", style: "spiky", expr: "tongue", kid: true },
  { skin: "#c68642", hair: "#2b2118", style: "bald", expr: "smirk", mustache: true },
  { skin: "#ffdbac", hair: "#a03a2f", style: "pigtails", expr: "happy", kid: true, freckles: true },
  { skin: "#8d5524", hair: "#3b5ba5", style: "cap", expr: "cool" },
  { skin: "#f1c27d", hair: "#2b2118", style: "bob", expr: "wink" },
  { skin: "#e0ac69", hair: "#5a3a22", style: "curly", expr: "shock", kid: true },
  { skin: "#ffdbac", hair: "#8b5a2b", style: "short", expr: "happy", beard: true },
  { skin: "#f1c27d", hair: "#e8c56a", style: "bun", expr: "smirk" },
  { skin: "#c68642", hair: "#2b2118", style: "cap", expr: "laugh", kid: true },
  { skin: "#ffe8d1", hair: "#6e6e78", style: "short", expr: "derp", glasses: true },
  { skin: "#ffdbac", hair: "#d94f70", style: "long", expr: "tongue" },
  { skin: "#8d5524", hair: "#2b2118", style: "bangs", expr: "happy", kid: true },
  { skin: "#e0ac69", hair: "#a03a2f", style: "spiky", expr: "shock" },
  { skin: "#f1c27d", hair: "#2b2118", style: "ponytail", expr: "cool" },
  { skin: "#ffe8d1", hair: "#5a3a22", style: "beanie", expr: "wink", kid: true },
  { skin: "#c68642", hair: "#2b2118", style: "flattop", expr: "laugh" },
  { skin: "#ffdbac", hair: "#e8c56a", style: "curly", expr: "surprised" },
  { skin: "#ffe8d1", hair: "#c98a3b", style: "bangs", expr: "grin", kid: true, freckles: true },
];

export const AVATAR_COUNT = CAST.length;

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
    default:
      return null;
  }
}

function Eyes({ f }: { f: Face }) {
  const lx = 12.3;
  const rx = 19.7;
  const y = f.kid ? 17.2 : 16.6;
  const r = f.kid ? 1.55 : 1.3;
  switch (f.expr) {
    case "laugh":
      return (
        <g stroke={INK} strokeWidth={1.6} fill="none" strokeLinecap="round">
          <path d={`M${lx - 1.7} ${y + 0.7} q1.7 -2.4 3.4 0`} />
          <path d={`M${rx - 1.7} ${y + 0.7} q1.7 -2.4 3.4 0`} />
        </g>
      );
    case "wink":
      return (
        <>
          <circle cx={lx} cy={y} r={r} fill={INK} />
          <path d={`M${rx - 1.8} ${y} h3.6`} stroke={INK} strokeWidth={1.7} strokeLinecap="round" />
        </>
      );
    case "shock":
    case "surprised":
      return (
        <>
          <circle cx={lx} cy={y} r="2.9" fill="#fff" stroke={INK} strokeWidth={1.4} />
          <circle cx={rx} cy={y} r="2.9" fill="#fff" stroke={INK} strokeWidth={1.4} />
          <circle cx={lx + 0.3} cy={y + 0.4} r="1.25" fill={INK} />
          <circle cx={rx + 0.3} cy={y + 0.4} r="1.25" fill={INK} />
        </>
      );
    case "cool":
      return (
        <>
          <path d={`M7.4 ${y - 2.2} H24.6`} stroke={INK} strokeWidth={1.5} strokeLinecap="round" />
          <rect x="8" y={y - 2.4} width="7.2" height="4.8" rx="1.8" fill={INK} />
          <rect x="16.8" y={y - 2.4} width="7.2" height="4.8" rx="1.8" fill={INK} />
        </>
      );
    case "derp":
      return (
        <>
          <circle cx={lx - 0.3} cy={y - 0.6} r="2.7" fill="#fff" stroke={INK} strokeWidth={1.3} />
          <circle cx={rx} cy={y + 0.5} r="1.7" fill="#fff" stroke={INK} strokeWidth={1.3} />
          <circle cx={lx} cy={y - 0.3} r="1.2" fill={INK} />
          <circle cx={rx - 0.4} cy={y + 0.6} r="0.85" fill={INK} />
        </>
      );
    case "smirk":
      return (
        <>
          <circle cx={lx} cy={y} r={r} fill={INK} />
          <circle cx={rx} cy={y} r={r} fill={INK} />
          <path d={`M${rx - 2.4} ${y - 3.4} q2.4 -1.4 4.6 0.4`} stroke={INK} strokeWidth={1.4} fill="none" strokeLinecap="round" />
        </>
      );
    default:
      return (
        <>
          <circle cx={lx} cy={y} r={r} fill={INK} />
          <circle cx={rx} cy={y} r={r} fill={INK} />
        </>
      );
  }
}

function Mouth({ f }: { f: Face }) {
  const y = f.kid ? 22.2 : 21.8;
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
      return <ellipse cx="16" cy={y + 0.6} rx="2.4" ry="3.1" fill={INK} />;
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
          <circle cx="6.7" cy="18.4" r="2" fill={f.skin} stroke={INK} strokeWidth={1.4} />
          <circle cx="25.3" cy="18.4" r="2" fill={f.skin} stroke={INK} strokeWidth={1.4} />
        </>
      )}
      <ellipse
        cx="16"
        cy={f.kid ? 18 : 17.6}
        rx={f.kid ? 9.9 : 9.5}
        ry={f.kid ? 10.2 : 10.6}
        fill={f.skin}
        stroke={INK}
        strokeWidth={1.7}
      />
      {f.beard && (
        <path d="M6.8 18.6 Q7.6 29.4 16 29.4 Q24.4 29.4 25.2 18.6 Q22 24.6 16 24.6 Q10 24.6 6.8 18.6 Z" fill={f.hair} stroke={INK} strokeWidth={1.4} strokeLinejoin="round" />
      )}
      <Hairdo f={f} />
      {f.kid && (
        <>
          <circle cx="9.6" cy="20.8" r="1.7" fill="#e86868" opacity="0.4" />
          <circle cx="22.4" cy="20.8" r="1.7" fill="#e86868" opacity="0.4" />
        </>
      )}
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
          <circle cx="12.3" cy={f.kid ? 17.2 : 16.6} r="3.5" />
          <circle cx="19.7" cy={f.kid ? 17.2 : 16.6} r="3.5" />
          <path d={`M15.8 ${f.kid ? 17.2 : 16.6} h0.4`} />
        </g>
      )}
      <Mouth f={f} />
      {f.mustache && (
        <path d="M11.6 19.8 q4.4 -2.2 8.8 0 q-2.6 2.8 -4.4 0.6 q-1.8 2.2 -4.4 -0.6 Z" fill={f.hair} stroke={INK} strokeWidth={1.2} strokeLinejoin="round" />
      )}
    </svg>
  );
}
