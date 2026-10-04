"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { IconLogo, PlayerAvatar, Wordmark } from "@/components/icons";
import { roomCode } from "@/lib/names";

interface Item {
  id: string;
  url: string;
  word: string;
  drawerName: string | null;
  drawerAvatar: string | null;
  difficulty: string | null;
  mode: string | null;
  theme: string | null;
  roomId: string;
  round: number | null;
  drawnAt: string;
}

interface Facets {
  total: number;
  players: { name: string; avatar: string | null; count: number }[];
  unknownPlayers: number;
  difficulties: Record<string, number>;
  modes: Record<string, number>;
  oldest: string | null;
}

const DIFFICULTIES = [
  { key: "kids", label: "KIDS" },
  { key: "medium", label: "Medium" },
  { key: "hard", label: "Hard" },
  { key: "ultra", label: "INSANITY" },
] as const;

const MODES = [
  { key: "classic", label: "Draw & guess" },
  { key: "drawathon", label: "Draw-a-thon" },
] as const;

const FILTER_KEYS = ["q", "player", "difficulty", "mode", "from", "to", "room"] as const;
type Filters = Partial<Record<(typeof FILTER_KEYS)[number], string>>;

const KEY_STORE = "dd_gallery_key";

export default function GalleryPage() {
  return (
    <Suspense fallback={null}>
      <Gallery />
    </Suspense>
  );
}

function Gallery() {
  const router = useRouter();
  const params = useSearchParams();
  const filters = useMemo(() => {
    const f: Filters = {};
    for (const k of FILTER_KEYS) {
      const v = params.get(k);
      if (v) f[k] = v;
    }
    return f;
  }, [params]);

  const setFilters = useCallback(
    (patch: Filters) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      const qs = next.toString();
      router.replace(qs ? `/gallery?${qs}` : "/gallery", { scroll: false });
    },
    [params, router]
  );

  const [galleryKey, setGalleryKey] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  useEffect(() => {
    try {
      setGalleryKey(localStorage.getItem(KEY_STORE) ?? "");
    } catch {
      setGalleryKey("");
    }
  }, []);

  const get = useCallback(
    async (qs: string) => {
      const res = await fetch(`/api/gallery?${qs}`, {
        headers: galleryKey ? { "x-gallery-key": galleryKey } : {},
      });
      if (res.status === 401) {
        setLocked(true);
        throw new Error("locked");
      }
      setLocked(false);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load");
      return json;
    },
    [galleryKey]
  );

  const [facets, setFacets] = useState<Facets | null>(null);
  useEffect(() => {
    if (galleryKey === null) return;
    get("facets=1").then(setFacets).catch(() => {});
  }, [galleryKey, get]);

  const [items, setItems] = useState<Item[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [nextOffset, setNextOffset] = useState<number | null>(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);

  const queryFor = useCallback(
    (offset: number) => {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(filters)) if (v) qs.set(k, v);
      qs.set("offset", String(offset));
      qs.set("tz", String(new Date().getTimezoneOffset()));
      return qs.toString();
    },
    [filters]
  );

  const loadPage = useCallback(
    async (offset: number, gen: number) => {
      setLoading(true);
      setError("");
      try {
        const j = await get(queryFor(offset));
        if (gen !== generation.current) return;
        setItems((prev) => (offset === 0 ? j.items : [...prev, ...j.items]));
        setTotal(j.total);
        setNextOffset(j.nextOffset);
      } catch (e) {
        if (gen === generation.current && (e as Error).message !== "locked")
          setError((e as Error).message);
      } finally {
        if (gen === generation.current) setLoading(false);
      }
    },
    [get, queryFor]
  );

  // any filter change starts over from the top
  useEffect(() => {
    if (galleryKey === null) return;
    const gen = ++generation.current;
    setItems([]);
    setNextOffset(0);
    loadPage(0, gen);
  }, [galleryKey, loadPage]);

  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loading && nextOffset && !error)
          loadPage(nextOffset, generation.current);
      },
      { rootMargin: "800px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [loading, nextOffset, error, loadPage]);

  const [open, setOpen] = useState<number | null>(null);
  const activeCount = Object.keys(filters).length;

  if (locked) {
    return (
      <Unlock
        onKey={(k) => {
          try {
            localStorage.setItem(KEY_STORE, k);
          } catch {}
          setGalleryKey(k);
        }}
      />
    );
  }

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-3 py-4 sm:px-6 sm:py-6">
      <header className="flex flex-wrap items-center gap-3">
        <Link href="/" className="leading-none" style={{ fontSize: "clamp(20px, 4vw, 30px)" }}>
          <IconLogo size={28} /> <Wordmark />
        </Link>
        <h1 className="font-display text-xl text-ink/70 sm:text-2xl">· The Gallery</h1>
        <span className="ml-auto text-xs font-bold text-ink/45">
          {total === null
            ? ""
            : activeCount
            ? `${total} of ${facets?.total ?? "…"} drawings`
            : `${total} drawings`}
        </span>
      </header>

      <FilterBar
        filters={filters}
        facets={facets}
        onChange={setFilters}
        activeCount={activeCount}
      />

      {error && (
        <p className="mt-6 text-center text-sm font-bold text-coral">
          {error}{" "}
          <button className="underline" onClick={() => loadPage(nextOffset ?? 0, generation.current)}>
            retry
          </button>
        </p>
      )}

      {!loading && items.length === 0 && !error && (
        <div className="mt-16 text-center text-ink/50">
          <div className="text-4xl">🖍️</div>
          <p className="mt-2 font-display text-lg">
            {activeCount ? "Nothing matches those filters." : "No drawings archived yet."}
          </p>
          {activeCount > 0 && (
            <button
              onClick={() => setFilters(Object.fromEntries(FILTER_KEYS.map((k) => [k, ""])))}
              className="mt-3 text-sm font-bold underline decoration-dotted"
            >
              clear filters
            </button>
          )}
        </div>
      )}

      {/* masonry: CSS columns flow cards top-to-bottom, Pinterest style */}
      <div className="mt-5 columns-2 gap-3 sm:columns-3 lg:columns-4 xl:columns-5">
        {items.map((it, i) => (
          <Card
            key={it.id}
            item={it}
            onOpen={() => setOpen(i)}
            onPlayer={(name) => setFilters({ player: name })}
          />
        ))}
      </div>

      <div ref={sentinel} className="h-10" />
      {loading && (
        <p className="py-6 text-center font-display text-ink/45 animate-pulse">
          Fetching doodles…
        </p>
      )}
      {!loading && nextOffset === null && items.length > 0 && (
        <p className="py-6 text-center text-xs text-ink/35">That&apos;s every one of them.</p>
      )}

      {open !== null && items[open] && (
        <Lightbox
          item={items[open]}
          hasPrev={open > 0}
          hasNext={open < items.length - 1 || nextOffset !== null}
          onPrev={() => setOpen((o) => (o && o > 0 ? o - 1 : o))}
          onNext={() => {
            if (open < items.length - 1) setOpen(open + 1);
            else if (nextOffset !== null && !loading) loadPage(nextOffset, generation.current);
          }}
          onClose={() => setOpen(null)}
          onFilter={(patch) => {
            setOpen(null);
            setFilters(patch);
          }}
        />
      )}
    </main>
  );
}

