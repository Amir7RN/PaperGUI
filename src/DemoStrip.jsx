/**
 * The three demo recordings on the landing page.
 *
 * A sentence saying "the figure comes back live" is a promise; ten seconds of
 * someone dragging one is proof, and it costs a visitor nothing to check. So
 * the claim above this strip is answered by three screen captures of the
 * product doing the thing.
 *
 * Two constraints shape everything here:
 *
 *  1. THE FILES ARE HUGE — 6 to 12 MB each. Rendered as plain <img> they would
 *     be fetched by every visitor before the page settled: 30 MB to look at a
 *     landing page, most of it on a phone, all of it before anyone decided
 *     they cared. So a tile shows a POSTER — the recording's own first frame,
 *     ~100 kB, cut by scripts/gif-posters.mjs — and the GIF's `src` is set
 *     only on click. Clicking again drops it. Because the poster IS frame 0,
 *     pressing play changes nothing on screen except that it starts moving.
 *  2. THE SIZE IS A JUDGEMENT CALL, and it is not mine. Three tiles across a
 *     6xl container were too small to read the app in. Rather than guess a
 *     new number, the owner gets an ARRANGE MODE: drag each tile, resize it,
 *     see it at full size on the real page, then bake the result in. Same
 *     workflow as the workspace's layout editor — arrange, copy the JSON,
 *     paste it over the defaults below.
 */

import React, { useState, useRef, useEffect, useCallback } from "react";
import { Play, Move, LayoutGrid, RotateCcw, ClipboardCopy, Check } from "lucide-react";
import Tilt3D from "./Tilt3D.jsx";

/** The recordings, in the order they answer the question above them. */
export const DEMOS = [
  {
    id: "live-figure",
    title: "Live figure",
    blurb: "A figure of the paper, traced and made interactive",
    src: "/sciloupe-demo-live-figure-fig7.gif",
    poster: "/sciloupe-demo-live-figure-fig7.poster.jpg",
  },
  {
    id: "teach-me",
    title: "Teach me",
    blurb: "A section, taught and quizzed on the spot",
    src: "/sciloupe-demo-teach-me.gif",
    poster: "/sciloupe-demo-teach-me.poster.jpg",
  },
];

/* Geometry, per tile: x and w as PERCENTAGES of the strip's width, y in
 * pixels from the top of the strip. Percentages for the horizontal axis so an
 * arrangement made on a 27" display still holds together on a 13" one; pixels
 * for the vertical, because that is how far down the page something actually
 * is.
 *
 * Height is NOT stored. It follows from the width at the recordings' own 16:9,
 * plus the caption — a thumbnail free to be the wrong shape is a thumbnail
 * that will be, and letterboxed bars read as a bug.
 *
 * THIS IS THE BAKED-IN DEFAULT. Arrange the strip, press "Copy layout", paste
 * the result here, and every visitor gets it. */
/* Arranged at ~800px a tile, side by side, filling the width — which is what
 * the numbers below preserve. They are not the raw ones the arrangement
 * produced (-5%..110.5%): that pair is 115.5% of the strip, so it ran off both
 * edges of the window it was built in, and the choice was a page-wide
 * horizontal scrollbar or a clipped tile whose title read "ure". The strip is
 * full-bleed instead (see App.jsx), which buys back the width the bleed was
 * reaching for, and the tiles sit inside it at the same rendered size. */
const DEFAULT_RECTS = {
  "live-figure": { x: 0,    y: 0, w: 49.5 },
  "teach-me":    { x: 50.5, y: 0, w: 49.5 },
};

const STORAGE = "pp-demo-strip";
/* Title + blurb under the frame. Fixed, so the derived height is honest. */
const CAPTION_H = 78;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const snapPct = (v) => Math.round(v * 2) / 2;
const snapPx = (v) => Math.round(v / 8) * 8;

const loadRects = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE) || "null");
    if (!raw || typeof raw !== "object") return DEFAULT_RECTS;
    // Merge over the defaults so a demo added later still has a position.
    return { ...DEFAULT_RECTS, ...raw };
  } catch { return DEFAULT_RECTS; }
};

