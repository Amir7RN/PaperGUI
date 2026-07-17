/**
 * Extract per-figure source data from the authors' published spreadsheets into
 * compact JS data modules (dev-time; node scripts/extract-source-data.mjs).
 *
 *  - papers/1 (Science Robotics quadruped): additional sheets not yet used by
 *    samplePaper4 → src/samplePaper4DataExtra.js
 *  - papers/2 (Nature Materials phonon interference): Figure 2/3/4 workbooks
 *    → src/samplePaper5Data.js
 *
 * Every number written is the authors' own; traces are only downsampled.
 */

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/* ---------- minimal xlsx (zip + sheet xml) reader ---------- */
function unzip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  const entries = {};
  for (let k = 0; k < count; k++) {
    const method = buf.readUInt16LE(off + 10);
    const csize = buf.readUInt32LE(off + 20);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const cmtLen = buf.readUInt16LE(off + 32);
    const lho = buf.readUInt32LE(off + 42);
    const name = buf.slice(off + 46, off + 46 + nameLen).toString("utf8");
    const lnl = buf.readUInt16LE(lho + 26), lel = buf.readUInt16LE(lho + 28);
    const raw = buf.slice(lho + 30 + lnl + lel, lho + 30 + lnl + lel + csize);
    entries[name] = { method, raw };
    off += 46 + nameLen + extraLen + cmtLen;
  }
  return entries;
}
const inflate = (e) => (e.method === 0 ? e.raw : zlib.inflateRawSync(e.raw));