// --- filters ---------------------------------------------------------------

function isoDay(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function FilterBar({
  filters,
  facets,
  onChange,
  activeCount,
}: {
  filters: Filters;
  facets: Facets | null;
  onChange: (patch: Filters) => void;
  activeCount: number;
}) {
  const [word, setWord] = useState(filters.q ?? "");
  useEffect(() => setWord(filters.q ?? ""), [filters.q]);
  useEffect(() => {
    if ((filters.q ?? "") === word.trim()) return;
    const t = window.setTimeout(() => onChange({ q: word.trim() }), 350);
    return () => window.clearTimeout(t);
  }, [word, filters.q, onChange]);

  const today = isoDay(new Date());
  const daysAgo = (n: number) => isoDay(new Date(Date.now() - n * 86400_000));
  const presets = [
    { label: "All time", from: "", to: "" },
    { label: "Today", from: today, to: today },
    { label: "7 days", from: daysAgo(6), to: "" },
    { label: "30 days", from: daysAgo(29), to: "" },
  ];
  const presetActive = (p: (typeof presets)[number]) =>
    (filters.from ?? "") === p.from && (filters.to ?? "") === p.to;
  const customDates = !presets.some(presetActive);

  const chip = (on: boolean) =>
    `rounded-lg border-2 px-2.5 py-1 text-xs font-bold transition-all ${
      on ? "border-ink bg-sun shadow-doodle" : "border-ink/15 bg-white hover:border-ink/40"
    }`;

  return (
    <div className="sticky top-0 z-20 -mx-3 mt-4 border-b-2 border-ink/10 bg-paper/95 px-3 py-3 backdrop-blur sm:-mx-6 sm:px-6">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={word}
          onChange={(e) => setWord(e.target.value)}
          placeholder="Search words…"
          className="min-w-0 flex-1 basis-40 rounded-xl border-2 border-ink/20 bg-white px-3 py-1.5 text-sm font-bold outline-none focus:border-ink"
        />
        <select
          value={filters.player ?? ""}
          onChange={(e) => onChange({ player: e.target.value })}
          className="max-w-[46vw] rounded-xl border-2 border-ink/20 bg-white px-2 py-1.5 text-sm font-bold outline-none focus:border-ink"
        >
          <option value="">Everyone</option>
          {facets?.players.map((p) => (
            <option key={p.name} value={p.name}>
              {p.name} ({p.count})
            </option>
          ))}
          {(facets?.unknownPlayers ?? 0) > 0 && (
            <option value="__unknown">Unknown artist ({facets!.unknownPlayers})</option>
          )}
        </select>
        {activeCount > 0 && (
          <button
            onClick={() => onChange(Object.fromEntries(FILTER_KEYS.map((k) => [k, ""])))}
            className="text-xs font-bold text-ink/50 underline decoration-dotted hover:text-ink"
          >
            clear all
          </button>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <button className={chip(!filters.difficulty)} onClick={() => onChange({ difficulty: "" })}>
          Any level
        </button>
        {DIFFICULTIES.map((d) => (
          <button
            key={d.key}
            className={chip(filters.difficulty === d.key)}
            onClick={() => onChange({ difficulty: filters.difficulty === d.key ? "" : d.key })}
          >
            {d.label}
            {facets?.difficulties[d.key] ? (
              <span className="ml-1 text-ink/40">{facets.difficulties[d.key]}</span>
            ) : null}
          </button>
        ))}
        <span className="mx-1 h-5 w-px bg-ink/15" />
        <button className={chip(!filters.mode)} onClick={() => onChange({ mode: "" })}>
          Any game
        </button>
        {MODES.map((m) => (
          <button
            key={m.key}
            className={chip(filters.mode === m.key)}
            onClick={() => onChange({ mode: filters.mode === m.key ? "" : m.key })}
          >
            {m.label}
            {facets?.modes[m.key] ? (
              <span className="ml-1 text-ink/40">{facets.modes[m.key]}</span>
            ) : null}
          </button>
        ))}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {presets.map((p) => (
          <button
            key={p.label}
            className={chip(presetActive(p))}
            onClick={() => onChange({ from: p.from, to: p.to })}
          >
            {p.label}
          </button>
        ))}
        <span className={`flex items-center gap-1 rounded-lg border-2 px-1.5 py-0.5 text-xs font-bold ${customDates ? "border-ink bg-sun/40" : "border-ink/15 bg-white"}`}>
          <input
            type="date"
            value={filters.from ?? ""}
            max={filters.to || today}
            onChange={(e) => onChange({ from: e.target.value })}
            className="bg-transparent outline-none"
            aria-label="From date"
          />
          <span className="text-ink/40">→</span>
          <input
            type="date"
            value={filters.to ?? ""}
            min={filters.from || undefined}
            max={today}
            onChange={(e) => onChange({ to: e.target.value })}
            className="bg-transparent outline-none"
            aria-label="To date"
          />
        </span>
        {filters.room && (
          <span className="flex items-center gap-1 rounded-lg border-2 border-ink bg-sun px-2 py-1 text-xs font-bold">
            Game {roomCode(filters.room)}
            <button onClick={() => onChange({ room: "" })} aria-label="Clear game filter">
              ✕
            </button>
          </span>
        )}
      </div>
    </div>
  );
}

// --- cards -----------------------------------------------------------------

function levelLabel(d: string | null) {
  return DIFFICULTIES.find((x) => x.key === d)?.label ?? null;
}

function when(iso: string) {
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86400_000);
  if (days < 1 && new Date().getDate() === d.getDate()) return "today";
  if (days < 2) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  });
}

