/**
 * One fixture per chart family the platform claims to reproduce.
 *
 * The bug this exists to stop: a calendar heat map came back as an invented
 * multi-line chart, because two of the three "make it live" gestures never
 * asked whether the figure was already digitized, and because the on-demand
 * builder's own JSON schema could only say line/bar/scatter. Both halves were
 * fixed once for ONE family through ONE entry point last time, and the other
 * paths silently kept the old behaviour — so the check has to walk every
 * family through every path.
 *
 * Each entry carries the two shapes a family appears in:
 *   `panel` — a Phase 5 resultFigures panel (the free, offline path)
 *   `demo`  — a generate-panel result (the metered, online fallback path)
 */

export const REPORTED_LINE = {
  subplotLabel: "(a) forecast vs. actual",
  figureFamily: "line", chartKind: "line", dataSource: "reported", reproduce: true,
  xLabel: "week", yLabel: "unit sales",
  computeJs: "return { x: [1,2,3,4], series: [{ label: 'actual', data: [12, 18, 9, 22] }, { label: 'forecast', data: [11, 17, 12, 20] }] };",
};

export const REPORTED_BAR = {
  subplotLabel: "(b) MAPE by model",
  figureFamily: "bar", chartKind: "bar", dataSource: "reported", reproduce: true,
  xLabel: "model", yLabel: "MAPE (%)",
  computeJs: "return { categories: ['ARIMA','RF','XGB'], series: [{ label: 'MAPE', data: [18.2, 11.4, 9.6] }] };",
};

export const REPORTED_SCATTER = {
  subplotLabel: "(c) residuals",
  figureFamily: "scatter", chartKind: "scatter", dataSource: "reported", reproduce: true,
  xLabel: "fitted", yLabel: "residual",
  computeJs: "return { x: [1,2,3,4,5], series: [{ label: 'residual', data: [0.4,-0.2,0.9,-0.6,0.1] }] };",
};

const dig = (subplotLabel, digitized) => ({
  subplotLabel, figureFamily: digitized.kind, chartKind: "bar",
  dataSource: "reported", reproduce: true, computeJs: "",
  xLabel: "x", yLabel: "y", digitized: { source: "Fig. 4", ...digitized },
});

export const DIGITIZED_PANELS = {
  heatmap: dig("(a) daily sales, day-of-week × week", {
    kind: "heatmap",
    grid: [[3, 8, 12], [5, 9, 14], [4, 7, 11]],
    rowLabels: ["Mon", "Tue", "Wed"], colLabels: ["w1", "w2", "w3"],
    min: 3, max: 14, palette: ["#2166ac", "#f7f7f7", "#b2182b"],
  }),
  groupedBar: dig("(b) accuracy by horizon", {
    kind: "groupedBar",
    groups: [
      { name: "1 week", bars: [{ label: "proposed", value: 9.6 }, { label: "baseline", value: 18.2 }] },
      { name: "4 weeks", bars: [{ label: "proposed", value: 12.1 }, { label: "baseline", value: 24.5 }] },
    ],
  }),
  stackedBar: dig("(c) cost breakdown", {
    kind: "stackedBar",
    subPanels: [{
      name: "",
      groups: [
        { name: "2019", segments: [{ label: "holding", value: 4 }, { label: "stockout", value: 7 }] },
        { name: "2020", segments: [{ label: "holding", value: 6 }, { label: "stockout", value: 3 }] },
      ],
    }],
  }),
  stackedBarH: dig("(d) share by channel", {
    kind: "stackedBarH",
    rows: [
      { name: "retail", segments: [{ label: "online", value: 30 }, { label: "store", value: 70 }] },
      { name: "wholesale", segments: [{ label: "online", value: 55 }, { label: "store", value: 45 }] },
    ],
  }),
  box: dig("(e) error distribution", {
    kind: "box",
    categories: [{ name: "ARIMA", boxes: [{ label: "", min: 2, q1: 6, med: 9, q3: 13, max: 20 }] }],
  }),
  violin: dig("(f) demand density", {
    kind: "violin",
    categories: [{ name: "summer", violins: [{ label: "", dist: [{ y: 0, w: 0.1 }, { y: 5, w: 0.9 }, { y: 10, w: 0.2 }] }] }],
  }),
  radar: dig("(g) criteria", {
    kind: "radar",
    axes: [{ name: "speed" }, { name: "cost" }, { name: "accuracy" }],
    series: [{ label: "proposed", values: [0.8, 0.6, 0.9] }],
  }),
  radialBar: dig("(h) per-region uplift", {
    kind: "radialBar",
    groups: [{ name: "north", bars: [{ label: "uplift", value: 12 }] }, { name: "south", bars: [{ label: "uplift", value: 7 }] }],
    max: 15,
  }),
  scatter: dig("(i) SKU embedding", {
    kind: "scatter",
    series: [{ label: "cluster A", points: [[0.1, 0.2], [0.3, 0.5], [0.2, 0.4]] }],
  }),
  kaplanMeier: dig("(j) time to stockout", {
    kind: "kaplanMeier",
    km: {
      timeUnit: "weeks", yAsPercent: false, pValue: "log-rank p = 0.02",
      groups: [
        { label: "proposed", steps: [[0, 1], [4, 0.9], [8, 0.72], [12, 0.61]], censors: [6] },
        { label: "baseline", steps: [[0, 1], [4, 0.78], [8, 0.5], [12, 0.36]] },
      ],
    },
  }),
};

/** The same families as a generate-panel result — the metered fallback path. */
export function demoFor(kind) {
  const p = DIGITIZED_PANELS[kind];
  return {
    title: `Live ${kind}`, story: "s", source: "Fig. 4",
    demo: {
      kind: "digitized", chartKind: "bar", T: 1, dt: 1,
      xLabel: p.xLabel, yLabel: p.yLabel, caption: "c", params: [], computeJs: "",
      digitized: p.digitized,
    },
  };
}

export const XY_PANELS = { line: REPORTED_LINE, bar: REPORTED_BAR, scatter: REPORTED_SCATTER };

/** Every family the platform claims — the list the check must not shrink. */
export const ALL_FAMILIES = [...Object.keys(XY_PANELS), ...Object.keys(DIGITIZED_PANELS)];