function readWorkbook(file) {
  const entries = unzip(fs.readFileSync(file));
  const wb = inflate(entries["xl/workbook.xml"]).toString("utf8");
  const rels = inflate(entries["xl/_rels/workbook.xml.rels"]).toString("utf8");
  const relMap = {};
  for (const m of rels.matchAll(/<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)) relMap[m[1]] = m[2];
  let shared = [];
  if (entries["xl/sharedStrings.xml"]) {
    const ss = inflate(entries["xl/sharedStrings.xml"]).toString("utf8");
    shared = [...ss.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
      [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join("")
        .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"));
  }
  const sheets = {};
  for (const m of wb.matchAll(/<sheet[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)) {
    let t = relMap[m[2]] || "";
    if (!t.startsWith("xl/")) t = "xl/" + t.replace(/^\//, "");
    sheets[m[1]] = t;
  }
  const colIdx = (letters) => {
    let n = 0;
    for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
    return n - 1;
  };
  return {
    names: Object.keys(sheets),
    rows(name) {
      const xml = inflate(entries[sheets[name]]).toString("utf8");
      const out = [];
      for (const rm of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
        const row = [];
        for (const cm of rm[1].matchAll(/<c r="([A-Z]+)\d+"(?:[^>]*t="([^"]+)")?[^>]*>(?:<f>[\s\S]*?<\/f>)?(?:<v>([\s\S]*?)<\/v>)?<\/c>/g)) {
          let v = cm[3] ?? "";
          if (cm[2] === "s") v = shared[+v] ?? v;
          row[colIdx(cm[1])] = v;
        }
        out.push(row);
      }
      return out;
    },
  };
}

const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
const r = (v, d = 3) => (v === null ? null : +v.toFixed(d));
/** Even-stride downsample of [[x,y],…] to ≤ n points (keeps first/last). */
function ds(points, n) {
  const pts = points.filter((p) => p && p.every((v) => v !== null));
  if (pts.length <= n) return pts;
  const step = (pts.length - 1) / (n - 1);
  const out = [];
  for (let i = 0; i < n; i++) out.push(pts[Math.round(i * step)]);
  return out;
}

/* ================= papers/1 · quadruped extras ================= */
{
  const wb = readWorkbook(path.join(root, "papers/1/scirobotics.adz7397_data_file_s1/adz7397_data_file_s1.csv"));
  const out = {};

  // Fig 3A/3B right-hand traces: cmd_vx + gait selection, two recorded windows
  for (const [sheet, key] of [["Figure 3A top", "FIG3A_TRACE"], ["Figure 3B", "FIG3B_TRACE"]]) {
    const rows = wb.rows(sheet).slice(1);
    const bySeg = {};
    for (const row of rows) {
      if (row[1] !== "skill_velocity") continue;
      const seg = row[2];
      (bySeg[seg] ||= []).push([num(row[3]), num(row[5]), num(row[7])]); // window time (matches the figure axis), cmd_vx, selection
    }
    const segs = {};
    for (const [seg, pts] of Object.entries(bySeg)) {
      const cmd = ds(pts.map((p) => [p[0], p[1]]), 320).map(([x, y]) => [r(x, 1), r(y, 2)]);
      const sel = ds(pts.map((p) => [p[0], p[2]]), 320).map(([x, y]) => [r(x, 1), r(y, 3)]);
      segs[seg] = { cmd, sel };
    }
    out[key] = segs;
  }

  // Fig 5D (leg fracture) / 5E (in-place rotation): HFE + KFE torque decompositions
  for (const [sheet, key] of [["Figure 5D", "FIG5D"], ["Figure 5E", "FIG5E"]]) {
    const rows = wb.rows(sheet).slice(2);
    const grab = (c0) => {
      const tot = [], lat = [], aux = [];
      for (const row of rows) {
        const t = num(row[c0]);
        if (t === null) continue;
        tot.push([t, num(row[c0 + 1])]); lat.push([t, num(row[c0 + 2])]); aux.push([t, num(row[c0 + 3])]);
      }
      const f = (a) => ds(a, 300).map(([x, y]) => [r(x, 3), r(y, 1)]);
      return { total: f(tot), latent: f(lat), aux: f(aux) };
    };
    out[key] = { hfe: grab(0), kfe: grab(6) };
  }

  // Fig 6B: trot fraction vs command velocity, per terrain × difficulty level
  {
    const rows = wb.rows("Figure 6B").slice(1);
    const table = {};
    for (const row of rows) {
      const terrain = row[0], lvl = row[1];
      const v = (num(row[2]) + num(row[3])) / 2;
      (table[`${terrain} · L${lvl}`] ||= []).push([r(v, 3), r(num(row[4]), 3)]);
    }
    out.FIG6B_LVL = table;
  }

  // Fig 6Ci: success / tracking / 1-COT per terrain × speed range × controller
  {
    const rows = wb.rows("Figure 6Ci").slice(1);
    const list = [];
    for (const row of rows) {
      if (!row[0]) continue;
      list.push({
        terrain: row[0], range: (row[1] || "").trim(),
        success: { trot: r(num(row[2]) * 100, 1), ours: r(num(row[3]) * 100, 1), bound: r(num(row[4]) * 100, 1) },
        tracking: { trot: r(num(row[5]), 3), ours: r(num(row[6]), 3), bound: r(num(row[7]), 3) },
        invCot: { trot: r(1 / num(row[8]), 3), ours: r(1 / num(row[9]), 3), bound: r(1 / num(row[10]), 3) },
      });
    }
    out.FIG6CI = list;
  }

  // Fig 7B: success + COT for Proposed / AMP / Vanilla on 3 terrains
  {
    const rows = wb.rows("Figure7 B").slice(1);
    let method = "Proposed"; // the sheet's first block header ("Ours reg") sits in the title row
    const list = [];
    for (const row of rows) {
      if (row[0]) method = row[0] === "Ours reg" ? "Proposed" : row[0];
      if (!row[1]) continue;
      list.push({
        method, gait: row[1], terrain: row[2],
        success: r(num(row[3]) * 100, 1), successStd: r(num(row[4]) * 100, 1),
        invCot: r(1 / num(row[5]), 3),
      });
    }
    out.FIG7B = list;
  }

  // Fig 7D: training-sample consumption
  {
    const rows = wb.rows("Figure7 D").slice(1);
    out.FIG7D = rows.filter((row) => row[0]).map((row) => ({ label: row[0], samples: r(num(row[1]) / 1e9, 2) }));
  }

  // Fig 7E(iii): pitch-angle trace during 2 Hz random gait transitions
  {
    const rows = wb.rows("Figure7 Eiii").slice(1);
    const byPol = {};
    for (const row of rows) {
      if (!row[0]) continue;
      (byPol[row[0]] ||= []).push([num(row[2]), num(row[6])]);
    }
    out.FIG7E_PITCH = Object.fromEntries(Object.entries(byPol).map(([k, pts]) =>
      [k, ds(pts, 215).map(([x, y]) => [r(x, 2), r(y, 2)])]));
  }

  let js = `/**
 * Additional per-figure source data for sample #4 (Science Robotics quadruped),
 * extracted from the authors' own published data file (adz7397_data_file_s1)
 * by scripts/extract-source-data.mjs. Downsampled only — nothing eyeballed.
 */
`;
  for (const [k, v] of Object.entries(out)) js += `\nexport const ${k} = ${JSON.stringify(v)};\n`;
  fs.writeFileSync(path.join(root, "src/samplePaper4DataExtra.js"), js);
  console.log("wrote src/samplePaper4DataExtra.js", Object.keys(out).join(" "));
}

/* ================= papers/2 · phonon interference ================= */
{
  const dir = path.join(root, "papers/2/Source Data/Source Data");
  const wb2 = readWorkbook(path.join(dir, "Figure 2.xlsx"));
  const wb3 = readWorkbook(path.join(dir, "Figure 3.xlsx"));
  const wb4 = readWorkbook(path.join(dir, "Figure 4.xlsx"));
  const out = {};
  const pW = 1e12; // W/K -> pW/K

  // Fig 2a: one junction's simultaneous electrical + thermal trace
  {
    const rows = wb2.rows("Figure 2a").slice(1);
    const th = [], el = [];
    for (const row of rows) {
      const t = num(row[0]);
      if (t === null) continue;
      th.push([t, num(row[1]) * pW]); el.push([t, num(row[2]) * 1000]); // mG0
    }
    out.F2A = { th: ds(th, 240).map(([x, y]) => [r(x, 3), r(y, 2)]), el: ds(el, 240).map(([x, y]) => [r(x, 3), r(y, 3)]) };
  }
  // Fig 2b: consolidated (≈50 traces) mean ± sd
  {
    const rows = wb2.rows("Figure 2b").slice(1);
    const th = [], thE = [], el = [], elE = [];
    for (const row of rows) {
      const t1 = num(row[0]), t2 = num(row[4]);
      if (t1 !== null) { th.push([t1, num(row[1]) * pW]); thE.push([t1, num(row[2]) * pW]); }
      if (t2 !== null) { el.push([t2, num(row[5]) * 1000]); elE.push([t2, num(row[6]) * 1000]); }
    }
    const f2 = (a, d) => ds(a, 220).map(([x, y]) => [r(x, 3), r(y, d)]);
    out.F2B = { th: f2(th, 2), thErr: f2(thE, 2), el: f2(el, 3), elErr: f2(elE, 3) };
  }
  // Fig 2c/2d: histograms
  const hist = (rows, xs = 1, rebin = 1, xd = 3) => {
    const pts = rows.map((row) => [num(row[0]), num(row[1])]).filter((p) => p[0] !== null && p[1] !== null);
    const out2 = [];
    for (let i = 0; i < pts.length; i += rebin) {
      const chunk = pts.slice(i, i + rebin);
      out2.push([r(chunk.reduce((a, p) => a + p[0], 0) / chunk.length * xs, xd), chunk.reduce((a, p) => a + p[1], 0)]);
    }
    return out2;
  };
  out.F2C = hist(wb2.rows("Figure 2c").slice(1), 1, 1, 3);            // log10(G/G0) bins
  out.F2D = hist(wb2.rows("Figure 2d").slice(1), pW, 2, 1);           // pW/K bins (counts stop past ~60 pW/K)
  // Fig 3b/3c: consolidated meta / para traces
  for (const [sheet, key] of [["Figure 3b", "F3META"], ["Figure 3c", "F3PARA"]]) {
    const rows = wb3.rows(sheet).slice(1);
    const th = [], thE = [], el = [], elE = [];
    for (const row of rows) {
      const t1 = num(row[0]), t2 = num(row[4]);
      if (t1 !== null) { th.push([t1, num(row[1]) * pW]); thE.push([t1, num(row[2]) * pW]); }
      if (t2 !== null) { el.push([t2, Math.log10(num(row[5]))]); elE.push([t2, num(row[6])]); }
    }
    const f2 = (a, d) => ds(a, 220).map(([x, y]) => [r(x, 3), r(y, d)]);
    out[key] = { th: f2(th, 2), thErr: f2(thE, 2), elLog: f2(el, 3) };
  }
  // Fig 3d/3e: meta + para histograms side by side
  for (const [sheet, key, xs, rebin, xd] of [["Figure 3d", "F3D", 1, 1, 3], ["Figure 3e", "F3E", pW, 2, 1]]) {
    const rows = wb3.rows(sheet).slice(1);
    out[key] = {
      meta: hist(rows.map((row) => [row[1], row[2]]), xs, rebin, xd),
      para: hist(rows.map((row) => [row[5], row[6]]), xs, rebin, xd),
    };
  }
  // Fig 4: DOS, spectral current (+sd), cumulative inset, kernel, averaged kernels
  {
    const rows = wb4.rows("Figure 4").slice(2);
    const cols = (a, b, c, n, dy) => {
      const s1 = [], s2 = [];
      for (const row of rows) {
        const x = num(row[a]);
        if (x === null) continue;
        s1.push([x, num(row[b])]); if (c !== null) s2.push([x, num(row[c])]);
      }
      const f = (arr) => ds(arr, n).map(([x, y]) => [r(x, 1), y === null ? null : +y.toPrecision(dy)]);
      return [f(s1), f(s2)];
    };
    const [dosM, dosP] = cols(0, 1, 2, 260, 3);
    out.F4B = { meta: dosM, para: dosP };
    const [qM, qMs] = cols(4, 5, 6, 260, 3);
    const [qP, qPs] = cols(4, 7, 8, 260, 3);
    out.F4C = { meta: qM, metaStd: qMs, para: qP, paraStd: qPs };
    const [cumM, cumP] = cols(10, 11, 12, 200, 3);
    out.F4C_INSET = { meta: cumM, para: cumP };
    const [kFull, kIso] = cols(14, 15, 16, 260, 3);
    out.F4D = { full: kFull, isolated: kIso };
    const [avgM, avgP] = cols(18, 19, 20, 260, 3);
    out.F4E = { meta: avgM, para: avgP };
  }

  let js = `/**
 * Sample paper #5 (Yelishala et al., "Phonon interference in single-molecule
 * junctions", Nature Materials 2025) — panel data extracted from the authors'
 * published Source Data workbooks by scripts/extract-source-data.mjs.
 * Thermal conductance converted W/K → pW/K; electrical traces in units of G0
 * (mG0 for BDA); downsampled only — every number is the authors' own.
 */
`;
  for (const [k, v] of Object.entries(out)) js += `\nexport const ${k} = ${JSON.stringify(v)};\n`;
  fs.writeFileSync(path.join(root, "src/samplePaper5Data.js"), js);
  console.log("wrote src/samplePaper5Data.js", Object.keys(out).join(" "));
}
