/**
 * Free-form layout for the landing page's two top boxes — the left
 * text/options column and the right demo-video column. Same "PowerPoint
 * mode" mechanic as the workspace (see layout.js / DesignBox.jsx): drag by
 * the blue label, resize from the corner, then "Copy layout" and paste the
 * result here as DEFAULT_LANDING_LAYOUT to make it the default for everyone.
 */

const STORAGE = "paper-playground-landing-layout";

export const LANDING_BOX_IDS = ["landing-text", "landing-video"];

/* x,w in % of canvas width; y,h in px; font is a text-scale multiplier.
 * Flow (responsive grid) is still the default for every visitor — freeMode
 * stays false here — but these box positions are the owner-approved
 * "PowerPoint" arrangement, preloaded so clicking Arrange page starts from
 * this exact layout instead of re-measuring the current flow positions. */
export const DEFAULT_LANDING_LAYOUT = {
  freeMode: false,
  boxes: {
    "landing-text":  { x: 5,    y: 32, w: 47.5, h: 944, font: 1.1 },
    "landing-video": { x: 59.5, y: 72, w: 38,   h: 832, font: 1 },
  },
};

export function loadLandingLayout() {
  try {
    const raw = localStorage.getItem(STORAGE);
    if (!raw) return structuredClone(DEFAULT_LANDING_LAYOUT);
    const saved = JSON.parse(raw);
    return {
      freeMode: !!saved.freeMode,
      boxes: saved.boxes || {},
    };
  } catch {
    return structuredClone(DEFAULT_LANDING_LAYOUT);
  }
}

export function saveLandingLayout(layout) {
  try { localStorage.setItem(STORAGE, JSON.stringify(layout)); } catch { /* non-fatal */ }
}

export function resetLandingLayout() {
  try { localStorage.removeItem(STORAGE); } catch { /* non-fatal */ }
  return structuredClone(DEFAULT_LANDING_LAYOUT);
}
