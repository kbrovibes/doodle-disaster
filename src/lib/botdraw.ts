/**
 * Bot drawing engine.
 *
 * Two layers:
 *  1. RECIPES — hand-authored doodles in a 100x75 grid (y grows downward).
 *     Deliberately simple: the kind of thing a person scribbles in 30 seconds.
 *  2. humanize() — turns a clean recipe into something a HAND made: line
 *     tremor, per-stroke rotation/scale drift, circles that overshoot or
 *     don't quite close, hesitation before details, minimum-jerk speed, and
 *     the occasional wrong stroke that gets undone.
 *
 * Output is wire-format (x and y both normalized 0..1000) so it replays
 * through the exact same channel as a human's strokes.
 */

type Pt = [number, number];

interface RStroke {
  pts: Pt[];
  w?: number; // brush width (virtual px, 1000-wide canvas)
  color?: string;
  sealed?: boolean; // must close cleanly (encloses a fill)
  curve?: boolean; // round the corners (organic blobs)
}

interface Recipe {
  s: RStroke[];
  f?: { x: number; y: number; c: string; after?: number }[];
}

const INK = "#1d1d24";

// ---- tiny geometry helpers ------------------------------------------------

const ell = (
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  n = 26,
  a0 = 0,
  a1 = Math.PI * 2
): Pt[] => {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return out;
};
const cir = (cx: number, cy: number, r: number, n = 26): Pt[] =>
  ell(cx, cy, r, r, n);
const arc = (
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  a0: number,
  a1: number,
  n = 16
): Pt[] => ell(cx, cy, rx, ry, n, a0, a1);
const ln = (x1: number, y1: number, x2: number, y2: number): Pt[] => [
  [x1, y1],
  [x2, y2],
];
const pl = (...p: Pt[]): Pt[] => p;
const rct = (x: number, y: number, w: number, h: number): Pt[] => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
  [x, y],
];
/** ellipse rotated by `rot` radians — petals, wings, leaves */
const rell = (
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  rot: number,
  n = 20
): Pt[] => {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return ell(0, 0, rx, ry, n).map(
    ([x, y]) => [cx + x * c - y * s, cy + x * s + y * c] as Pt
  );
};

