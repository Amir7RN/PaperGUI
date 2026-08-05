/**
 * Content-addressed keys for a document.
 *
 * `docKey` was inlined in api.js; the fixture harness has to compute the SAME
 * key from a file on disk so the browser can find what the harness wrote, so it
 * moved here. No imports on purpose — this runs in both Node and the browser.
 */

/** Cheap stable key for a base64 document (sampled — full hashing of a
 *  30MB string on the main thread isn't worth it for a session cache). */
export function docKey(text) {
  const n = text.length;
  let h = 0;
  for (let i = 0; i < n; i += Math.max(1, Math.floor(n / 512))) {
    h = ((h << 5) - h + text.charCodeAt(i)) | 0;
  }
  return `${n}:${h}`;
}

/**
 * Directory name for a paper's fixtures.
 *
 * Same identity as the phase-cache key MINUS the tier: a fixture is a recording
 * of the analyzer's output for a document, and re-testing the same paper at a
 * different tier during development should not re-buy it. (The live phase cache
 * keeps the tier for the opposite reason — a reader who re-runs at Advanced is
 * asking for a better analysis and must not be handed yesterday's Fast pass.)
 *
 * Non-alphanumerics are folded to "-" because docKey contains ":", which is not
 * a legal filename character on Windows.
 */
export function fixtureKey(pdfBase64, codeText) {
  const raw = docKey(pdfBase64) + (codeText ? `+${docKey(codeText)}` : "");
  return raw.replace(/[^A-Za-z0-9]+/g, "-");
}
