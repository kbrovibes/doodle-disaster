"""
Checks src/lib/qr.ts by rendering its output and reading it back with a real
decoder — the only property that matters, since a subtly wrong QR still looks
like a perfectly plausible square.

    python3 -m venv venv && venv/bin/pip install opencv-python-headless numpy segno
    venv/bin/python scripts/qr-check.py

segno is used as a second opinion on version choice only. It is NOT compared
module-for-module, and its mask choice is not expected to match: segno writes an
extra 0x00 pad codeword when the bit stream already ends on a codeword boundary
(write_padding_bits extends by a full byte when length % 8 == 0), which ISO/IEC
18004 §7.4.10 does not ask for. That one byte changes every masked candidate's
penalty score, so a different mask wins. Both symbols decode to the same text.
"""
import json
import os
import subprocess
import sys

import cv2
import numpy as np
import segno

here = os.path.dirname(os.path.abspath(__file__))
raw = subprocess.run(
    ["node", "--experimental-strip-types", os.path.join(here, "qr-check.mjs")],
    capture_output=True,
    check=True,
).stdout
cases = json.loads(raw)

detector = cv2.QRCodeDetector()
bad = 0
for c in cases:
    grid = np.array([[int(ch) for ch in row] for row in c["rows"]], dtype=np.uint8)
    quiet = 4
    padded = np.zeros((c["size"] + quiet * 2,) * 2, dtype=np.uint8)
    padded[quiet:-quiet, quiet:-quiet] = grid
    img = np.kron(1 - padded, np.ones((8, 8), dtype=np.uint8)) * 255

    got, _, _ = detector.detectAndDecode(img)
    label = c["text"][:40]
    ref = segno.make(c["text"], error="m", mode="byte", micro=False, boost_error=False)

    if got != c["text"]:
        print(f"FAIL decode {label!r}: read back {got!r}")
        bad += 1
    elif ref.version != c["version"]:
        print(f"FAIL version {label!r}: ours v{c['version']}, segno v{ref.version}")
        bad += 1
    else:
        print(f"ok   v{c['version']} mask {c['mask']} {c['size']}x{c['size']}  {label!r}")

print(f"\n{len(cases) - bad}/{len(cases)} passed")
sys.exit(1 if bad else 0)
