"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { RealtimeChannel } from "@supabase/supabase-js";
import { StrokeMsg, StrokeTool } from "@/lib/types";
import { IconEraser, IconFill, IconPen, IconTrash, IconUndo } from "./icons";

export const VW = 1000;
export const VH = 750;

type Op =
  | { kind: "stroke"; sid: string; tool: StrokeTool; color: string; size: number; pts: number[] }
  | { kind: "fill"; x: number; y: number; color: string };

export interface CanvasHandle {
  applyStroke: (m: StrokeMsg) => void;
  applyFill: (m: { x: number; y: number; color: string }) => void;
  applyUndo: () => void;
  applyClear: () => void;
  applyOps: (ops: Op[]) => void;
  getOps: () => Op[];
  snapshot: () => string; // dataURL
  snapshotSmall: () => string; // downscaled jpeg for bot vision
  snapshotKeep: () => string; // mid-size jpeg, for the end-of-game gallery
  snapshotFull: () => string; // the board at full resolution, for the archive
  inkFraction: () => number; // 0..1 how much of the board has marks on it
  reset: () => void;
}

const COLORS = [
  "#1d1d24", "#6e7180", "#ffffff", "#e23e3e", "#f5862c", "#f7c948",
  "#4caf50", "#1e7d32", "#53c2f0", "#2b6fe3", "#8e44ad", "#f06292",
  "#8d5a3b", "#eecfa5",
];
const SIZES = [6, 13, 26, 44];

interface Props {
  channel: RealtimeChannel | null;
  canDraw: boolean;
  onLocalDraw?: () => void;
  /** absolutely-positioned layers pinned to the canvas box */
  overlay?: React.ReactNode;
}

