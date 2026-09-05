/**
 * A QR code, encoded here rather than pulled off a CDN.
 *
 * Party mode's whole problem is getting six phones onto one four-letter code
 * across a living room, and the fastest way to do that is a square everyone
 * points a camera at. That has to work on a telly with no network of its own,
 * so no image service and no runtime script — 8kB of arithmetic instead.
 *
 * Byte mode, error correction level M, versions 1–10 (up to 213 characters,
 * where a join URL is about fifty). M is the middle EC level: roughly 15% of
 * the code can be lost, which is about what a glossy screen photographed at an
 * angle across a room actually costs you.
 *
 * The structure follows ISO/IEC 18004 and is cross-checked module-for-module
 * against a reference encoder in scripts/qr-check.mjs.
 */

/** [EC codewords per block, group-1 blocks, data each, group-2 blocks, data each] */
const EC_M: Record<number, [number, number, number, number, number]> = {
  1: [10, 1, 16, 0, 0],
  2: [16, 1, 28, 0, 0],
  3: [26, 1, 44, 0, 0],
  4: [18, 2, 32, 0, 0],
  5: [24, 2, 43, 0, 0],
  6: [16, 4, 27, 0, 0],
  7: [18, 4, 31, 0, 0],
  8: [22, 2, 38, 2, 39],
  9: [22, 3, 36, 2, 37],
  10: [26, 4, 43, 1, 44],
};

const MAX_VERSION = 10;

// --- GF(256), the field the error correction lives in ---------------------

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x = (x << 1) ^ (x & 0x80 ? 0x11d : 0);
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
}

function mul(a: number, b: number): number {
  return a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]];
}

/** (x − α⁰)(x − α¹)…(x − αⁿ⁻¹), the divisor for n error-correction bytes. */
function generator(n: number): Uint8Array {
  let g = new Uint8Array([1]);
  for (let i = 0; i < n; i++) {
    const next = new Uint8Array(g.length + 1);
    for (let j = 0; j < g.length; j++) {
      next[j] ^= g[j];
      next[j + 1] ^= mul(g[j], EXP[i]);
    }
    g = next;
  }
  return g;
}

function ecc(data: Uint8Array, n: number): Uint8Array {
  const g = generator(n);
  const buf = new Uint8Array(data.length + n);
  buf.set(data);
  for (let i = 0; i < data.length; i++) {
    const f = buf[i];
    if (!f) continue;
    for (let j = 0; j < g.length; j++) buf[i + j] ^= mul(g[j], f);
  }
  return buf.slice(data.length);
}

// --- the fixed furniture --------------------------------------------------

/** Centres of the alignment squares, per the spec's spacing rule. */
function alignPositions(version: number): number[] {
  if (version === 1) return [];
  const count = Math.floor(version / 7) + 2;
  const step = Math.ceil((version * 4 + 4) / (count * 2 - 2)) * 2;
  const out = [6];
  for (let pos = version * 4 + 10; out.length < count; pos -= step) out.splice(1, 0, pos);
  return out;
}

const bit = (n: number, i: number) => ((n >>> i) & 1) !== 0;

/** 15 BCH bits: EC level M plus the mask, then the spec's fixed XOR. */
function formatBits(mask: number): number {
  const d = (0b00 << 3) | mask; // M is 00
  let rem = d;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((d << 10) | rem) ^ 0x5412;
}

/** 18 BCH bits, only carried by version 7 and up. */
function versionBits(version: number): number {
  let rem = version;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  return (version << 12) | rem;
}

function maskAt(mask: number, y: number, x: number): boolean {
  switch (mask) {
    case 0: return (x + y) % 2 === 0;
    case 1: return y % 2 === 0;
    case 2: return x % 3 === 0;
    case 3: return (x + y) % 3 === 0;
    case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
    case 5: return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6: return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    default: return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
  }
}

// --- the ugliness score that picks a mask ---------------------------------

const N1 = 3, N2 = 3, N3 = 40, N4 = 10;

/**
 * The run history is the last seven run lengths; a finder-like 1:1:3:1:1 with
 * four modules of quiet on one side is what the decoder can mistake for a real
 * finder pattern, and is worth 40 points of "please pick another mask".
 */
function countFinderish(h: number[]): number {
  const n = h[1];
  const core = n > 0 && h[2] === n && h[3] === n * 3 && h[4] === n && h[5] === n;
  return (
    (core && h[0] >= n * 4 && h[6] >= n ? 1 : 0) +
    (core && h[6] >= n * 4 && h[0] >= n ? 1 : 0)
  );
}

