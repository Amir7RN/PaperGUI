/**
 * DesignBox — a PowerPoint-style movable/resizable box.
 *
 * In "flow" mode it renders its children in normal document flow (the default,
 * responsive layout everyone sees). In "free" mode it becomes an absolutely
 * positioned box on a full-bleed canvas that the user can drag (header handle),
 * resize (corner handle), and rescale text on (A− / A+). Geometry lives in the
 * layout config as { x, w (% of canvas), y, h (px), font (multiplier) }.
 */

import React, { useEffect, useRef } from "react";
import { GripVertical, Type } from "lucide-react";

const snapPx = (v) => Math.round(v / 8) * 8;
const snapPct = (v) => Math.round(v / 0.5) * 0.5;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export default function DesignBox({ id, label, mode, rect, onRect, register, children }) {
  const ref = useRef(null);

  useEffect(() => {
    register(id, ref.current);
    return () => register(id, null);
  }, [id, register]);

  if (mode !== "free" || !rect) {
    // flow mode: normal responsive layout
    return (
      <div ref={ref} data-box={id} className="mb-2">
        {children}
      </div>
    );
  }

  const canvasEl = () => ref.current?.parentElement;

  const startPointer = (e, kind) => {
    e.preventDefault();
    e.stopPropagation();
    const canvas = canvasEl()?.getBoundingClientRect();
    if (!canvas) return;
    const start = { px: e.clientX, py: e.clientY, x: rect.x, y: rect.y, w: rect.w, h: rect.h };
    const onMove = (ev) => {
      const dxPct = ((ev.clientX - start.px) / canvas.width) * 100;
      const dy = ev.clientY - start.py;
      if (kind === "move") {
        onRect(id, { ...rect, x: clamp(snapPct(start.x + dxPct), -5, 100), y: Math.max(0, snapPx(start.y + dy)) });
      } else {
        onRect(id, { ...rect, w: clamp(snapPct(start.w + dxPct), 12, 105), h: Math.max(90, snapPx(start.h + dy)) });
      }
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const bumpFont = (d) => onRect(id, { ...rect, font: clamp(+((rect.font || 1) + d).toFixed(2), 0.6, 2) });

  return (
    <div
      ref={ref}
      className="group absolute"
      style={{
        left: `${rect.x}%`,
        top: rect.y,
        width: `${rect.w}%`,
        height: rect.h,
        ["--box-font-scale"]: rect.font || 1,
      }}
    >
      {/* toolbar */}
      <div className="absolute -top-7 left-0 z-10 flex items-center gap-1 rounded-t-lg border border-b-0 border-blue-300 bg-blue-600 px-1.5 py-1 text-[10px] font-medium text-white shadow">
        <button
          onPointerDown={(e) => startPointer(e, "move")}
          className="flex cursor-move items-center gap-1 rounded px-1 hover:bg-white/20"
          title="Drag to move"
        >
          <GripVertical size={11} /> {label}
        </button>
        <span className="mx-0.5 h-3 w-px bg-white/30" />
        <button onClick={() => bumpFont(-0.05)} className="rounded px-1 hover:bg-white/20" title="Smaller text">A−</button>
        <button onClick={() => bumpFont(0.05)} className="rounded px-1 hover:bg-white/20" title="Larger text"><span className="text-xs">A+</span></button>
        <Type size={10} className="opacity-70" />
        <span className="tabular-nums opacity-80">{Math.round((rect.font || 1) * 100)}%</span>
      </div>

      {/* content box */}
      <div className="absolute inset-0 overflow-auto rounded-lg outline outline-2 outline-blue-400/60">
        {children}
      </div>

      {/* resize handle */}
      <button
        onPointerDown={(e) => startPointer(e, "resize")}
        className="absolute -bottom-1 -right-1 z-10 h-4 w-4 cursor-nwse-resize rounded-sm border border-white bg-blue-600 shadow"
        title="Drag to resize"
        aria-label="Resize box"
      />
    </div>
  );
}