function Card({
  item,
  onOpen,
  onPlayer,
}: {
  item: Item;
  onOpen: () => void;
  onPlayer: (name: string) => void;
}) {
  const level = levelLabel(item.difficulty);
  return (
    <figure className="group mb-3 break-inside-avoid overflow-hidden rounded-2xl border-2 border-ink/15 bg-white transition-all hover:-translate-y-0.5 hover:border-ink hover:shadow-doodle">
      <button onClick={onOpen} className="block w-full cursor-zoom-in" aria-label={`Open “${item.word}”`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.url}
          alt={item.word}
          loading="lazy"
          width={640}
          height={480}
          className="block aspect-[4/3] w-full bg-white object-contain"
        />
      </button>
      <figcaption className="border-t border-ink/10 px-2.5 py-2">
        <div className="font-display text-sm font-bold leading-tight">{item.word}</div>
        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-ink/55">
          {item.drawerName ? (
            <button
              onClick={() => onPlayer(item.drawerName!)}
              className="flex min-w-0 items-center gap-1 font-bold hover:text-ink"
              title={`Only ${item.drawerName}'s drawings`}
            >
              <PlayerAvatar token={item.drawerAvatar ?? "a0"} size={16} />
              <span className="truncate">{item.drawerName}</span>
            </button>
          ) : (
            <span className="italic">unknown artist</span>
          )}
          <span className="ml-auto shrink-0">{when(item.drawnAt)}</span>
        </div>
        {(level || item.mode === "drawathon") && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {level && (
              <span
                className={`rounded-full px-1.5 text-[9px] font-extrabold uppercase tracking-wide ${
                  item.difficulty === "ultra"
                    ? "bg-coral text-white"
                    : item.difficulty === "kids"
                    ? "bg-green-100 text-green-800"
                    : "bg-ink/5 text-ink/55"
                }`}
              >
                {level}
              </span>
            )}
            {item.mode === "drawathon" && (
              <span className="rounded-full bg-sun/60 px-1.5 text-[9px] font-extrabold uppercase tracking-wide text-ink/70">
                draw-a-thon
              </span>
            )}
          </div>
        )}
      </figcaption>
    </figure>
  );
}