const Canvas = forwardRef<CanvasHandle, Props>(function Canvas(
  { channel, canDraw, onLocalDraw, overlay },
  ref
) {
  const canvasRef = useRef<HTMLCanvasElement>(null); // display
  const bufRef = useRef<HTMLCanvasElement | null>(null); // fixed-res buffer
  const opsRef = useRef<Op[]>([]);
  const drawingRef = useRef<{
    sid: string;
    pts: number[];
    pending: number[];
    lastSent: number;
  } | null>(null);
  const [tool, setTool] = useState<StrokeTool>("pen");
  const [color, setColor] = useState(COLORS[0]);
  const [size, setSize] = useState(SIZES[1]);
  const toolRef = useRef({ tool, color, size });
  toolRef.current = { tool, color, size };

  const buf = () => {
    if (!bufRef.current) {
      const c = document.createElement("canvas");
      c.width = VW;
      c.height = VH;
      bufRef.current = c;
      const g = c.getContext("2d")!;
      g.fillStyle = "#ffffff";
      g.fillRect(0, 0, VW, VH);
    }
    return bufRef.current;
  };

  // Coalesced to one paint per frame. A busy turn delivers ~10 stroke messages
  // a second on top of your own drawing, and each one used to force a full
  // scaled drawImage synchronously — main-thread time that everything else
  // (not least the keyboard) had to wait behind.
  const blitRaf = useRef(0);
  const blit = useCallback(() => {
    if (blitRaf.current) return;
    blitRaf.current = requestAnimationFrame(() => {
      blitRaf.current = 0;
      const disp = canvasRef.current;
      if (!disp) return;
      const g = disp.getContext("2d")!;
      g.imageSmoothingEnabled = true;
      g.drawImage(buf(), 0, 0, disp.width, disp.height);
    });
  }, []);

  // fit the largest 4:3 box inside the available space (width AND height),
  // so a game screen never needs to scroll
  const outerRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const disp = canvasRef.current;
    const outer = outerRef.current;
    const box = boxRef.current;
    if (!disp || !outer || !box) return;
    const fit = () => {
      const rect = outer.getBoundingClientRect();
      const availW = Math.max(80, rect.width);
      const availH = Math.max(60, rect.height);
      let w = availW;
      let h = w * (VH / VW);
      if (h > availH) {
        h = availH;
        w = h * (VW / VH);
      }
      box.style.width = `${Math.round(w)}px`;
      box.style.height = `${Math.round(h)}px`;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      disp.width = Math.round(w * dpr);
      disp.height = Math.round(h * dpr);
      blit();
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(outer);
    window.addEventListener("orientationchange", fit);
    return () => {
      ro.disconnect();
      window.removeEventListener("orientationchange", fit);
    };
  }, [blit]);

  function strokeSegment(
    g: CanvasRenderingContext2D,
    pts: number[],
    from: number,
    op: { color: string; size: number; tool: StrokeTool }
  ) {
    g.strokeStyle = op.tool === "eraser" ? "#ffffff" : op.color;
    g.lineWidth = op.size;
    g.lineCap = "round";
    g.lineJoin = "round";
    g.beginPath();
    const n = pts.length / 2;
    if (n === 1) {
      g.fillStyle = g.strokeStyle;
      g.beginPath();
      g.arc(pts[0], pts[1], op.size / 2, 0, Math.PI * 2);
      g.fill();
      return;
    }
    const start = Math.max(1, from);
    g.moveTo(pts[(start - 1) * 2], pts[(start - 1) * 2 + 1]);
    for (let i = start; i < n; i++) {
      const x = pts[i * 2];
      const y = pts[i * 2 + 1];
      if (i + 1 < n) {
        const mx = (x + pts[(i + 1) * 2]) / 2;
        const my = (y + pts[(i + 1) * 2 + 1]) / 2;
        g.quadraticCurveTo(x, y, mx, my);
      } else {
        g.lineTo(x, y);
      }
    }
    g.stroke();
  }

  function floodFill(x: number, y: number, colorHex: string) {
    const g = buf().getContext("2d")!;
    const img = g.getImageData(0, 0, VW, VH);
    const d = img.data;
    const px = Math.max(0, Math.min(VW - 1, Math.round(x)));
    const py = Math.max(0, Math.min(VH - 1, Math.round(y)));
    const idx = (py * VW + px) * 4;
    const tr = d[idx], tg = d[idx + 1], tb = d[idx + 2];
    const hex = colorHex.replace("#", "");
    const fr = parseInt(hex.slice(0, 2), 16);
    const fg = parseInt(hex.slice(2, 4), 16);
    const fb = parseInt(hex.slice(4, 6), 16);
    if (Math.abs(tr - fr) + Math.abs(tg - fg) + Math.abs(tb - fb) < 12) return;
    // tight tolerance on purpose: a generous one seeps through the soft
    // anti-aliased edge of a stroke and floods the whole board
    const match = (i: number) =>
      Math.abs(d[i] - tr) + Math.abs(d[i + 1] - tg) + Math.abs(d[i + 2] - tb) < 34;
    const stack = [px + py * VW];
    const seen = new Uint8Array(VW * VH);
    while (stack.length) {
      const p = stack.pop()!;
      if (seen[p]) continue;
      seen[p] = 1;
      const i = p * 4;
      if (!match(i)) continue;
      d[i] = fr; d[i + 1] = fg; d[i + 2] = fb; d[i + 3] = 255;
      const x0 = p % VW;
      if (x0 > 0) stack.push(p - 1);
      if (x0 < VW - 1) stack.push(p + 1);
      if (p >= VW) stack.push(p - VW);
      if (p < VW * (VH - 1)) stack.push(p + VW);
    }
    g.putImageData(img, 0, 0);
  }

  const redraw = useCallback(() => {
    const g = buf().getContext("2d")!;
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, VW, VH);
    for (const op of opsRef.current) {
      if (op.kind === "stroke") strokeSegment(g, op.pts, 1, op);
      else floodFill(op.x, op.y, op.color);
    }
    blit();
  }, [blit]);

  // remote application
  const remoteStrokes = useRef<Map<string, Op & { kind: "stroke" }>>(new Map());
  useImperativeHandle(ref, () => ({
    applyStroke(m: StrokeMsg) {
      let op = remoteStrokes.current.get(m.sid);
      const g = buf().getContext("2d")!;
      if (!op) {
        op = { kind: "stroke", sid: m.sid, tool: m.tool, color: m.color, size: m.size, pts: [] };
        remoteStrokes.current.set(m.sid, op);
        opsRef.current.push(op);
      }
      const from = op.pts.length / 2;
      for (let i = 0; i < m.pts.length; i += 2) {
        op.pts.push((m.pts[i] / 1000) * VW, (m.pts[i + 1] / 1000) * VH);
      }
      strokeSegment(g, op.pts, from, op);
      blit();
      if (m.done) remoteStrokes.current.delete(m.sid);
    },
    applyFill(m) {
      opsRef.current.push({ kind: "fill", x: (m.x / 1000) * VW, y: (m.y / 1000) * VH, color: m.color });
      floodFill((m.x / 1000) * VW, (m.y / 1000) * VH, m.color);
      blit();
    },
    applyUndo() {
      opsRef.current.pop();
      redraw();
    },
    applyClear() {
      opsRef.current = [];
      remoteStrokes.current.clear();
      redraw();
    },
    applyOps(ops: Op[]) {
      opsRef.current = ops;
      redraw();
    },
    getOps: () => opsRef.current,
    snapshot: () => buf().toDataURL("image/png"),
    inkFraction: () => {
      const c = document.createElement("canvas");
      c.width = 64;
      c.height = 48;
      const g = c.getContext("2d")!;
      g.fillStyle = "#fff";
      g.fillRect(0, 0, 64, 48);
      g.drawImage(buf(), 0, 0, 64, 48);
      const d = g.getImageData(0, 0, 64, 48).data;
      let inked = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i] < 235 || d[i + 1] < 235 || d[i + 2] < 235) inked++;
      }
      return inked / (64 * 48);
    },
    snapshotSmall: () => jpeg(buf(), 320, 240, 0.6),
    snapshotKeep: () => {
      // step down quality until it fits the upload cap
      for (const q of [0.82, 0.7, 0.55]) {
        const url = jpeg(buf(), 640, 480, q);
        if (url.length < 190_000) return url;
      }
      return jpeg(buf(), 320, 240, 0.6);
    },
    snapshotFull: () => {
      // a doodle is flat colour on white, which PNG keeps crisp and small;
      // a board flooded with fills can get big, so fall back to a sharp jpeg
      const png = buf().toDataURL("image/png");
      if (png.length < 1_400_000) return png;
      return jpeg(buf(), VW, VH, 0.9);
    },
    reset() {
      opsRef.current = [];
      remoteStrokes.current.clear();
      drawingRef.current = null;
      redraw();
    },
  }));

  // --- local drawing -----------------------------------------------------

  function toVirtual(e: React.PointerEvent): [number, number] {
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * VW;
    const y = ((e.clientY - rect.top) / rect.height) * VH;
    return [Math.max(0, Math.min(VW, x)), Math.max(0, Math.min(VH, y))];
  }

  const flushTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  function sendPending(done: boolean) {
    const d = drawingRef.current;
    if (!d || !channel) return;
    if (d.pending.length === 0 && !done) return;
    const { tool, color, size } = toolRef.current;
    const msg: StrokeMsg = {
      sid: d.sid,
      tool,
      color,
      size,
      pts: d.pending.map((v, i) =>
        Math.round((v / (i % 2 === 0 ? VW : VH)) * 1000)
      ),
      done,
    };
    d.pending = [];
    channel.send({ type: "broadcast", event: "stroke", payload: msg });
  }

  function onDown(e: React.PointerEvent) {
    if (!canDraw) return;
    e.preventDefault();
    canvasRef.current!.setPointerCapture(e.pointerId);
    const [x, y] = toVirtual(e);
    const { tool, color, size } = toolRef.current;
    onLocalDraw?.();
    if (tool === "fill") {
      opsRef.current.push({ kind: "fill", x, y, color });
      floodFill(x, y, color);
      blit();
      channel?.send({
        type: "broadcast",
        event: "fill",
        payload: { x: Math.round((x / VW) * 1000), y: Math.round((y / VH) * 1000), color },
      });
      return;
    }
    const sid = Math.random().toString(36).slice(2, 9);
    const op: Op = { kind: "stroke", sid, tool, color, size, pts: [x, y] };
    opsRef.current.push(op);
    drawingRef.current = { sid, pts: [x, y], pending: [x, y], lastSent: 0 };
    const g = buf().getContext("2d")!;
    strokeSegment(g, op.pts, 1, op);
    blit();
    sendPending(false);
    flushTimer.current = setInterval(() => sendPending(false), 100);
  }

  function onMove(e: React.PointerEvent) {
    const d = drawingRef.current;
    if (!d || !canDraw) return;
    e.preventDefault();
    const evs = "getCoalescedEvents" in e.nativeEvent
      ? (e.nativeEvent as PointerEvent).getCoalescedEvents()
      : [e.nativeEvent as PointerEvent];
    const op = opsRef.current[opsRef.current.length - 1];
    if (op?.kind !== "stroke") return;
    const g = buf().getContext("2d")!;
    for (const ev of evs) {
      const rect = canvasRef.current!.getBoundingClientRect();
      const x = Math.max(0, Math.min(VW, ((ev.clientX - rect.left) / rect.width) * VW));
      const y = Math.max(0, Math.min(VH, ((ev.clientY - rect.top) / rect.height) * VH));
      const lastX = op.pts[op.pts.length - 2];
      const lastY = op.pts[op.pts.length - 1];
      if (Math.hypot(x - lastX, y - lastY) < 2) continue;
      const from = op.pts.length / 2;
      op.pts.push(x, y);
      d.pending.push(x, y);
      strokeSegment(g, op.pts, from, op);
    }
    blit();
  }

  function onUp() {
    if (!drawingRef.current) return;
    if (flushTimer.current) clearInterval(flushTimer.current);
    flushTimer.current = null;
    sendPending(true);
    drawingRef.current = null;
  }

  function undo() {
    if (!canDraw) return;
    opsRef.current.pop();
    redraw();
    channel?.send({ type: "broadcast", event: "undo", payload: {} });
  }

  function clearAll() {
    if (!canDraw) return;
    opsRef.current = [];
    redraw();
    channel?.send({ type: "broadcast", event: "clear", payload: {} });
  }

  // keyboard shortcuts
  useEffect(() => {
    if (!canDraw) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
      if ((e.metaKey || e.ctrlKey) && e.key === "z") {
        e.preventDefault();
        undo();
        return;
      }
      if (e.key === "b") setTool("pen");
      if (e.key === "e") setTool("eraser");
      if (e.key === "f") setTool("fill");
      if (e.key === "u") undo();
      if (e.key === "c") clearAll();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canDraw, channel]);

  return (
    <div className="dd-nosel flex h-full min-h-0 w-full flex-col gap-2">
      <div
        ref={outerRef}
        className="relative flex min-h-0 flex-1 items-center justify-center"
      >
        <div ref={boxRef} className="relative">
          <canvas
            ref={canvasRef}
            className={`block h-full w-full rounded-2xl border-2 border-ink bg-white shadow-doodle ${
              canDraw ? "cursor-crosshair" : ""
            }`}
            style={{ touchAction: "none", WebkitUserSelect: "none", userSelect: "none" }}
            onContextMenu={(e) => e.preventDefault()}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            onPointerLeave={onUp}
          />
          {overlay}
        </div>
      </div>

      {canDraw && (
        <div className="flex flex-wrap items-center justify-center gap-1.5 rounded-2xl border-2 border-ink bg-white p-1.5 shadow-doodle sm:gap-2 sm:p-2">
          <div className="flex flex-wrap gap-1">
            {COLORS.map((c) => (
              <button
                key={c}
                aria-label={`color ${c}`}
                onClick={() => {
                  setColor(c);
                  if (toolRef.current.tool === "eraser") setTool("pen");
                }}
                className={`h-8 w-8 rounded-lg border-2 transition-transform active:scale-90 ${
                  color === c && tool !== "eraser"
                    ? "scale-110 border-ink ring-2 ring-ink/30"
                    : "border-ink/25"
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <div className="mx-1 h-8 w-px bg-ink/15" />
          <div className="flex items-center gap-1">
            {SIZES.map((s) => (
              <button
                key={s}
                aria-label={`brush ${s}`}
                onClick={() => setSize(s)}
                className={`flex h-9 w-9 items-center justify-center rounded-lg border-2 ${
                  size === s ? "border-ink bg-sun" : "border-transparent"
                }`}
              >
                <span
                  className="rounded-full bg-ink"
                  style={{ width: 4 + s / 3.2, height: 4 + s / 3.2 }}
                />
              </button>
            ))}
          </div>
          <div className="mx-1 h-8 w-px bg-ink/15" />
          <ToolBtn active={tool === "pen"} onClick={() => setTool("pen")} label="Pen (B)"><IconPen /></ToolBtn>
          <ToolBtn active={tool === "eraser"} onClick={() => setTool("eraser")} label="Eraser (E)"><IconEraser /></ToolBtn>
          <ToolBtn active={tool === "fill"} onClick={() => setTool("fill")} label="Fill (F)"><IconFill /></ToolBtn>
          <ToolBtn active={false} onClick={undo} label="Undo (U)"><IconUndo /></ToolBtn>
          <ToolBtn active={false} onClick={clearAll} label="Clear (C)"><IconTrash /></ToolBtn>
        </div>
      )}
    </div>
  );
});

function ToolBtn({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      title={label}
      aria-label={label}
      onClick={onClick}
      className={`flex h-9 w-9 items-center justify-center rounded-lg border-2 text-lg transition-transform active:scale-90 ${
        active ? "border-ink bg-sun" : "border-transparent hover:bg-well"
      }`}
    >
      {children}
    </button>
  );
}

export default Canvas;
export type { Op };

function jpeg(src: HTMLCanvasElement, w: number, h: number, quality: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  g.fillStyle = "#fff";
  g.fillRect(0, 0, w, h);
  g.drawImage(src, 0, 0, w, h);
  return c.toDataURL("image/jpeg", quality);
}