function penalty(m: Uint8Array[], size: number): number {
  let score = 0;

  const addHistory = (run: number, h: number[]) => {
    if (h[0] === 0) run += size; // the border outside the symbol counts as light
    h.pop();
    h.unshift(run);
  };
  const terminate = (dark: boolean, run: number, h: number[]) => {
    if (dark) {
      addHistory(run, h);
      run = 0;
    }
    addHistory(run + size, h);
    return countFinderish(h);
  };

  // rule 1 (runs) and rule 3 (finder-alikes), across then down
  for (let pass = 0; pass < 2; pass++) {
    for (let a = 0; a < size; a++) {
      let dark = false;
      let run = 0;
      const h = [0, 0, 0, 0, 0, 0, 0];
      for (let b = 0; b < size; b++) {
        const on = (pass === 0 ? m[a][b] : m[b][a]) === 1;
        if (on === dark) {
          run++;
          if (run === 5) score += N1;
          else if (run > 5) score++;
        } else {
          addHistory(run, h);
          if (!dark) score += countFinderish(h) * N3;
          dark = on;
          run = 1;
        }
      }
      score += terminate(dark, run, h) * N3;
    }
  }

  // rule 2: solid 2×2 blocks
  for (let y = 0; y < size - 1; y++)
    for (let x = 0; x < size - 1; x++)
      if (
        m[y][x] === m[y][x + 1] &&
        m[y][x] === m[y + 1][x] &&
        m[y][x] === m[y + 1][x + 1]
      )
        score += N2;

  // rule 4: how far the dark/light balance strays from even
  let dark = 0;
  for (const row of m) for (const v of row) dark += v;
  const total = size * size;
  score += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * N4;

  return score;
}

// --- the encoder ----------------------------------------------------------

export interface Qr {
  /** modules per side, including no quiet zone */
  size: number;
  version: number;
  mask: number;
  /** row-major, 1 = dark */
  modules: Uint8Array[];
}