/** One recording: poster until clicked, then the GIF from its first frame. */
function DemoTile({ demo, playing, onToggle, arranging }) {
  const { title, blurb, src, poster } = demo;
  return (
    <div className="pp-3d-card group flex h-full w-full flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white text-left shadow-sm transition hover:shadow-[0_36px_70px_-40px_rgba(15,23,42,0.5)]">
      <button
        type="button"
        onClick={onToggle}
        disabled={arranging}
        aria-pressed={playing}
        aria-label={playing ? `Stop the ${title} recording` : `Play the ${title} recording`}
        className="relative block aspect-video w-full shrink-0 overflow-hidden bg-slate-900 disabled:cursor-move"
      >
        {/* The poster stays mounted underneath: it is the frame the GIF opens
            on, so there is no flash of empty tile while 12 MB arrives. */}
        <img src={poster} alt={`${title} — first frame`} loading="lazy"
          className="absolute inset-0 h-full w-full object-cover" />
        {playing && (
          /* `key` on the src remounts the element per play, which is what makes
             a replay start at frame 0 instead of resuming where it left off. */
          <img key={src} src={src} alt={`${title} — screen recording`}
            className="absolute inset-0 h-full w-full object-cover" />
        )}
        {!playing && (
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-950/45 transition group-hover:bg-slate-950/30">
            <span className="pp-pop flex h-14 w-14 items-center justify-center rounded-full bg-white/95 text-slate-900 shadow-xl transition group-hover:scale-110">
              <Play size={22} className="ml-1 fill-current" />
            </span>
            {!arranging && (
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-white/85">click to play</span>
            )}
          </span>
        )}
      </button>
      <div className="flex flex-1 flex-col justify-center px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-[15px] font-bold text-slate-900">{title}</span>
          {playing && (
            <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-600">
              playing
            </span>
          )}
        </div>
        <p className="mt-0.5 text-[12.5px] leading-relaxed text-slate-500">{blurb}</p>
      </div>
    </div>
  );
}

