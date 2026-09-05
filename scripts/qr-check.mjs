/**
 * Cross-checks src/lib/qr.ts against a reference encoder, module for module.
 *
 *   node --experimental-strip-types scripts/qr-check.mjs | ./venv/bin/python …
 *
 * In practice it is driven by scripts/qr-check.py, which pipes our matrices
 * into segno and diffs them. Run it after touching anything in qr.ts: a QR that
 * is subtly wrong still renders as a plausible-looking square.
 */
import { encodeQr } from "../src/lib/qr.ts";

const cases = [];
for (const s of [
  "https://doodle-disaster.vercel.app/party/MYAX",
  "http://localhost:3000/party/AB3D",
  "A",
  "MYAX",
  "https://doodle-disaster-git-a-very-long-preview-branch.vercel.app/party/Z9QT",
  "x".repeat(1),
  "x".repeat(13),
  "x".repeat(14),
  "x".repeat(26),
  "x".repeat(27),
  "x".repeat(42),
  "x".repeat(62),
  "x".repeat(84),
  "x".repeat(106),
  "x".repeat(122),
  "x".repeat(152),
  "x".repeat(180),
  "x".repeat(213),
  "café ☕ crème brûlée",
]) {
  const qr = encodeQr(s);
  cases.push({
    text: s,
    version: qr.version,
    mask: qr.mask,
    size: qr.size,
    rows: qr.modules.map((r) => Array.from(r).join("")),
  });
}

process.stdout.write(JSON.stringify(cases));
