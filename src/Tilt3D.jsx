/**
 * Tilt3D — the landing page's depth primitive.
 *
 * Wraps any block in a card that rotates toward the pointer on a real
 * perspective projection, lifts toward the viewer, and carries a specular sheen
 * that tracks the cursor. Children marked `pp-pop` / `pp-pop-sm` float above the
 * card's surface, so a card reads as a physical object with parts standing off
 * it rather than a rectangle with a shadow.
 *
 * Deliberately cheap: no state, no re-renders. Pointer moves write the transform
 * straight to the node inside one rAF, so a page full of these costs nothing
 * until you actually hover one.
 *
 * Skipped for touch/pen (no hover to reveal it), for `prefers-reduced-motion`,
 * while a mouse button is held (so a tilt never fights a slider drag), and
 * whenever `disabled` is set.
 */

import { useCallback, useEffect, useRef, useState } from "react";

const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;

export default function Tilt3D({
  children,
  className = "",
  max = 7,          // max rotation per axis, degrees
  lift = 20,        // how far the card comes toward the viewer, px
  perspective = 1100,
  glare = true,
  disabled = false,
  style,
}) {
  const ref = useRef(null);
  const glareRef = useRef(null);
  const frame = useRef(0);

  const onPointerMove = useCallback((e) => {
    if (disabled || e.pointerType !== "mouse" || e.buttons !== 0 || reducedMotion()) return;
    const el = ref.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;   // 0 → 1 across
    const py = (e.clientY - rect.top) / rect.height;   // 0 → 1 down

    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const rx = (0.5 - py) * 2 * max;
      const ry = (px - 0.5) * 2 * max;
      el.style.transition = "transform 120ms ease-out";
      el.style.transform =
        `perspective(${perspective}px) rotateX(${rx.toFixed(2)}deg) ` +
        `rotateY(${ry.toFixed(2)}deg) translateZ(${lift}px)`;

      const g = glareRef.current;
      if (g) {
        g.style.opacity = "1";
        g.style.background =
          `radial-gradient(40% 60% at ${(px * 100).toFixed(1)}% ${(py * 100).toFixed(1)}%, ` +
          "rgba(255,255,255,0.8), rgba(255,255,255,0) 72%)";
      }
    });
  }, [disabled, lift, max, perspective]);

  const reset = useCallback(() => {
    cancelAnimationFrame(frame.current);
    const el = ref.current;
    if (el) {
      el.style.transition = "transform 620ms cubic-bezier(0.22, 1, 0.36, 1)";
      el.style.transform = "";
    }
    if (glareRef.current) glareRef.current.style.opacity = "0";
  }, []);

  return (
    <div
      ref={ref}
      onPointerMove={onPointerMove}
      onPointerLeave={reset}
      onPointerCancel={reset}
      className={`pp-tilt ${className}`}
      style={style}
    >
      {children}
      {glare && <div ref={glareRef} className="pp-tilt-glare" aria-hidden="true" />}
    </div>
  );
}

/**
 * Scroll reveal: panels rotate up out of depth into the viewing plane as they
 * arrive, instead of sliding. One observer per block, disconnected on first hit.
 */
export function Reveal({ children, className = "", delay = 0 }) {
  const ref = useRef(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const io = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setShown(true); io.disconnect(); } },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} style={{ transitionDelay: `${delay}ms` }}
      className={`pp-reveal ${shown ? "is-visible" : ""} ${className}`}>
      {children}
    </div>
  );
}