export default function DemoStrip({ owner = false }) {
  const [playing, setPlaying] = useState(null);   // one at a time: three 12 MB GIFs at once is not a demo
  const [arranging, setArranging] = useState(false);
  const [rects, setRects] = useState(DEFAULT_RECTS);
  const [copied, setCopied] = useState(false);
  const [width, setWidth] = useState(0);          // the strip's own px width, for the % ↔ px maths
  const stripRef = useRef(null);

  useEffect(() => { setRects(loadRects()); }, []);

  /* Below this the tiles stack and the saved arrangement is ignored: an
   * absolute layout authored on a desktop is unreadable on a phone, and the
   * responsive grid is the correct answer there. */
  const free = width >= 1024;

  useEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    setWidth(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);

  const save = useCallback((next) => {
    setRects(next);
    try { localStorage.setItem(STORAGE, JSON.stringify(next)); } catch { /* private mode */ }
  }, []);

  /* Drag moves, the corner resizes. Both in the strip's own coordinates, so a
   * tile lands where the pointer left it whatever the page is scrolled to. */
  const startPointer = (e, id, kind) => {
    e.preventDefault();
    e.stopPropagation();
    const box = stripRef.current?.getBoundingClientRect();
    if (!box?.width) return;
    const from = { ...rects[id] };
    const px = e.clientX, py = e.clientY;

    const onMove = (ev) => {
      const dxPct = ((ev.clientX - px) / box.width) * 100;
      const dy = ev.clientY - py;
      const next = kind === "move"
        ? { ...from, x: clamp(snapPct(from.x + dxPct), -5, 100), y: Math.max(0, snapPx(from.y + dy)) }
        : { ...from, w: clamp(snapPct(from.w + dxPct), 14, 100) };
      save({ ...rects, [id]: next });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const tileH = (r) => (width * r.w) / 100 * (9 / 16) + CAPTION_H;
  const canvasH = Math.ceil(Math.max(...DEMOS.map((d) => (rects[d.id]?.y || 0) + tileH(rects[d.id] || DEFAULT_RECTS[d.id]))));

  const copyLayout = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(rects, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard blocked */ }
  };

  const toggle = (id) => setPlaying((cur) => (cur === id ? null : id));

  return (
    <div>
      {/* Owner-only. A visitor who drags the landing page apart has broken the
          page, not customised it — this is an authoring tool, and it says
          plainly how to make an arrangement permanent. */}
      {owner && (
        <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
          {arranging && (
            <span className="mr-auto text-[11px] leading-snug text-slate-400">
              Drag a tile to move it, pull its bottom-right corner to resize. Height follows the
              width at 16:9. <strong>Copy layout</strong>, then paste it over <code>DEFAULT_RECTS</code>{" "}
              in <code>DemoStrip.jsx</code> to make it everyone's.
            </span>
          )}
          <button type="button" onClick={() => { setArranging((v) => !v); setPlaying(null); }}
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11.5px] font-semibold transition ${
              arranging
                ? "border-blue-300 bg-blue-50 text-blue-700"
                : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700"
            }`}>
            {arranging ? <LayoutGrid size={13} /> : <Move size={13} />}
            {arranging ? "Done arranging" : "Arrange demos"}
          </button>
          {arranging && (
            <>
              <button type="button" onClick={copyLayout}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11.5px] font-semibold text-slate-500 transition hover:text-slate-700">
                {copied ? <><Check size={13} className="text-emerald-600" /> Copied</> : <><ClipboardCopy size={13} /> Copy layout</>}
              </button>
              <button type="button"
                onClick={() => { try { localStorage.removeItem(STORAGE); } catch { /* private mode */ } setRects(DEFAULT_RECTS); }}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11.5px] font-semibold text-slate-500 transition hover:text-slate-700">
                <RotateCcw size={13} /> Reset
              </button>
            </>
          )}
        </div>
      )}

      {/* The baked arrangement runs from -5% to 110.5% — it bleeds past both
          edges of the column on purpose, which looks deliberate and would also
          hand the whole PAGE a horizontal scrollbar on any window narrower
          than the one it was arranged on. `clip` rather than `hidden` because
          hidden makes this a scroll container, which breaks anchor scrolling
          into the sections below it. Never while arranging: a tile you drag
          out of view is a tile you cannot drag back. */}
      <div
        ref={stripRef}
        className={free ? "relative" : "grid gap-5"}
        style={free ? { height: canvasH, overflowX: arranging ? "visible" : "clip" } : undefined}
      >
        {DEMOS.map((demo) => {
          const r = rects[demo.id] || DEFAULT_RECTS[demo.id];
          const tile = (
            <DemoTile demo={demo} playing={playing === demo.id}
              onToggle={() => toggle(demo.id)} arranging={arranging} />
          );
          if (!free) return <div key={demo.id}>{tile}</div>;
          return (
            <div
              key={demo.id}
              style={{ position: "absolute", left: `${r.x}%`, top: r.y, width: `${r.w}%`, height: tileH(r) }}
              onPointerDown={arranging ? (e) => startPointer(e, demo.id, "move") : undefined}
              className={arranging ? "cursor-move touch-none ring-2 ring-blue-400/70 ring-offset-2 rounded-2xl" : ""}
            >
              {/* Tilt is a nice flourish and a menace while dragging — the box
                  you are pulling should stay under the pointer. */}
              {arranging ? tile : <Tilt3D className="h-full rounded-2xl" max={7} lift={20} glare={false}>{tile}</Tilt3D>}
              {arranging && (
                <button
                  type="button"
                  aria-label={`Resize the ${demo.title} tile`}
                  onPointerDown={(e) => startPointer(e, demo.id, "resize")}
                  className="absolute -bottom-1.5 -right-1.5 h-5 w-5 cursor-nwse-resize touch-none rounded-full border-2 border-white bg-blue-600 shadow-md"
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