export function encodeQr(text: string): Qr {
  const bytes = new TextEncoder().encode(text);

  let version = 0;
  for (let v = 1; v <= MAX_VERSION; v++) {
    const [, b1, d1, b2, d2] = EC_M[v];
    const room = (b1 * d1 + b2 * d2) * 8 - 4 - (v < 10 ? 8 : 16);
    if (room >= bytes.length * 8) {
      version = v;
      break;
    }
  }
  if (!version) throw new Error("too much text for a QR this size");

  const [ecw, b1, d1, b2, d2] = EC_M[version];
  const dataWords = b1 * d1 + b2 * d2;

  // 1. the bit stream: mode, length, payload, terminator, padding
  const bits: number[] = [];
  const put = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1);
  };
  put(0b0100, 4);
  put(bytes.length, version < 10 ? 8 : 16);
  for (const b of bytes) put(b, 8);
  const cap = dataWords * 8;
  for (let i = 0; i < 4 && bits.length < cap; i++) bits.push(0);
  while (bits.length % 8) bits.push(0);
  for (let i = 0; bits.length < cap; i++) put(i % 2 === 0 ? 0xec : 0x11, 8);

  const words = new Uint8Array(dataWords);
  for (let i = 0; i < dataWords; i++) {
    let v = 0;
    for (let j = 0; j < 8; j++) v = (v << 1) | bits[i * 8 + j];
    words[i] = v;
  }

  // 2. split into blocks, correct each, then interleave — a scratch across the
  //    symbol then damages one codeword per block instead of wiping out one
  const blocks: Uint8Array[] = [];
  const parity: Uint8Array[] = [];
  for (let i = 0, at = 0; i < b1 + b2; i++) {
    const n = i < b1 ? d1 : d2;
    const blk = words.slice(at, at + n);
    at += n;
    blocks.push(blk);
    parity.push(ecc(blk, ecw));
  }
  const stream: number[] = [];
  for (let i = 0; i < Math.max(d1, d2); i++)
    for (const b of blocks) if (i < b.length) stream.push(b[i]);
  for (let i = 0; i < ecw; i++) for (const p of parity) stream.push(p[i]);

  // 3. the fixed patterns, and a map of where data may not go
  const size = version * 4 + 17;
  const grid: Uint8Array[] = Array.from({ length: size }, () => new Uint8Array(size));
  const fixed: Uint8Array[] = Array.from({ length: size }, () => new Uint8Array(size));
  const setFixed = (y: number, x: number, on: boolean) => {
    if (y < 0 || y >= size || x < 0 || x >= size) return;
    grid[y][x] = on ? 1 : 0;
    fixed[y][x] = 1;
  };

  for (const [fy, fx] of [[0, 0], [0, size - 7], [size - 7, 0]] as const)
    for (let i = -1; i <= 7; i++)
      for (let j = -1; j <= 7; j++) {
        const ring = Math.max(Math.abs(i - 3), Math.abs(j - 3));
        setFixed(fy + i, fx + j, ring !== 2 && ring <= 3);
      }

  for (let i = 8; i < size - 8; i++) {
    setFixed(6, i, i % 2 === 0);
    setFixed(i, 6, i % 2 === 0);
  }

  const centres = alignPositions(version);
  const last = centres.length - 1;
  for (let a = 0; a <= last; a++)
    for (let b = 0; b <= last; b++) {
      if ((a === 0 && b === 0) || (a === 0 && b === last) || (a === last && b === 0))
        continue; // the three corners already hold finders
      for (let i = -2; i <= 2; i++)
        for (let j = -2; j <= 2; j++)
          setFixed(centres[a] + i, centres[b] + j, Math.max(Math.abs(i), Math.abs(j)) !== 1);
    }

  // reserve the format strips (written per-mask below) and the version blocks.
  // Row and column 6 are skipped: those two cells belong to the timing lines,
  // which run straight through the format strip and were just drawn.
  for (let i = 0; i <= 8; i++) {
    if (i === 6) continue;
    setFixed(8, i, false);
    setFixed(i, 8, false);
  }
  for (let i = 0; i < 8; i++) {
    setFixed(8, size - 1 - i, false);
    setFixed(size - 1 - i, 8, false);
  }
  if (version >= 7) {
    const vb = versionBits(version);
    for (let i = 0; i < 18; i++) {
      const on = bit(vb, i);
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      setFixed(b, a, on);
      setFixed(a, b, on);
    }
  }

  // 4. thread the codewords up and down the free modules, right to left
  let at = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5; // the vertical timing line is not a data column
    for (let v = 0; v < size; v++)
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - v : v;
        if (!fixed[y][x] && at < stream.length * 8) {
          grid[y][x] = bit(stream[at >>> 3], 7 - (at & 7)) ? 1 : 0;
          at++;
        }
      }
  }

  // 5. try all eight masks, keep the least ugly
  let best: Uint8Array[] | null = null;
  let bestMask = 0;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    const cand = grid.map((row) => row.slice());
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++)
        if (!fixed[y][x] && maskAt(mask, y, x)) cand[y][x] ^= 1;

    const fb = formatBits(mask);
    const write = (y: number, x: number, i: number) => {
      cand[y][x] = bit(fb, i) ? 1 : 0;
    };
    for (let i = 0; i <= 5; i++) write(i, 8, i);
    write(7, 8, 6);
    write(8, 8, 7);
    write(8, 7, 8);
    for (let i = 9; i < 15; i++) write(8, 14 - i, i);
    for (let i = 0; i < 8; i++) write(8, size - 1 - i, i);
    for (let i = 8; i < 15; i++) write(size - 15 + i, 8, i);
    cand[size - 8][8] = 1; // the module that is always dark

    const s = penalty(cand, size);
    if (s < bestScore) {
      bestScore = s;
      bestMask = mask;
      best = cand;
    }
  }

  return { size, version, mask: bestMask, modules: best! };
}

/**
 * One SVG path covering every dark module, in a viewBox of `size + 2*quiet`.
 * Merging horizontal runs keeps the path an order of magnitude shorter than a
 * rect per module, which matters when this is re-rendered behind a live game.
 */
export function qrPath(qr: Qr, quiet = 2): string {
  const parts: string[] = [];
  for (let y = 0; y < qr.size; y++) {
    let x = 0;
    while (x < qr.size) {
      if (!qr.modules[y][x]) {
        x++;
        continue;
      }
      let run = 1;
      while (x + run < qr.size && qr.modules[y][x + run]) run++;
      parts.push(`M${x + quiet} ${y + quiet}h${run}v1h-${run}z`);
      x += run;
    }
  }
  return parts.join("");
}