function Lightbox({
  item,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
  onClose,
  onFilter,
}: {
  item: Item;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  onFilter: (patch: Filters) => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") onPrev();
      else if (e.key === "ArrowRight") onNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onPrev, onNext]);

  const d = new Date(item.drawnAt);
  const level = levelLabel(item.difficulty);
  const arrow =
    "absolute top-1/2 z-10 -translate-y-1/2 rounded-full border-2 border-ink bg-white px-3 py-1.5 font-display text-lg shadow-doodle disabled:opacity-30";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 p-3 sm:p-6"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-2xl border-2 border-ink bg-white shadow-doodle"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative min-h-0 flex-1 bg-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.url} alt={item.word} className="mx-auto max-h-[70vh] w-full object-contain" />
          <button className={`${arrow} left-2`} onClick={onPrev} disabled={!hasPrev} aria-label="Previous">
            ‹
          </button>
          <button className={`${arrow} right-2`} onClick={onNext} disabled={!hasNext} aria-label="Next">
            ›
          </button>
        </div>
        <div className="border-t-2 border-ink/10 px-4 py-3">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="font-display text-xl text-coral">{item.word}</div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink/60">
                {item.drawerName ? (
                  <span className="flex items-center gap-1 font-bold text-ink">
                    <PlayerAvatar token={item.drawerAvatar ?? "a0"} size={18} />
                    {item.drawerName}
                  </span>
                ) : (
                  <span className="italic">unknown artist</span>
                )}
                <span>
                  {d.toLocaleDateString(undefined, { weekday: "short", year: "numeric", month: "short", day: "numeric" })}{" "}
                  {d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                </span>
                {level && <span>· {level}</span>}
                <span>· {item.mode === "drawathon" ? "Draw-a-thon" : "Draw & guess"}</span>
                {item.round && <span>· round {item.round}</span>}
                {item.theme && <span>· theme: {item.theme}</span>}
              </div>
            </div>
            <button onClick={onClose} className="rounded-lg px-2 py-1 text-xs font-bold text-ink/45 hover:text-ink">
              close
            </button>
          </div>
          <div className="mt-2.5 flex flex-wrap gap-1.5 text-xs font-bold">
            <button
              onClick={() => onFilter({ room: item.roomId })}
              className="rounded-lg border-2 border-ink/20 px-2 py-1 hover:border-ink"
            >
              Everything from game {roomCode(item.roomId)}
            </button>
            {item.drawerName && (
              <button
                onClick={() => onFilter({ player: item.drawerName! })}
                className="rounded-lg border-2 border-ink/20 px-2 py-1 hover:border-ink"
              >
                More by {item.drawerName}
              </button>
            )}
            <button
              onClick={() => onFilter({ q: item.word })}
              className="rounded-lg border-2 border-ink/20 px-2 py-1 hover:border-ink"
            >
              Every “{item.word}”
            </button>
            <a
              href={item.url}
              target="_blank"
              rel="noreferrer"
              className="ml-auto rounded-lg border-2 border-ink bg-sun px-2 py-1 shadow-doodle"
            >
              Open image ↗
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

function Unlock({ onKey }: { onKey: (k: string) => void }) {
  const [k, setK] = useState("");
  return (
    <main className="mx-auto mt-24 w-full max-w-sm px-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (k.trim()) onKey(k.trim());
        }}
        className="rounded-2xl border-2 border-ink bg-white p-6 text-center shadow-doodle"
      >
        <div className="text-3xl">🔒</div>
        <h1 className="mt-2 font-display text-xl">The gallery is locked</h1>
        <input
          autoFocus
          type="password"
          value={k}
          onChange={(e) => setK(e.target.value)}
          placeholder="Gallery key"
          className="mt-4 w-full rounded-xl border-2 border-ink/20 bg-paper px-3 py-2 text-center font-bold outline-none focus:border-ink"
        />
        <button className="btn-primary mt-3 w-full">Open</button>
      </form>
    </main>
  );
}