/** Catmull-Rom through the anchors — turns a rough outline into a soft blob. */
const smooth = (pts: Pt[], per = 8): Pt[] => {
  const closed =
    Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) <
    0.001;
  const p = closed ? pts.slice(0, -1) : pts;
  const n = p.length;
  if (n < 3) return pts;
  const at = (i: number) =>
    closed ? p[((i % n) + n) % n] : p[Math.max(0, Math.min(n - 1, i))];
  const out: Pt[] = [];
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    for (let k = 0; k < per; k++) {
      const t = k / per;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push([
        0.5 *
          (2 * p1[0] +
            (-p0[0] + p2[0]) * t +
            (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
            (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 *
          (2 * p1[1] +
            (-p0[1] + p2[1]) * t +
            (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
            (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  out.push(closed ? out[0] : p[n - 1]);
  return out;
};

const star = (cx: number, cy: number, R: number, r: number, n = 5): Pt[] => {
  const out: Pt[] = [];
  for (let i = 0; i <= n * 2; i++) {
    const a = (Math.PI * i) / n - Math.PI / 2;
    const rad = i % 2 === 0 ? R : r;
    out.push([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad]);
  }
  return out;
};
const rays = (cx: number, cy: number, r0: number, r1: number, n: number): RStroke[] =>
  Array.from({ length: n }, (_, i) => {
    const a = (Math.PI * 2 * i) / n;
    return {
      pts: ln(
        cx + Math.cos(a) * r0,
        cy + Math.sin(a) * r0,
        cx + Math.cos(a) * r1,
        cy + Math.sin(a) * r1
      ),
      w: 8,
    };
  });
const dots = (list: Pt[], r = 1.2): RStroke[] =>
  list.map(([x, y]) => ({ pts: cir(x, y, r, 10), w: 6 }));

// ---- the doodle book ------------------------------------------------------

const RECIPES: Record<string, () => Recipe> = {
  sun: () => ({
    s: [{ pts: cir(50, 36, 14), sealed: true, w: 11 }, ...rays(50, 36, 18, 26, 8)],
    f: [{ x: 50, y: 36, c: "#f7c948", after: 0 }],
  }),
  moon: () => ({
    s: [
      { pts: arc(52, 37, 18, 20, Math.PI * 0.35, Math.PI * 1.65, 20), w: 11 },
      { pts: arc(44, 37, 12, 20, Math.PI * 1.65, Math.PI * 0.35, 20), w: 11 },
    ],
  }),
  star: () => ({
    s: [{ pts: star(50, 36, 20, 8), sealed: true, w: 11 }],
    f: [{ x: 50, y: 36, c: "#f7c948", after: 0 }],
  }),
  cloud: () => ({
    s: [
      {
        pts: pl([28, 52], [20, 48], [22, 38], [32, 34], [38, 24], [52, 21],
          [62, 27], [72, 30], [78, 40], [72, 50], [58, 53], [42, 53], [28, 52]),
        curve: true,
        sealed: true,
        w: 11,
      },
    ],
  }),
  rainbow: () => ({
    s: [
      { pts: arc(50, 58, 30, 26, Math.PI, Math.PI * 2, 22), w: 10, color: "#e23e3e" },
      { pts: arc(50, 58, 24, 21, Math.PI, Math.PI * 2, 22), w: 10, color: "#f5862c" },
      { pts: arc(50, 58, 18, 16, Math.PI, Math.PI * 2, 22), w: 10, color: "#4caf50" },
      { pts: arc(50, 58, 12, 11, Math.PI, Math.PI * 2, 22), w: 10, color: "#2b6fe3" },
    ],
  }),
  tree: () => ({
    s: [
      { pts: cir(50, 28, 18), sealed: true, w: 11 },
      { pts: rct(46, 44, 8, 22), w: 10 },
    ],
    f: [{ x: 50, y: 26, c: "#4caf50", after: 0 }],
  }),
  flower: () => ({
    s: [
      ...Array.from({ length: 6 }, (_, i) => {
        const a = (Math.PI * 2 * i) / 6;
        return {
          pts: rell(50 + Math.cos(a) * 12, 26 + Math.sin(a) * 12, 8, 5, a, 18),
          w: 9,
          color: "#f06292",
        };
      }),
      { pts: cir(50, 26, 6, 16), sealed: true, w: 9 },
      { pts: pl([50, 32], [52, 48], [49, 66]), w: 10, color: "#4caf50" },
      { pts: rell(60, 52, 9, 5, -0.5, 16), w: 9, color: "#4caf50" },
    ],
    f: [{ x: 50, y: 26, c: "#f7c948", after: 6 }],
  }),
  cactus: () => ({
    s: [
      { pts: pl([44, 66], [44, 26], [46, 22], [52, 22], [55, 26], [55, 66], [44, 66]), w: 11 },
      { pts: pl([44, 44], [34, 44], [31, 40], [31, 32]), w: 10 },
      { pts: pl([55, 38], [65, 38], [68, 34], [68, 27]), w: 10 },
    ],
    f: [{ x: 49, y: 50, c: "#4caf50", after: 0 }],
  }),
  mountain: () => ({
    s: [
      { pts: pl([14, 62], [36, 24], [48, 42], [58, 28], [84, 62], [14, 62]), w: 11 },
      { pts: pl([30, 34], [36, 24], [42, 34], [38, 32], [34, 36]), w: 8 },
    ],
  }),
  house: () => ({
    s: [
      { pts: rct(28, 34, 44, 32), w: 11 },
      { pts: pl([24, 34], [50, 14], [76, 34]), w: 11 },
      { pts: rct(44, 50, 13, 16), w: 9 },
      { pts: rct(32, 40, 10, 9), w: 8 },
      { pts: cir(55, 58, 1.1, 8), w: 6 },
    ],
  }),
  door: () => ({
    s: [
      { pts: rct(34, 14, 32, 52), w: 11 },
      { pts: cir(60, 42, 2.2, 12), w: 8 },
      { pts: rct(40, 22, 20, 14), w: 7 },
    ],
  }),
  key: () => ({
    s: [
      { pts: cir(30, 36, 11), w: 10 },
      { pts: ln(41, 36, 76, 36), w: 10 },
      { pts: ln(66, 36, 66, 46), w: 9 },
      { pts: ln(74, 36, 74, 44), w: 9 },
    ],
  }),
  book: () => ({
    s: [
      { pts: rct(24, 20, 52, 36), w: 11 },
      { pts: ln(50, 20, 50, 56), w: 10 },
      { pts: ln(30, 28, 44, 28), w: 6 },
      { pts: ln(30, 34, 44, 34), w: 6 },
      { pts: ln(56, 28, 70, 28), w: 6 },
      { pts: ln(56, 34, 70, 34), w: 6 },
    ],
  }),
  umbrella: () => ({
    s: [
      { pts: arc(50, 38, 26, 22, Math.PI, Math.PI * 2, 20), w: 11 },
      { pts: pl([24, 38], [32, 44], [40, 38], [48, 44], [56, 38], [64, 44], [76, 38]), w: 9 },
      { pts: pl([50, 38], [50, 62], [42, 66]), w: 10 },
    ],
  }),
  balloon: () => ({
    s: [
      { pts: ell(50, 28, 14, 17), sealed: true, w: 11 },
      { pts: pl([50, 45], [47, 48], [53, 48], [50, 45]), w: 7 },
      { pts: pl([50, 48], [54, 56], [46, 64], [50, 70]), w: 7 },
    ],
    f: [{ x: 50, y: 26, c: "#e23e3e", after: 0 }],
  }),
  kite: () => ({
    s: [
      { pts: pl([50, 10], [70, 34], [50, 58], [30, 34], [50, 10]), w: 11 },
      { pts: ln(30, 34, 70, 34), w: 7 },
      { pts: ln(50, 10, 50, 58), w: 7 },
      { pts: pl([50, 58], [56, 64], [46, 68], [52, 74]), w: 7 },
    ],
  }),
  ladder: () => ({
    s: [
      { pts: ln(36, 10, 36, 68), w: 10 },
      { pts: ln(62, 10, 62, 68), w: 10 },
      ...[20, 32, 44, 56].map((y) => ({ pts: ln(36, y, 62, y), w: 9 })),
    ],
  }),
  glasses: () => ({
    s: [
      { pts: cir(34, 38, 13), w: 10 },
      { pts: cir(66, 38, 13), w: 10 },
      { pts: ln(47, 36, 53, 36), w: 8 },
      { pts: pl([21, 34], [14, 28]), w: 8 },
      { pts: pl([79, 34], [86, 28]), w: 8 },
    ],
  }),
  crown: () => ({
    s: [
      { pts: pl([26, 54], [26, 24], [38, 38], [50, 20], [62, 38], [74, 24], [74, 54], [26, 54]), sealed: true, w: 11 },
      { pts: ln(26, 46, 74, 46), w: 8 },
    ],
    f: [{ x: 50, y: 48, c: "#f7c948", after: 0 }],
  }),
  hat: () => ({
    s: [
      { pts: rct(36, 18, 28, 26), w: 11 },
      { pts: ell(50, 46, 30, 6, 22), w: 11 },
      { pts: ln(36, 38, 64, 38), w: 8, color: "#e23e3e" },
    ],
  }),
  shirt: () => ({
    s: [
      {
        pts: pl([32, 20], [40, 16], [46, 22], [54, 22], [60, 16], [68, 20], [74, 32],
          [66, 36], [66, 62], [34, 62], [34, 36], [26, 32], [32, 20]),
        w: 11,
      },
      { pts: arc(50, 20, 6, 4, 0, Math.PI, 10), w: 8 },
    ],
  }),
  sock: () => ({
    s: [
      { pts: pl([40, 12], [56, 12], [56, 44], [70, 50], [70, 62], [52, 62], [40, 52], [40, 12]), sealed: true, w: 11 },
      { pts: ln(40, 20, 56, 20), w: 8, color: "#e23e3e" },
    ],
  }),
  ring: () => ({
    s: [
      { pts: cir(50, 46, 16), w: 11 },
      { pts: pl([44, 30], [50, 18], [56, 30], [50, 34], [44, 30]), w: 9 },
    ],
  }),
  car: () => ({
    s: [
      { pts: pl([18, 52], [22, 38], [36, 38], [44, 26], [64, 26], [70, 38], [82, 40], [82, 52], [18, 52]), w: 11 },
      { pts: cir(32, 54, 8), w: 10 },
      { pts: cir(68, 54, 8), w: 10 },
      { pts: ln(52, 26, 52, 38), w: 7 },
    ],
  }),
  bus: () => ({
    s: [
      { pts: rct(16, 22, 68, 34), w: 11 },
      { pts: cir(32, 58, 7), w: 10 },
      { pts: cir(68, 58, 7), w: 10 },
      ...[24, 40, 56].map((x) => ({ pts: rct(x, 28, 12, 12), w: 7 })),
    ],
  }),
  train: () => ({
    s: [
      { pts: pl([18, 56], [18, 30], [42, 30], [42, 20], [78, 20], [78, 56], [18, 56]), w: 11 },
      { pts: rct(24, 34, 12, 12), w: 7 },
      { pts: rct(52, 28, 14, 14), w: 7 },
      { pts: cir(30, 60, 5), w: 9 },
      { pts: cir(66, 60, 5), w: 9 },
      { pts: pl([22, 30], [22, 18], [16, 12]), w: 8 },
    ],
  }),
  boat: () => ({
    s: [
      { pts: pl([22, 48], [78, 48], [68, 62], [32, 62], [22, 48]), w: 11 },
      { pts: ln(50, 48, 50, 14), w: 10 },
      { pts: pl([52, 16], [72, 44], [52, 44], [52, 16]), sealed: true, w: 10 },
      { pts: pl([16, 66], [26, 70], [38, 66], [50, 70], [62, 66], [74, 70], [86, 66]), w: 8, color: "#53c2f0" },
    ],
    f: [{ x: 58, y: 36, c: "#53c2f0", after: 2 }],
  }),
  rocket: () => ({
    s: [
      { pts: pl([50, 10], [62, 34], [62, 54], [38, 54], [38, 34], [50, 10]), w: 11 },
      { pts: cir(50, 30, 6), w: 9 },
      { pts: pl([38, 42], [26, 58], [38, 54]), w: 9 },
      { pts: pl([62, 42], [74, 58], [62, 54]), w: 9 },
      { pts: pl([42, 56], [46, 70], [50, 60], [54, 70], [58, 56]), w: 9, color: "#f5862c" },
    ],
  }),
  airplane: () => ({
    s: [
      { pts: pl([16, 40], [64, 32], [82, 36], [64, 46], [16, 44], [16, 40]), w: 11 },
      { pts: pl([40, 36], [46, 14], [56, 14], [50, 38]), w: 9 },
      { pts: pl([40, 44], [46, 62], [56, 62], [50, 46]), w: 9 },
      { pts: pl([18, 40], [10, 30], [16, 30]), w: 8 },
    ],
  }),
  bicycle: () => ({
    s: [
      { pts: cir(28, 50, 15), w: 10 },
      { pts: cir(72, 50, 15), w: 10 },
      { pts: pl([28, 50], [44, 50], [52, 28], [62, 28]), w: 9 },
      { pts: pl([44, 50], [56, 28]), w: 9 },
      { pts: pl([56, 28], [72, 50]), w: 9 },
      { pts: ln(56, 24, 68, 24), w: 8 },
    ],
  }),
  tent: () => ({
    s: [
      { pts: pl([18, 62], [50, 16], [82, 62], [18, 62]), w: 11 },
      { pts: pl([50, 16], [42, 62]), w: 9 },
      { pts: pl([50, 16], [58, 62]), w: 9 },
      { pts: ln(50, 16, 50, 10), w: 7 },
    ],
  }),
  bridge: () => ({
    s: [
      { pts: ln(10, 34, 90, 34), w: 11 },
      { pts: arc(50, 34, 28, 22, Math.PI, Math.PI * 2, 18), w: 10 },
      ...[30, 42, 58, 70].map((x) => ({ pts: ln(x, 34, x, 60), w: 7 })),
      { pts: ln(10, 60, 90, 60), w: 8 },
    ],
  }),
  castle: () => ({
    s: [
      { pts: pl([22, 66], [22, 30], [30, 30], [30, 22], [38, 22], [38, 30], [62, 30], [62, 22], [70, 22], [70, 30], [78, 30], [78, 66], [22, 66]), w: 11 },
      { pts: pl([42, 66], [42, 46], [50, 40], [58, 46], [58, 66]), w: 9 },
      { pts: rct(30, 38, 8, 8), w: 7 },
      { pts: rct(62, 38, 8, 8), w: 7 },
    ],
  }),
  robot: () => ({
    s: [
      { pts: rct(32, 22, 36, 28), w: 11 },
      { pts: cir(42, 32, 4), w: 8 },
      { pts: cir(58, 32, 4), w: 8 },
      { pts: ln(42, 42, 58, 42), w: 8 },
      { pts: ln(50, 22, 50, 12), w: 7 },
      { pts: cir(50, 10, 2.5, 10), w: 7 },
      { pts: rct(36, 50, 28, 18), w: 10 },
      { pts: ln(36, 56, 22, 62), w: 9 },
      { pts: ln(64, 56, 78, 62), w: 9 },
    ],
  }),
  ghost: () => ({
    s: [
      {
        pts: [
          ...arc(50, 34, 20, 22, Math.PI, Math.PI * 2, 18),
          [70, 60], [63, 52], [56, 62], [50, 54], [44, 62], [37, 52], [30, 60], [30, 34],
        ],
        sealed: true,
        curve: true,
        w: 11,
      },
      { pts: cir(42, 32, 3.4, 12), w: 8 },
      { pts: cir(58, 32, 3.4, 12), w: 8 },
      { pts: ell(50, 44, 3.5, 5, 12), w: 7 },
    ],
  }),
  alien: () => ({
    s: [
      { pts: ell(50, 30, 20, 24), sealed: true, w: 11 },
      { pts: ell(42, 30, 5, 8, 14), w: 8 },
      { pts: ell(58, 30, 5, 8, 14), w: 8 },
      { pts: arc(50, 42, 6, 4, 0, Math.PI, 10), w: 7 },
      { pts: rct(42, 54, 16, 16), w: 9 },
    ],
    f: [{ x: 50, y: 24, c: "#4caf50", after: 0 }],
  }),
  snowman: () => ({
    s: [
      { pts: cir(50, 58, 14), w: 11 },
      { pts: cir(50, 38, 11), w: 11 },
      { pts: cir(50, 22, 8), w: 11 },
      { pts: cir(47, 20, 1.3, 8), w: 6 },
      { pts: cir(53, 20, 1.3, 8), w: 6 },
      { pts: pl([50, 23], [56, 25], [50, 26]), w: 6, color: "#f5862c" },
      { pts: ln(39, 36, 24, 28), w: 8 },
      { pts: ln(61, 36, 76, 28), w: 8 },
    ],
  }),
  fish: () => ({
    s: [
      { pts: pl([26, 40], [44, 26], [66, 40], [44, 54], [26, 40]), sealed: true, w: 11 },
      { pts: pl([66, 40], [80, 28], [80, 52], [66, 40]), w: 10 },
      { pts: cir(36, 36, 1.8, 10), w: 7 },
      { pts: arc(50, 40, 8, 10, Math.PI * 0.6, Math.PI * 1.4, 10), w: 7 },
    ],
    f: [{ x: 44, y: 40, c: "#53c2f0", after: 0 }],
  }),
  cat: () => ({
    s: [
      { pts: cir(50, 34, 17), w: 11 },
      { pts: pl([37, 24], [34, 10], [46, 19]), w: 10 },
      { pts: pl([63, 24], [66, 10], [54, 19]), w: 10 },
      { pts: cir(43, 32, 2, 10), w: 7 },
      { pts: cir(57, 32, 2, 10), w: 7 },
      { pts: pl([47, 40], [50, 43], [53, 40]), w: 7 },
      { pts: ln(34, 40, 22, 37), w: 6 },
      { pts: ln(34, 44, 22, 45), w: 6 },
      { pts: ln(66, 40, 78, 37), w: 6 },
      { pts: ln(66, 44, 78, 45), w: 6 },
    ],
  }),
  dog: () => ({
    s: [
      { pts: ell(50, 36, 16, 15), w: 11 },
      { pts: ell(32, 40, 7, 14, 16), w: 10 },
      { pts: ell(68, 40, 7, 14, 16), w: 10 },
      { pts: cir(44, 33, 2, 10), w: 7 },
      { pts: cir(56, 33, 2, 10), w: 7 },
      { pts: ell(50, 44, 4, 3, 12), w: 7 },
      { pts: arc(50, 46, 7, 6, 0.2, Math.PI - 0.2, 10), w: 7 },
    ],
  }),
  bird: () => ({
    s: [
      { pts: ell(46, 40, 16, 12), sealed: true, w: 11 },
      { pts: cir(66, 30, 8), w: 10 },
      { pts: pl([73, 29], [82, 32], [73, 34]), w: 8, color: "#f5862c" },
      { pts: cir(67, 28, 1.4, 8), w: 6 },
      { pts: arc(44, 38, 9, 7, Math.PI, Math.PI * 2, 12), w: 8 },
      { pts: pl([30, 48], [22, 58]), w: 8 },
      { pts: ln(42, 52, 42, 62), w: 7 },
      { pts: ln(52, 52, 52, 62), w: 7 },
    ],
    f: [{ x: 42, y: 40, c: "#f7c948", after: 0 }],
  }),
  duck: () => ({
    s: [
      { pts: ell(44, 46, 18, 12), w: 11 },
      { pts: cir(64, 30, 9), w: 10 },
      { pts: pl([72, 30], [84, 33], [72, 36]), w: 8, color: "#f5862c" },
      { pts: cir(65, 27, 1.4, 8), w: 6 },
      { pts: pl([26, 44], [16, 38], [24, 50]), w: 8 },
      { pts: pl([20, 62], [34, 62], [40, 58]), w: 8, color: "#f5862c" },
    ],
  }),
  pig: () => ({
    s: [
      { pts: cir(50, 38, 18), w: 11 },
      { pts: ell(50, 42, 8, 6, 16), w: 9 },
      { pts: cir(47, 42, 1.2, 8), w: 6 },
      { pts: cir(53, 42, 1.2, 8), w: 6 },
      { pts: cir(42, 30, 2, 10), w: 7 },
      { pts: cir(58, 30, 2, 10), w: 7 },
      { pts: pl([36, 24], [32, 14], [44, 20]), w: 8 },
      { pts: pl([64, 24], [68, 14], [56, 20]), w: 8 },
    ],
    f: [{ x: 50, y: 30, c: "#f06292", after: 0 }],
  }),
  snake: () => ({
    s: [
      {
        pts: pl([14, 58], [26, 46], [40, 58], [54, 46], [66, 56], [76, 44], [80, 32]),
        w: 13,
      },
      { pts: cir(80, 28, 5), w: 9 },
      { pts: pl([80, 23], [80, 14], [76, 10]), w: 6, color: "#e23e3e" },
      { pts: pl([80, 14], [84, 10]), w: 6, color: "#e23e3e" },
    ],
  }),
  frog: () => ({
    s: [
      { pts: ell(50, 46, 20, 15), sealed: true, w: 11 },
      { pts: cir(40, 28, 8), w: 10 },
      { pts: cir(60, 28, 8), w: 10 },
      { pts: cir(40, 28, 2.2, 10), w: 7 },
      { pts: cir(60, 28, 2.2, 10), w: 7 },
      { pts: arc(50, 46, 11, 8, 0.15, Math.PI - 0.15, 12), w: 8 },
      { pts: pl([32, 58], [24, 64], [32, 64]), w: 8 },
      { pts: pl([68, 58], [76, 64], [68, 64]), w: 8 },
    ],
    f: [{ x: 50, y: 44, c: "#4caf50", after: 0 }],
  }),
  bee: () => ({
    s: [
      { pts: ell(54, 46, 17, 12), sealed: true, w: 11 },
      { pts: ln(50, 35, 50, 57), w: 8 },
      { pts: ln(58, 36, 58, 56), w: 8 },
      { pts: cir(32, 44, 8), w: 10 },
      { pts: cir(30, 42, 1.5, 8), w: 6 },
      { pts: rell(48, 30, 12, 6, -0.45, 18), w: 8 },
      { pts: rell(64, 31, 12, 6, 0.35, 18), w: 8 },
      { pts: pl([70, 47], [80, 50]), w: 7 },
      { pts: ln(29, 37, 24, 29), w: 6 },
      { pts: ln(35, 36, 34, 27), w: 6 },
    ],
    f: [{ x: 54, y: 50, c: "#f7c948", after: 0 }],
  }),
  spider: () => ({
    s: [
      { pts: ell(50, 46, 14, 12), sealed: true, w: 11 },
      { pts: cir(50, 28, 8), w: 10 },
      { pts: cir(47, 26, 1.6, 8), w: 6 },
      { pts: cir(53, 26, 1.6, 8), w: 6 },
      ...[
        pl([37, 38], [24, 30], [14, 38]),
        pl([36, 44], [21, 44], [12, 54]),
        pl([37, 50], [24, 56], [17, 66]),
        pl([41, 55], [34, 63], [28, 70]),
      ].flatMap((p) => [
        { pts: p, w: 7 },
        { pts: p.map(([x, y]) => [100 - x, y] as Pt), w: 7 },
      ]),
    ],
    f: [{ x: 50, y: 46, c: "#1d1d24", after: 0 }],
  }),
  butterfly: () => ({
    s: [
      { pts: ell(50, 40, 3, 16, 16), w: 9 },
      { pts: ell(34, 30, 15, 11, 18), w: 10 },
      { pts: ell(66, 30, 15, 11, 18), w: 10 },
      { pts: ell(36, 52, 12, 9, 18), w: 10 },
      { pts: ell(64, 52, 12, 9, 18), w: 10 },
      { pts: pl([48, 25], [42, 14]), w: 6 },
      { pts: pl([52, 25], [58, 14]), w: 6 },
    ],
    f: [{ x: 34, y: 30, c: "#f06292", after: 1 }],
  }),
  elephant: () => ({
    s: [
      { pts: ell(40, 40, 24, 16), sealed: true, w: 11 },
      { pts: cir(70, 36, 13), w: 11 },
      { pts: pl([78, 44], [84, 54], [80, 64], [88, 68]), w: 12, curve: true },
      { pts: ell(64, 32, 8, 10, 16), w: 9 },
      { pts: cir(75, 32, 1.8, 10), w: 7 },
      ...[26, 38, 48, 58].map((x) => ({ pts: ln(x, 54, x, 66), w: 9 })),
      { pts: pl([17, 38], [10, 44], [13, 48]), w: 7 },
    ],
    f: [{ x: 40, y: 40, c: "#6e7180", after: 0 }],
  }),
  penguin: () => ({
    s: [
      { pts: ell(50, 40, 18, 24), w: 11 },
      { pts: ell(50, 46, 11, 16, 20), w: 9 },
      { pts: cir(45, 26, 1.8, 10), w: 7 },
      { pts: cir(55, 26, 1.8, 10), w: 7 },
      { pts: pl([47, 32], [53, 32], [50, 37], [47, 32]), w: 7, color: "#f5862c" },
      { pts: pl([34, 62], [26, 68], [42, 68]), w: 8, color: "#f5862c" },
      { pts: pl([66, 62], [74, 68], [58, 68]), w: 8, color: "#f5862c" },
    ],
  }),
  whale: () => ({
    s: [
      { pts: ell(46, 44, 26, 16), sealed: true, w: 11 },
      { pts: pl([72, 44], [86, 30], [82, 46], [86, 58], [72, 46]), w: 10 },
      { pts: cir(32, 40, 1.8, 10), w: 7 },
      { pts: arc(36, 46, 7, 5, 0.2, Math.PI - 0.2, 10), w: 7 },
      { pts: pl([46, 28], [42, 16]), w: 7, color: "#53c2f0" },
      { pts: pl([48, 28], [52, 16]), w: 7, color: "#53c2f0" },
    ],
    f: [{ x: 46, y: 46, c: "#53c2f0", after: 0 }],
  }),
  octopus: () => ({
    s: [
      { pts: arc(50, 36, 20, 20, Math.PI, Math.PI * 2, 18), w: 11 },
      { pts: ln(30, 36, 30, 44), w: 10 },
      { pts: ln(70, 36, 70, 44), w: 10 },
      ...[0, 1, 2, 3, 4].map((i) => ({
        pts: pl(
          [32 + i * 9, 44],
          [30 + i * 9, 56],
          [36 + i * 9, 64],
          [32 + i * 9, 70]
        ),
        w: 8,
      })),
      { pts: cir(43, 32, 2.4, 10), w: 7 },
      { pts: cir(57, 32, 2.4, 10), w: 7 },
    ],
    f: [{ x: 50, y: 30, c: "#f06292", after: 0 }],
  }),
  crab: () => ({
    s: [
      { pts: ell(50, 44, 20, 13), sealed: true, w: 11 },
      { pts: pl([30, 40], [18, 32], [12, 36], [18, 42], [24, 38]), w: 9 },
      { pts: pl([70, 40], [82, 32], [88, 36], [82, 42], [76, 38]), w: 9 },
      ...[0, 1, 2].map((i) => ({ pts: ln(38 + i * 6, 56, 32 + i * 6, 66), w: 7 })),
      ...[0, 1, 2].map((i) => ({ pts: ln(50 + i * 6, 56, 56 + i * 6, 66), w: 7 })),
      { pts: ln(44, 32, 44, 26), w: 7 },
      { pts: ln(56, 32, 56, 26), w: 7 },
      { pts: cir(44, 24, 2, 10), w: 6 },
      { pts: cir(56, 24, 2, 10), w: 6 },
    ],
    f: [{ x: 50, y: 44, c: "#e23e3e", after: 0 }],
  }),
  owl: () => ({
    s: [
      { pts: ell(50, 40, 19, 22), w: 11 },
      { pts: cir(42, 32, 8), w: 9 },
      { pts: cir(58, 32, 8), w: 9 },
      { pts: cir(42, 32, 2.4, 10), w: 7 },
      { pts: cir(58, 32, 2.4, 10), w: 7 },
      { pts: pl([47, 40], [50, 45], [53, 40]), w: 7, color: "#f5862c" },
      { pts: pl([34, 22], [32, 14], [40, 20]), w: 8 },
      { pts: pl([66, 22], [68, 14], [60, 20]), w: 8 },
      { pts: ln(42, 62, 42, 68), w: 7 },
      { pts: ln(58, 62, 58, 68), w: 7 },
    ],
  }),
  apple: () => ({
    s: [
      {
        pts: pl([50, 30], [38, 24], [30, 32], [30, 46], [40, 62], [50, 58],
          [60, 62], [70, 46], [70, 32], [62, 24], [50, 30]),
        sealed: true,
        curve: true,
        w: 11,
      },
      { pts: pl([50, 30], [52, 18]), w: 8 },
      { pts: rell(60, 16, 8, 4, -0.35, 16), w: 8, color: "#4caf50" },
    ],
    f: [{ x: 50, y: 44, c: "#e23e3e", after: 0 }],
  }),
  banana: () => ({
    s: [
      {
        pts: pl([22, 30], [26, 48], [42, 60], [62, 58], [76, 46], [74, 40],
          [60, 50], [44, 50], [32, 40], [30, 28], [22, 30]),
        sealed: true,
        curve: true,
        w: 11,
      },
    ],
    f: [{ x: 48, y: 52, c: "#f7c948", after: 0 }],
  }),
  pizza: () => ({
    s: [
      { pts: pl([50, 12], [80, 66], [20, 66], [50, 12]), sealed: true, w: 11 },
      { pts: ln(24, 60, 76, 60), w: 8 },
      ...dots([[50, 32], [40, 48], [60, 50], [50, 58]], 3),
    ],
    f: [{ x: 50, y: 40, c: "#f7c948", after: 1 }],
  }),
  donut: () => ({
    s: [
      { pts: cir(50, 40, 24), sealed: true, w: 11 },
      { pts: cir(50, 40, 8), w: 10 },
      ...[[38, 28], [58, 26], [66, 42], [56, 56], [38, 52], [30, 40]].map(
        ([x, y]) => ({ pts: ln(x, y, x + 4, y + 3), w: 6, color: "#f06292" })
      ),
    ],
    f: [{ x: 50, y: 20, c: "#8d5a3b", after: 1 }],
  }),
  cookie: () => ({
    s: [
      { pts: cir(50, 40, 22), sealed: true, w: 11 },
      ...dots([[42, 32], [58, 34], [50, 46], [38, 48], [62, 48]], 2.6),
    ],
    f: [{ x: 50, y: 40, c: "#eecfa5", after: 0 }],
  }),
  "ice cream": () => ({
    s: [
      { pts: pl([34, 34], [66, 34], [50, 70], [34, 34]), w: 11 },
      { pts: arc(42, 30, 10, 10, Math.PI, Math.PI * 2, 12), w: 10 },
      { pts: arc(58, 30, 10, 10, Math.PI, Math.PI * 2, 12), w: 10 },
      { pts: arc(50, 20, 11, 11, Math.PI, Math.PI * 2, 12), w: 10 },
      { pts: cir(50, 9, 2.4, 10), w: 7, color: "#e23e3e" },
    ],
  }),
  cake: () => ({
    s: [
      { pts: rct(24, 40, 52, 24), w: 11 },
      { pts: rct(30, 28, 40, 12), w: 10 },
      ...[40, 50, 60].map((x) => ({ pts: ln(x, 28, x, 16), w: 7 })),
      ...[40, 50, 60].map((x) => ({
        pts: pl([x, 14], [x + 2, 10], [x, 7], [x - 2, 10], [x, 14]),
        w: 6,
        color: "#f5862c",
      })),
      { pts: pl([24, 48], [32, 54], [40, 48], [48, 54], [56, 48], [64, 54], [76, 48]), w: 7 },
    ],
  }),
  burger: () => ({
    s: [
      { pts: arc(50, 34, 26, 18, Math.PI, Math.PI * 2, 18), w: 11 },
      { pts: ln(24, 34, 76, 34), w: 9 },
      { pts: pl([24, 40], [32, 46], [42, 40], [52, 46], [62, 40], [70, 46], [76, 40]), w: 9, color: "#4caf50" },
      { pts: rct(24, 46, 52, 10), w: 10 },
      { pts: arc(50, 56, 26, 12, 0, Math.PI, 18), w: 11 },
      ...dots([[40, 26], [52, 22], [62, 28]], 1.6),
    ],
  }),
  hotdog: () => ({
    s: [
      { pts: ell(50, 42, 32, 11), w: 11 },
      { pts: ell(50, 38, 28, 8, 20), w: 10 },
      { pts: pl([26, 38], [34, 34], [42, 40], [50, 34], [58, 40], [66, 34], [74, 38]), w: 7, color: "#f7c948" },
    ],
  }),
  carrot: () => ({
    s: [
      { pts: pl([44, 26], [56, 26], [50, 68], [44, 26]), sealed: true, w: 11 },
      { pts: pl([46, 26], [40, 12]), w: 8, color: "#4caf50" },
      { pts: pl([50, 26], [50, 10]), w: 8, color: "#4caf50" },
      { pts: pl([54, 26], [60, 12]), w: 8, color: "#4caf50" },
      { pts: ln(46, 38, 53, 36), w: 6 },
      { pts: ln(47, 48, 53, 46), w: 6 },
    ],
    f: [{ x: 50, y: 40, c: "#f5862c", after: 0 }],
  }),
  mushroom: () => ({
    s: [
      { pts: arc(50, 40, 26, 22, Math.PI, Math.PI * 2, 20), sealed: true, w: 11 },
      { pts: ln(24, 40, 76, 40), w: 10 },
      { pts: pl([40, 40], [40, 64], [60, 64], [60, 40]), w: 10 },
      ...dots([[40, 30], [56, 26], [64, 34]], 3),
    ],
    f: [{ x: 50, y: 28, c: "#e23e3e", after: 0 }],
  }),
  watermelon: () => ({
    s: [
      { pts: arc(50, 26, 32, 34, 0, Math.PI, 20), sealed: true, w: 11 },
      { pts: ln(18, 26, 82, 26), w: 10 },
      { pts: arc(50, 26, 27, 29, 0, Math.PI, 18), w: 8 },
      ...dots([[42, 40], [56, 42], [50, 50], [36, 34], [64, 34]], 1.8),
    ],
    f: [{ x: 50, y: 44, c: "#e23e3e", after: 2 }],
  }),
  egg: () => ({
    s: [{ pts: ell(50, 40, 18, 24), sealed: true, w: 11 }],
    f: [{ x: 50, y: 40, c: "#ffffff", after: 0 }],
  }),
  cup: () => ({
    s: [
      { pts: pl([32, 24], [68, 24], [62, 62], [38, 62], [32, 24]), w: 11 },
      { pts: arc(70, 38, 10, 9, Math.PI * 1.5, Math.PI * 0.5, 12), w: 9 },
      { pts: ell(50, 24, 18, 5, 18), w: 9 },
      { pts: pl([44, 14], [46, 8]), w: 6 },
      { pts: pl([54, 14], [56, 8]), w: 6 },
    ],
  }),
  bottle: () => ({
    s: [
      { pts: pl([42, 20], [42, 32], [36, 40], [36, 66], [64, 66], [64, 40], [58, 32], [58, 20], [42, 20]), w: 11 },
      { pts: rct(42, 12, 16, 8), w: 9 },
      { pts: rct(36, 46, 28, 12), w: 8 },
    ],
  }),
  clock: () => ({
    s: [
      { pts: cir(50, 38, 24), w: 11 },
      { pts: ln(50, 38, 50, 22), w: 9 },
      { pts: ln(50, 38, 62, 44), w: 9 },
      ...[0, 3, 6, 9].map((h) => {
        const a = (Math.PI * 2 * h) / 12 - Math.PI / 2;
        return {
          pts: ln(50 + Math.cos(a) * 19, 38 + Math.sin(a) * 19, 50 + Math.cos(a) * 22, 38 + Math.sin(a) * 22),
          w: 6,
        };
      }),
    ],
  }),
  lightbulb: () => ({
    s: [
      { pts: cir(50, 32, 18), sealed: true, w: 11 },
      { pts: pl([40, 46], [40, 56], [60, 56], [60, 46]), w: 10 },
      { pts: ln(40, 60, 60, 60), w: 8 },
      { pts: ln(42, 64, 58, 64), w: 8 },
      { pts: pl([44, 34], [48, 42], [52, 34], [56, 42]), w: 7 },
    ],
    f: [{ x: 50, y: 26, c: "#f7c948", after: 0 }],
  }),
  envelope: () => ({
    s: [
      { pts: rct(20, 24, 60, 36), w: 11 },
      { pts: pl([20, 24], [50, 46], [80, 24]), w: 9 },
      { pts: pl([20, 60], [42, 40]), w: 7 },
      { pts: pl([80, 60], [58, 40]), w: 7 },
    ],
  }),
  gift: () => ({
    s: [
      { pts: rct(26, 32, 48, 34), w: 11 },
      { pts: rct(22, 24, 56, 10), w: 10 },
      { pts: ln(50, 24, 50, 66), w: 9, color: "#e23e3e" },
      { pts: pl([50, 24], [40, 14], [34, 20], [50, 24]), w: 8, color: "#e23e3e" },
      { pts: pl([50, 24], [60, 14], [66, 20], [50, 24]), w: 8, color: "#e23e3e" },
    ],
  }),
  heart: () => ({
    s: [
      {
        pts: Array.from({ length: 41 }, (_, i) => {
          const t = (i / 40) * Math.PI * 2;
          const x = 16 * Math.pow(Math.sin(t), 3);
          const y =
            13 * Math.cos(t) -
            5 * Math.cos(2 * t) -
            2 * Math.cos(3 * t) -
            Math.cos(4 * t);
          return [50 + x * 1.3, 38 - y * 1.3] as Pt;
        }),
        sealed: true,
        w: 11,
      },
    ],
    f: [{ x: 50, y: 34, c: "#e23e3e", after: 0 }],
  }),
  eye: () => ({
    s: [
      { pts: arc(50, 38, 30, 18, Math.PI, Math.PI * 2, 18), w: 11 },
      { pts: arc(50, 38, 30, 18, 0, Math.PI, 18), w: 11 },
      { pts: cir(50, 38, 10), w: 10 },
      { pts: cir(50, 38, 4, 12), w: 8 },
      { pts: ln(30, 22, 26, 14), w: 6 },
      { pts: ln(50, 18, 50, 10), w: 6 },
      { pts: ln(70, 22, 74, 14), w: 6 },
    ],
  }),
  skull: () => ({
    s: [
      { pts: arc(50, 34, 22, 24, Math.PI, Math.PI * 2, 18), w: 11 },
      { pts: pl([28, 34], [28, 46], [36, 54], [64, 54], [72, 46], [72, 34]), w: 11 },
      { pts: cir(41, 32, 6), w: 9 },
      { pts: cir(59, 32, 6), w: 9 },
      { pts: pl([47, 44], [50, 38], [53, 44], [47, 44]), w: 7 },
      ...[42, 50, 58].map((x) => ({ pts: ln(x, 54, x, 62), w: 6 })),
      { pts: rct(38, 54, 24, 8), w: 8 },
    ],
  }),
  bone: () => ({
    s: [
      {
        pts: pl([32, 30], [68, 30], [68, 44], [32, 44], [32, 30]),
        w: 11,
      },
      { pts: cir(28, 28, 7), w: 9 },
      { pts: cir(28, 44, 7), w: 9 },
      { pts: cir(72, 28, 7), w: 9 },
      { pts: cir(72, 44, 7), w: 9 },
    ],
  }),
  phone: () => ({
    s: [
      { pts: rct(36, 12, 28, 52), w: 11 },
      { pts: rct(40, 20, 20, 36), w: 8 },
      { pts: cir(50, 60, 2.2, 10), w: 7 },
      { pts: ln(46, 16, 54, 16), w: 6 },
    ],
  }),
  television: () => ({
    s: [
      { pts: rct(20, 26, 60, 38), w: 11 },
      { pts: rct(26, 32, 42, 26), w: 8 },
      { pts: ln(40, 26, 30, 12), w: 8 },
      { pts: ln(60, 26, 70, 12), w: 8 },
      { pts: cir(74, 40, 2, 10), w: 6 },
    ],
  }),
  flag: () => ({
    s: [
      { pts: ln(28, 10, 28, 68), w: 11 },
      { pts: pl([28, 14], [70, 20], [70, 40], [28, 34], [28, 14]), sealed: true, w: 10 },
    ],
    f: [{ x: 48, y: 27, c: "#e23e3e", after: 1 }],
  }),
  anchor: () => ({
    s: [
      { pts: cir(50, 16, 6), w: 10 },
      { pts: ln(50, 22, 50, 62), w: 11 },
      { pts: ln(34, 30, 66, 30), w: 10 },
      { pts: arc(50, 44, 22, 20, 0.15, Math.PI - 0.15, 16), w: 10 },
    ],
  }),
  arrow: () => ({
    s: [
      { pts: ln(18, 40, 78, 40), w: 12 },
      { pts: pl([62, 26], [80, 40], [62, 54]), w: 11 },
    ],
  }),
  diamond: () => ({
    s: [
      { pts: pl([50, 66], [18, 30], [32, 14], [68, 14], [82, 30], [50, 66]), w: 11 },
      { pts: ln(18, 30, 82, 30), w: 8 },
      { pts: ln(32, 14, 40, 30), w: 7 },
      { pts: ln(68, 14, 60, 30), w: 7 },
      { pts: ln(40, 30, 50, 66), w: 7 },
      { pts: ln(60, 30, 50, 66), w: 7 },
    ],
  }),
  pumpkin: () => ({
    s: [
      { pts: ell(50, 42, 26, 22), sealed: true, w: 11 },
      { pts: arc(50, 42, 12, 22, Math.PI * 1.5, Math.PI * 2.5, 14), w: 8 },
      { pts: arc(50, 42, 12, 22, Math.PI * 0.5, Math.PI * 1.5, 14), w: 8 },
      { pts: pl([50, 20], [52, 10], [58, 12]), w: 9, color: "#4caf50" },
    ],
    f: [{ x: 50, y: 42, c: "#f5862c", after: 0 }],
  }),
  candle: () => ({
    s: [
      { pts: rct(40, 30, 20, 38), w: 11 },
      { pts: ln(50, 30, 50, 24), w: 7 },
      { pts: pl([50, 24], [56, 16], [50, 6], [44, 16], [50, 24]), sealed: true, w: 9 },
    ],
    f: [{ x: 50, y: 16, c: "#f5862c", after: 2 }],
  }),
  dice: () => ({
    s: [
      { pts: rct(28, 20, 44, 44), w: 11 },
      ...dots([[40, 32], [60, 32], [50, 42], [40, 52], [60, 52]], 3),
    ],
  }),
  ball: () => ({
    s: [
      { pts: cir(50, 40, 24), w: 11 },
      { pts: arc(50, 40, 12, 24, Math.PI * 1.5, Math.PI * 2.5, 14), w: 8 },
      { pts: arc(50, 40, 12, 24, Math.PI * 0.5, Math.PI * 1.5, 14), w: 8 },
      { pts: ln(26, 40, 74, 40), w: 8 },
    ],
  }),
  crayon: () => ({
    s: [
      { pts: rct(40, 24, 20, 40), w: 11 },
      { pts: pl([40, 24], [50, 8], [60, 24]), w: 10 },
      { pts: ln(40, 34, 60, 34), w: 7 },
      { pts: ln(40, 40, 60, 40), w: 7 },
    ],
    f: [{ x: 50, y: 52, c: "#e23e3e", after: 0 }],
  }),
  guitar: () => ({
    s: [
      { pts: cir(42, 50, 18), w: 11 },
      { pts: cir(56, 40, 13), w: 11 },
      { pts: cir(44, 50, 6), w: 8 },
      { pts: pl([64, 32], [84, 14]), w: 11 },
      { pts: pl([68, 36], [88, 18]), w: 11 },
      { pts: rct(82, 10, 10, 10), w: 8 },
    ],
  }),
  drum: () => ({
    s: [
      { pts: ell(50, 30, 24, 8, 20), w: 11 },
      { pts: ln(26, 30, 26, 54), w: 10 },
      { pts: ln(74, 30, 74, 54), w: 10 },
      { pts: arc(50, 54, 24, 8, 0, Math.PI, 16), w: 10 },
      { pts: pl([26, 34], [38, 48], [50, 34], [62, 48], [74, 34]), w: 7 },
      { pts: ln(34, 20, 46, 28), w: 7 },
      { pts: ln(66, 20, 54, 28), w: 7 },
    ],
  }),
  bell: () => ({
    s: [
      { pts: pl([30, 54], [32, 34], [42, 20], [58, 20], [68, 34], [70, 54], [30, 54]), sealed: true, w: 11 },
      { pts: ln(28, 54, 72, 54), w: 9 },
      { pts: cir(50, 60, 5), w: 8 },
      { pts: cir(50, 16, 4, 12), w: 8 },
    ],
    f: [{ x: 50, y: 42, c: "#f7c948", after: 0 }],
  }),
  hammer: () => ({
    s: [
      { pts: rct(44, 26, 14, 40), w: 11 },
      { pts: pl([28, 14], [72, 14], [72, 26], [28, 26], [28, 14]), sealed: true, w: 11 },
      { pts: pl([28, 18], [20, 22], [28, 24]), w: 9 },
    ],
    f: [{ x: 50, y: 20, c: "#6e7180", after: 1 }],
  }),
  coin: () => ({
    s: [
      { pts: cir(50, 40, 22), sealed: true, w: 11 },
      { pts: cir(50, 40, 16), w: 8 },
      { pts: pl([54, 30], [44, 30], [42, 36], [56, 44], [54, 50], [44, 50]), w: 8 },
      { pts: ln(50, 26, 50, 54), w: 6 },
    ],
    f: [{ x: 50, y: 40, c: "#f7c948", after: 0 }],
  }),
  lollipop: () => ({
    s: [
      { pts: cir(50, 28, 18), w: 11 },
      {
        pts: Array.from({ length: 40 }, (_, i) => {
          const a = (i / 40) * Math.PI * 4;
          const r = (i / 40) * 15;
          return [50 + Math.cos(a) * r, 28 + Math.sin(a) * r] as Pt;
        }),
        w: 7,
        color: "#e23e3e",
      },
      { pts: ln(50, 46, 50, 70), w: 9 },
    ],
  }),
  ladybug: () => ({
    s: [
      { pts: ell(50, 42, 20, 17), sealed: true, w: 11 },
      { pts: ln(50, 25, 50, 59), w: 9 },
      { pts: arc(50, 30, 10, 9, Math.PI, Math.PI * 2, 12), w: 9 },
      ...dots([[40, 40], [60, 40], [44, 52], [58, 52]], 2.6),
      { pts: ln(44, 22, 38, 14), w: 6 },
      { pts: ln(56, 22, 62, 14), w: 6 },
    ],
    f: [{ x: 50, y: 46, c: "#e23e3e", after: 0 }],
  }),
  snail: () => ({
    s: [
      {
        pts: Array.from({ length: 46 }, (_, i) => {
          const a = (i / 46) * Math.PI * 4.2;
          const r = 4 + (i / 46) * 15;
          return [46 + Math.cos(a) * r, 36 + Math.sin(a) * r] as Pt;
        }),
        w: 10,
      },
      { pts: pl([30, 52], [26, 60], [40, 64], [70, 62], [76, 54]), w: 11 },
      { pts: pl([74, 56], [78, 42], [82, 38]), w: 8 },
      { pts: pl([70, 56], [72, 44], [68, 40]), w: 8 },
      { pts: cir(83, 36, 1.6, 8), w: 6 },
      { pts: cir(67, 38, 1.6, 8), w: 6 },
    ],
  }),
  worm: () => ({
    s: [
      { pts: pl([16, 56], [26, 44], [40, 54], [54, 42], [68, 50], [78, 38]), w: 13 },
      { pts: cir(80, 34, 5), w: 9 },
      { pts: cir(80, 33, 1.4, 8), w: 6 },
      { pts: arc(80, 36, 3, 2.4, 0.2, Math.PI - 0.2, 8), w: 6 },
    ],
  }),
  fork: () => ({
    s: [
      { pts: ln(50, 34, 50, 68), w: 11 },
      { pts: pl([38, 10], [38, 30], [62, 30], [62, 10]), w: 9 },
      { pts: ln(46, 10, 46, 30), w: 8 },
      { pts: ln(54, 10, 54, 30), w: 8 },
    ],
  }),
  spoon: () => ({
    s: [
      { pts: ell(50, 22, 13, 17), w: 11 },
      { pts: ln(50, 40, 50, 68), w: 10 },
    ],
  }),
  cheese: () => ({
    s: [
      { pts: pl([20, 60], [20, 34], [74, 20], [80, 34], [80, 48], [20, 60]), sealed: true, w: 11 },
      { pts: ln(20, 34, 80, 34), w: 8 },
      ...dots([[36, 44], [54, 40], [66, 46], [46, 52]], 3.4),
    ],
    f: [{ x: 50, y: 46, c: "#f7c948", after: 0 }],
  }),
  smile: () => ({
    s: [
      { pts: cir(50, 38, 26), sealed: true, w: 11 },
      { pts: cir(41, 32, 2.4, 10), w: 8 },
      { pts: cir(59, 32, 2.4, 10), w: 8 },
      { pts: arc(50, 40, 14, 12, 0.25, Math.PI - 0.25, 14), w: 9 },
    ],
    f: [{ x: 50, y: 38, c: "#f7c948", after: 0 }],
  }),
};

export const BOT_WORDS = Object.keys(RECIPES);

// ---- seeded rng -----------------------------------------------------------

function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ---- the humanizer --------------------------------------------------------

export interface PlanStroke {
  kind: "stroke";
  pts: number[]; // flat, wire space (x and y both 0..1000)
  color: string;
  w: number;
  delay: number; // pause before this stroke starts (ms)
  duration: number; // how long the hand takes (ms)
}
export interface PlanFill {
  kind: "fill";
  x: number;
  y: number;
  color: string;
  delay: number;
}
export interface PlanUndo {
  kind: "undo";
  delay: number;
}
export type PlanItem = PlanStroke | PlanFill | PlanUndo;

/** Walk a polyline, emitting a point every `step` units. */
function densify(pts: Pt[], step: number): Pt[] {
  if (pts.length < 2) return pts;
  const out: Pt[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const d = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.max(1, Math.round(d / step));
    for (let k = 1; k <= n; k++) {
      out.push([x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n]);
    }
  }
  return out;
}

function pathLength(pts: Pt[]): number {
  let L = 0;
  for (let i = 1; i < pts.length; i++)
    L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return L;
}

/**
 * Give a clean polyline a hand: tremor perpendicular to travel, a little
 * drift in rotation/scale, and imperfect endings.
 */
function handify(
  raw: Pt[],
  rnd: () => number,
  sealed: boolean,
  curve = false
): Pt[] {
  const pts = curve ? smooth(raw) : raw;
  const dense = densify(pts, 1.5);
  const n = dense.length;
  if (n < 2) return dense;

  // two slow sine waves = organic wobble (not noisy jitter)
  const a1 = 0.32 + rnd() * 0.55;
  const a2 = 0.16 + rnd() * 0.3;
  const f1 = 0.1 + rnd() * 0.22;
  const f2 = 0.3 + rnd() * 0.5;
  const p1 = rnd() * Math.PI * 2;
  const p2 = rnd() * Math.PI * 2;

  const out: Pt[] = [];
  let t = 0;
  for (let i = 0; i < n; i++) {
    const [x, y] = dense[i];
    if (i > 0) t += Math.hypot(x - dense[i - 1][0], y - dense[i - 1][1]);
    const px = dense[Math.min(i + 1, n - 1)][0] - dense[Math.max(i - 1, 0)][0];
    const py = dense[Math.min(i + 1, n - 1)][1] - dense[Math.max(i - 1, 0)][1];
    const len = Math.hypot(px, py) || 1;
    // perpendicular
    const nx = -py / len;
    const ny = px / len;
    // ends of a stroke are steadier than the middle
    const ease = Math.sin((Math.PI * i) / (n - 1)) * 0.7 + 0.3;
    const wob = (a1 * Math.sin(t * f1 + p1) + a2 * Math.sin(t * f2 + p2)) * ease;
    out.push([x + nx * wob, y + ny * wob]);
  }

  // whole-stroke drift: humans don't place shapes exactly where they meant to
  const cx = out.reduce((s, p) => s + p[0], 0) / out.length;
  const cy = out.reduce((s, p) => s + p[1], 0) / out.length;
  const rot = (rnd() - 0.5) * 0.055;
  const sc = 0.965 + rnd() * 0.07;
  const dx = (rnd() - 0.5) * 2.2;
  const dy = (rnd() - 0.5) * 2.2;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const moved = out.map(([x, y]) => {
    const ox = (x - cx) * sc;
    const oy = (y - cy) * sc;
    return [cx + ox * cos - oy * sin + dx, cy + ox * sin + oy * cos + dy] as Pt;
  });

  // closed shapes: overshoot past the start, or stop just short of it
  const isClosed =
    Math.hypot(raw[0][0] - raw[raw.length - 1][0], raw[0][1] - raw[raw.length - 1][1]) < 2.5;
  if (isClosed) {
    if (sealed || rnd() < 0.55) {
      // overshoot — keeps fills from leaking, and looks eager
      const extra = Math.max(2, Math.round(moved.length * (0.02 + rnd() * 0.05)));
      for (let i = 1; i <= extra; i++) moved.push(moved[i % moved.length]);
    } else {
      // leave a small gap
      const cut = Math.max(1, Math.round(moved.length * (0.01 + rnd() * 0.035)));
      moved.length = Math.max(2, moved.length - cut);
    }
  }
  return moved;
}

const toWire = (p: Pt): [number, number] => [
  Math.max(0, Math.min(1000, Math.round((p[0] / 100) * 1000))),
  Math.max(0, Math.min(1000, Math.round((p[1] / 75) * 1000))),
];

/**
 * Build a full, human-paced drawing plan for a word.
 * Deterministic for a given seed so repeated requests agree.
 */
export function buildPlan(
  word: string,
  seed: number,
  drawSeconds: number
): PlanItem[] {
  const make = RECIPES[word.toLowerCase()];
  if (!make) return [];
  const rnd = mulberry32(seed);
  const recipe = make();

  const items: PlanItem[] = [];
  const fillsBy = new Map<number, Recipe["f"]>();
  for (const f of recipe.f ?? []) {
    const k = f.after ?? 0;
    fillsBy.set(k, [...(fillsBy.get(k) ?? []), f]);
  }

  // one long "hmm, what next" pause somewhere in the middle
  const ponderAt =
    recipe.s.length > 3 ? 1 + Math.floor(rnd() * (recipe.s.length - 2)) : -1;
  // and sometimes a stroke that goes wrong and gets rubbed out
  const oopsAt =
    recipe.s.length > 2 && rnd() < 0.22
      ? 1 + Math.floor(rnd() * (recipe.s.length - 1))
      : -1;

  recipe.s.forEach((st, i) => {
    if (i === oopsAt) {
      // a confident wrong line, a beat of regret, then undo
      const ox = 20 + rnd() * 55;
      const oy = 18 + rnd() * 40;
      const bad = handify(
        [
          [ox, oy],
          [ox + 8 + rnd() * 14, oy + (rnd() - 0.5) * 20],
        ],
        rnd,
        false
      );
      items.push({
        kind: "stroke",
        pts: bad.flatMap(toWire),
        color: INK,
        w: 10,
        delay: 260 + rnd() * 300,
        duration: 240 + rnd() * 220,
      });
      items.push({ kind: "undo", delay: 520 + rnd() * 700 });
    }

    const pts = handify(st.pts, rnd, !!st.sealed, !!st.curve);
    // a sealed outline holds paint better with a slightly fatter nib
    const width = (st.w ?? 11) + (st.sealed ? 3 : 0);
    const len = pathLength(pts);
    // long confident lines are drawn faster per unit than fiddly details
    const speed = (len > 40 ? 128 : 88) + rnd() * 45; // units/sec
    const duration = Math.max(170, Math.min(2400, (len / speed) * 1000));
    let delay = i === 0 ? 420 + rnd() * 520 : 170 + rnd() * 430;
    if (i === ponderAt) delay += 700 + rnd() * 900;

    items.push({
      kind: "stroke",
      pts: pts.flatMap(toWire),
      color: st.color ?? INK,
      w: width,
      delay,
      duration,
    });

    for (const f of fillsBy.get(i) ?? []) {
      const [x, y] = toWire([f.x, f.y]);
      items.push({ kind: "fill", x, y, color: f.c, delay: 320 + rnd() * 420 });
    }
  });

  // fit the performance into the round, leaving room to guess
  const target = drawSeconds * 1000 * (0.58 + rnd() * 0.1);
  const total = items.reduce(
    (s, it) => s + it.delay + (it.kind === "stroke" ? it.duration : 0),
    0
  );
  if (total > target) {
    const k = target / total;
    const delayK = Math.max(0.35, k * 0.8);
    const drawK = Math.max(0.55, k);
    for (const it of items) {
      it.delay = Math.round(it.delay * delayK);
      if (it.kind === "stroke") it.duration = Math.round(it.duration * drawK);
    }
  } else if (total < target * 0.55) {
    // finished early — dawdle a bit, admire the work
    const k = Math.min(2.2, (target * 0.75) / total);
    for (const it of items) it.delay = Math.round(it.delay * k);
  }
  return items;
}

/** Three drawable choices for a bot's turn, avoiding recently used words. */
export function pickBotWords(used: string[]): {
  words: string[];
  tiers: string[];
} {
  const usedSet = new Set(used.map((w) => w.toLowerCase()));
  const fresh = BOT_WORDS.filter((w) => !usedSet.has(w));
  const pool = fresh.length >= 3 ? fresh : BOT_WORDS;
  const picked: string[] = [];
  const seen = new Set<string>();
  let guard = 0;
  while (picked.length < 3 && guard++ < 100) {
    const w = pool[Math.floor(Math.random() * pool.length)];
    if (seen.has(w)) continue;
    seen.add(w);
    picked.push(w);
  }
  return { words: picked, tiers: picked.map(() => "normal") };
}
