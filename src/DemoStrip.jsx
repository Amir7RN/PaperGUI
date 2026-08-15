/**
 * The two demo recordings on the landing page.
 *
 * A sentence saying "the figure comes back live" is a promise; ten seconds of
 * someone dragging one is proof, and it costs a visitor nothing to check. So
 * the claim above this strip is answered by two screen captures of the product
 * doing the thing.
 *
 * THE FILES ARE HUGE — 10 to 12 MB each. Rendered as plain <img> they would be
 * fetched by every visitor before the page settled: 20 MB to look at a landing
 * page, most of it on a phone, all of it before anyone decided they cared. So
 * a tile shows a POSTER — the recording's own first frame, ~100 kB, cut by
 * scripts/gif-posters.mjs — and the GIF's `src` is set only on click. Clicking
 * again drops it. Because the poster IS frame 0, pressing play changes nothing
 * on screen except that it starts moving.
 *
 * The playback speed is not set here either: a GIF carries its own frame
 * delays and an <img> exposes no playback rate, so the recordings are re-timed
 * on disk by scripts/gif-speed.mjs.
 */

import React, { useState, useRef, useEffect } from "react";
import { Play } from "lucide-react";

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

/* Where each tile sits: x and w as PERCENTAGES of the strip's width, y in
 * pixels from its top. Percentages horizontally so the arrangement holds
 * together on a 13" display as well as the 27" it was made on.
 *
 * These were placed by hand in the browser, on the real page, with a drag-and-
 * resize mode that is no longer shipped — the arrangement is settled, and an
 * authoring tool left in a landing page is a way for a visitor to break it.
 * `git log src/DemoStrip.jsx` has that mode if it is ever needed again.
 *
 * Height is NOT stored. It follows from the width at the recordings' own 16:9,
 * plus the caption — a thumbnail free to be the wrong shape is a thumbnail
 * that will be, and letterboxed bars read as a bug. */
const LAYOUT = {
  "live-figure": { x: 2.5, y: 0, w: 46 },
  "teach-me":    { x: 49,  y: 0, w: 45.5 },
};

/** Title + blurb under the frame. Fixed, so the derived height is honest. */
const CAPTION_H = 78;

/** One recording: poster until clicked, then the GIF from its first frame. */
function DemoTile({ demo, playing, onToggle }) {
  const { title, blurb, src, poster } = demo;
  return (
    <div className="group flex h-full w-full flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white text-left shadow-sm transition hover:shadow-[0_36px_70px_-40px_rgba(15,23,42,0.5)]">
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={playing}
        aria-label={playing ? `Stop the ${title} recording` : `Play the ${title} recording`}
        className="relative block aspect-video w-full shrink-0 overflow-hidden bg-slate-900"
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
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/95 text-slate-900 shadow-xl transition group-hover:scale-110">
              <Play size={22} className="ml-1 fill-current" />
            </span>
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-white/85">click to play</span>
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

export default function DemoStrip() {
  // One at a time: two 12 MB GIFs playing at once is not a demo.
  const [playing, setPlaying] = useState(null);
  const [width, setWidth] = useState(0);   // the strip's own px width, for the % → px maths
  const stripRef = useRef(null);

  useEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    setWidth(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);

  /* Below this the tiles stack: a placed layout authored on a desktop is
   * unreadable on a phone, and a single column is the correct answer there. */
  const placed = width >= 1024;
  const tileH = (r) => (width * r.w) / 100 * (9 / 16) + CAPTION_H;
  const canvasH = Math.ceil(Math.max(...DEMOS.map((d) => LAYOUT[d.id].y + tileH(LAYOUT[d.id]))));
  const toggle = (id) => setPlaying((cur) => (cur === id ? null : id));

  return (
    <div
      ref={stripRef}
      className={placed ? "relative" : "grid gap-5"}
      style={placed ? { height: canvasH } : undefined}
    >
      {DEMOS.map((demo) => {
        const r = LAYOUT[demo.id];
        const tile = (
          <DemoTile demo={demo} playing={playing === demo.id} onToggle={() => toggle(demo.id)} />
        );
        if (!placed) return <div key={demo.id}>{tile}</div>;
        return (
          <div
            key={demo.id}
            style={{ position: "absolute", left: `${r.x}%`, top: r.y, width: `${r.w}%`, height: tileH(r) }}
          >
            {tile}
          </div>
        );
      })}
    </div>
  );
}
