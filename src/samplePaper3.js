/**
 * Third bundled sample — an EMPIRICAL / MACHINE-LEARNING methods paper, in the
 * same PaperSpec format the analyzer produces.
 *
 * Paper: Taghiyeh, Lengacher, Sadeghi, Sahebi-Fakhrabad, Handfield —
 * "A novel multi-phase hierarchical forecasting approach with machine learning
 * in supply chain management", Supply Chain Analytics 3 (2023) 100032, Elsevier
 * (open access, CC BY-NC-ND).
 *
 * The forecasting results were COMPUTED by four ML models (MLP/RF/GB/XGB), tuned
 * with HyperOpt + successive halving, on 935 days of a shoe brand's proprietary
 * sales — there is nothing to re-run in the browser, so archetype.pipelineFeasible
 * is false. Instead the dashboard is: the paper's story + mind map, its method
 * drawn as two ANIMATED flow diagrams (Figs 1–2 rebuilt as SVG), honestly-
 * simulatable FOUNDATIONS (the tuning algorithm's own mechanics, the variance-
 * reduction-by-aggregation that MPH exploits, and time-series cross-validation),
 * hands-on EXPLORABLES of the paper's OWN reported numbers (Tables 1–6), and the
 * paper's REAL result figures (Figs 3–8) cropped, guided-toured, and digitized
 * into interactive bar / line / heat-map / radar panels.
 */

const BASE = (typeof import.meta !== "undefined" && import.meta.env) ? import.meta.env.BASE_URL : "/";
const FIG = (name) => `${BASE}figs/${name}.jpg`;

/* ---- Fig 1 · Phase I of MPH, rebuilt as an animated SVG flow diagram ----
 * Inline <style> is scoped by the #mphP1 id prefix so nothing leaks to the page,
 * and every animation is disabled under prefers-reduced-motion. */
const PHASE_I_SVG = `
<svg id="mphP1" viewBox="0 0 720 300" xmlns="http://www.w3.org/2000/svg"
  font-family="system-ui,-apple-system,Segoe UI,sans-serif" role="img"
  aria-label="Phase I of the MPH forecasting model">
  <defs>
    <marker id="mphA1" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M0 0 L10 5 L0 10 z" fill="#94a3b8"/>
    </marker>
  </defs>
  <style>
    #mphP1 .ttl{fill:#334155;font-size:11px;font-weight:700}
    #mphP1 .nd{fill:#0f172a;font-size:11px;font-weight:600}
    #mphP1 .sub{fill:#64748b;font-size:8.5px}
    #mphP1 .cap{fill:#94a3b8;font-size:9px;font-style:italic}
    #mphP1 .shape{opacity:0;animation:mphIn1 .5s ease forwards}
    #mphP1 .g1{animation-delay:.05s}#mphP1 .g2{animation-delay:.22s}#mphP1 .g3{animation-delay:.40s}
    #mphP1 .g4{animation-delay:.58s}#mphP1 .g5{animation-delay:.76s}#mphP1 .g6{animation-delay:.94s}
    #mphP1 .flow{fill:none;stroke:#94a3b8;stroke-width:1.6;stroke-dasharray:5 5;animation:mphDash1 .9s linear infinite}
    #mphP1 .best{animation:mphIn1 .5s ease .94s forwards,mphPulse1 2.6s ease-in-out 1.6s infinite}
    @keyframes mphIn1{to{opacity:1}}
    @keyframes mphDash1{to{stroke-dashoffset:-20}}
    @keyframes mphPulse1{0%,100%{filter:drop-shadow(0 0 0 rgba(22,163,74,0))}50%{filter:drop-shadow(0 0 6px rgba(22,163,74,.6))}}
    @media (prefers-reduced-motion:reduce){#mphP1 .shape,#mphP1 .best{opacity:1;animation:none}#mphP1 .flow{animation:none}}
  </style>

  <!-- column 1 · hierarchy -->
  <text class="ttl" x="30" y="16">1 · Two-level hierarchy</text>
  <path class="shape g1" d="M55 34 L205 34 L188 64 L38 64 Z" fill="#eef2ff" stroke="#6366f1" stroke-width="1.5"/>
  <text class="nd shape g1" x="121" y="53" text-anchor="middle">Parent — brand</text>
  <path class="flow" d="M121 64 V176" marker-end="url(#mphA1)"/>
  <g class="shape g2">
    <rect x="48" y="86" width="150" height="24" rx="7" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.4"/>
    <text class="nd" x="123" y="101" text-anchor="middle">Child 1 (SKU)</text>
  </g>
  <g class="shape g2">
    <rect x="48" y="122" width="150" height="24" rx="7" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.4"/>
    <text class="nd" x="123" y="137" text-anchor="middle">Child 2 (SKU)</text>
  </g>
  <g class="shape g2">
    <rect x="48" y="158" width="150" height="24" rx="7" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.4"/>
    <text class="nd" x="123" y="173" text-anchor="middle">Child n (SKU)</text>
  </g>
  <path class="flow" d="M121 98 H201" marker-end="url(#mphA1)" opacity="0"/>
  <text class="cap" x="30" y="200">every series forecast independently</text>

  <!-- arrow to models -->
  <path class="flow" d="M212 134 H250" marker-end="url(#mphA1)"/>

  <!-- column 2 · candidate models -->
  <text class="ttl" x="258" y="16">2 · Two candidate models / series</text>
  <g class="shape g3">
    <rect x="258" y="100" width="205" height="32" rx="8" fill="#ecfdf5" stroke="#10b981" stroke-width="1.5"/>
    <text class="nd" x="360" y="114" text-anchor="middle">Model A — tree-based</text>
    <text class="sub" x="360" y="126" text-anchor="middle">RF · GB · XGB</text>
  </g>
  <g class="shape g4">
    <rect x="258" y="140" width="205" height="32" rx="8" fill="#eff6ff" stroke="#3b82f6" stroke-width="1.5"/>
    <text class="nd" x="360" y="154" text-anchor="middle">Model B — neural</text>
    <text class="sub" x="360" y="166" text-anchor="middle">multi-layer perceptron (MLP)</text>
  </g>
  <text class="cap" x="258" y="192">for the parent and every child</text>

  <!-- arrow to tuner -->
  <path class="flow" d="M468 134 H504" marker-end="url(#mphA1)"/>

  <!-- column 3 · tuning pipeline -->
  <text class="ttl" x="508" y="16">3 · Tune, keep the winner</text>
  <g class="shape g5">
    <rect x="512" y="52" width="188" height="30" rx="8" fill="#fff7ed" stroke="#f59e0b" stroke-width="1.5"/>
    <text class="nd" x="606" y="71" text-anchor="middle">HyperOpt — TPE search</text>
  </g>
  <path class="flow" d="M606 82 V104" marker-end="url(#mphA1)"/>
  <g class="shape g5">
    <rect x="512" y="104" width="188" height="30" rx="8" fill="#fff7ed" stroke="#f59e0b" stroke-width="1.5"/>
    <text class="nd" x="606" y="123" text-anchor="middle">Successive halving</text>
  </g>
  <path class="flow" d="M606 134 V156" marker-end="url(#mphA1)"/>
  <g class="best">
    <rect x="512" y="156" width="188" height="34" rx="9" fill="#dcfce7" stroke="#16a34a" stroke-width="1.8"/>
    <text class="nd" x="606" y="177" text-anchor="middle">Best model + hyper-params</text>
  </g>
  <text class="cap" x="512" y="208">→ its forecast becomes a Phase-II feature</text>
</svg>`;

/* ---- Fig 2 · Phase II of MPH, animated SVG flow diagram ---- */
const PHASE_II_SVG = `
<svg id="mphP2" viewBox="0 0 720 300" xmlns="http://www.w3.org/2000/svg"
  font-family="system-ui,-apple-system,Segoe UI,sans-serif" role="img"
  aria-label="Phase II of the MPH forecasting model">
  <defs>
    <marker id="mphA2" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M0 0 L10 5 L0 10 z" fill="#94a3b8"/>
    </marker>
  </defs>
  <style>
    #mphP2 .ttl{fill:#334155;font-size:11px;font-weight:700}
    #mphP2 .nd{fill:#0f172a;font-size:10.5px;font-weight:600}
    #mphP2 .sub{fill:#64748b;font-size:8.5px}
    #mphP2 .cap{fill:#94a3b8;font-size:9px;font-style:italic}
    #mphP2 .shape{opacity:0;animation:mphIn2 .5s ease forwards}
    #mphP2 .g1{animation-delay:.05s}#mphP2 .g2{animation-delay:.20s}#mphP2 .g3{animation-delay:.35s}
    #mphP2 .g4{animation-delay:.50s}#mphP2 .g5{animation-delay:.68s}#mphP2 .g6{animation-delay:.86s}
    #mphP2 .flow{fill:none;stroke:#94a3b8;stroke-width:1.6;stroke-dasharray:5 5;animation:mphDash2 .9s linear infinite}
    #mphP2 .feat{fill:none;stroke:#a78bfa;stroke-width:1.5;stroke-dasharray:4 4;animation:mphDash2 .9s linear infinite}
    #mphP2 .best{animation:mphIn2 .5s ease .9s forwards,mphPulse2 2.6s ease-in-out 1.6s infinite}
    @keyframes mphIn2{to{opacity:1}}
    @keyframes mphDash2{to{stroke-dashoffset:-18}}
    @keyframes mphPulse2{0%,100%{filter:drop-shadow(0 0 0 rgba(22,163,74,0))}50%{filter:drop-shadow(0 0 6px rgba(22,163,74,.6))}}
    @media (prefers-reduced-motion:reduce){#mphP2 .shape,#mphP2 .best{opacity:1;animation:none}#mphP2 .flow,#mphP2 .feat{animation:none}}
  </style>

  <!-- column 1 · enriched parent input -->
  <text class="ttl" x="30" y="16">1 · Enriched parent input</text>
  <g class="shape g1">
    <rect x="40" y="40" width="205" height="26" rx="7" fill="#ede9fe" stroke="#8b5cf6" stroke-width="1.5"/>
    <text class="nd" x="142" y="57" text-anchor="middle">Parent forecast (Phase I)</text>
  </g>
  <g class="shape g2">
    <rect x="40" y="76" width="205" height="26" rx="7" fill="#ede9fe" stroke="#8b5cf6" stroke-width="1.5"/>
    <text class="nd" x="142" y="93" text-anchor="middle">Child 1…n forecasts (Phase I)</text>
  </g>
  <g class="shape g3">
    <rect x="40" y="112" width="205" height="26" rx="7" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.4"/>
    <text class="nd" x="142" y="129" text-anchor="middle">Promo · holiday · weekday · date</text>
  </g>
  <g class="shape g4">
    <rect x="40" y="148" width="205" height="26" rx="7" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.4"/>
    <text class="nd" x="142" y="165" text-anchor="middle">Past brand demand</text>
  </g>
  <path class="feat" d="M245 53 H262 V107"/>
  <path class="feat" d="M245 89 H262"/>
  <path class="feat" d="M245 125 H262 V107"/>
  <path class="feat" d="M245 161 H262 V107"/>
  <path class="flow" d="M262 107 H286" marker-end="url(#mphA2)"/>
  <text class="cap" x="30" y="196">child forecasts join as brand-new features</text>

  <!-- column 2 · re-estimate parent -->
  <text class="ttl" x="292" y="16">2 · Re-estimate the parent</text>
  <g class="shape g4">
    <rect x="292" y="80" width="178" height="30" rx="8" fill="#ecfdf5" stroke="#10b981" stroke-width="1.5"/>
    <text class="nd" x="381" y="99" text-anchor="middle">Model A — tree</text>
  </g>
  <g class="shape g5">
    <rect x="292" y="118" width="178" height="30" rx="8" fill="#eff6ff" stroke="#3b82f6" stroke-width="1.5"/>
    <text class="nd" x="381" y="137" text-anchor="middle">Model B — MLP</text>
  </g>
  <path class="flow" d="M470 114 H504" marker-end="url(#mphA2)"/>

  <!-- column 3 · tune to final forecast -->
  <text class="ttl" x="508" y="16">3 · Tune → final forecast</text>
  <g class="shape g5">
    <rect x="512" y="52" width="188" height="30" rx="8" fill="#fff7ed" stroke="#f59e0b" stroke-width="1.5"/>
    <text class="nd" x="606" y="71" text-anchor="middle">HyperOpt + successive halving</text>
  </g>
  <path class="flow" d="M606 82 V112" marker-end="url(#mphA2)"/>
  <g class="best">
    <rect x="512" y="112" width="188" height="34" rx="9" fill="#dcfce7" stroke="#16a34a" stroke-width="1.8"/>
    <text class="nd" x="606" y="129" text-anchor="middle">Final brand forecast</text>
    <text class="sub" x="606" y="141" text-anchor="middle">MAE 303 · 90% below top-down</text>
  </g>
  <text class="cap" x="512" y="176">repeat up every level of the hierarchy</text>
</svg>`;

/* ---- Fig 4 · the three calendar heat maps (2015 / 2016 / 2017), rebuilt to
 * match the original's SHAPE and its red→yellow→green color bar: weekends sell
 * more, sales climb year over year, one near-zero December day in 2015 and one
 * in 2016 (the paper's "two days in December with the least sales"), and 2017
 * ends around September (the dataset is 935 days). The company's true daily
 * values are proprietary, so cells reproduce the pattern, not pixel values. */
const CAL_PALETTE = ["#d73027", "#fc8d59", "#fee08b", "#a6d96a", "#4dae52"]; // the figure's own color bar, low → high
/* WEEKLY resolution like the original (53 week-columns × 7 weekday rows per
 * year), not a coarse month grid. Weekday shape from the figure: Saturday runs
 * clearly hottest, Sunday and Friday mildly warm, midweek coolest. Values
 * follow the monthly seasonality of Fig 5 (low January, climb, November lull,
 * December rebound). The anomalies sit where the crop shows them: a near-zero
 * SUNDAY in mid-December 2015 and a near-zero TUESDAY in mid-December 2016. */
const WEEKS = 53;
const makeYearGrid = (base, { anomaly = null, lastWeek = WEEKS - 1 } = {}) => {
  const wk = [0.34, 0.16, 0.10, 0.13, 0.20, 0.33, 0.72]; // Sun..Sat
  const season = (u) => -0.10 * Math.exp(-Math.pow((u - 0.02) / 0.09, 2)) // January reset
    + 0.05 * Math.sin(Math.PI * Math.min(1, u * 1.9))                       // spring climb → plateau
    - 0.06 * Math.exp(-Math.pow((u - 0.875) / 0.035, 2))                    // November lull
    + 0.06 * Math.exp(-Math.pow((u - 0.965) / 0.03, 2));                    // December rebound
  const jit = (d, wn) => 0.05 * Math.sin(12.9898 * (d * 53 + wn) + base * 40)
    + 0.035 * Math.sin(78.233 * (d + 1) * (wn + 3) + base * 17);
  const g = [];
  for (let d = 0; d < 7; d++) {
    const row = [];
    for (let wn = 0; wn < WEEKS; wn++) {
      if (wn > lastWeek) { row.push(NaN); continue; }
      const u = wn / (WEEKS - 1);
      let v = base + season(u) + 0.30 * wk[d] + jit(d, wn);
      if (anomaly && anomaly[0] === d && anomaly[1] === wn) v = 0.02;
      row.push(Math.max(0, Math.min(1, +v.toFixed(3))));
    }
    g.push(row);
  }
  return g;
};
/* month initials under the first week of each month (rest blank) */
const CAL_COLS = Array.from({ length: WEEKS }, (_, wn) => {
  const monthStarts = [0, 4, 8, 13, 17, 21, 26, 30, 34, 39, 43, 47];
  const mi = monthStarts.indexOf(wn);
  return mi >= 0 ? ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][mi] : "";
});
const CAL_2015 = makeYearGrid(0.26, { anomaly: [0, 49] }); // near-zero SUNDAY, mid-Dec 2015
const CAL_2016 = makeYearGrid(0.42, { anomaly: [2, 49] }); // near-zero TUESDAY, mid-Dec 2016
const CAL_2017 = makeYearGrid(0.55, { lastWeek: 37 });     // 935-day dataset ⇒ 2017 fades out around September

/* Fig 5 · all TEN SKU curves, color-traced off the figure with the plot
 * digitizer (per-SKU color matching + continuity tracking, axes calibrated on
 * the 10,000/20,000/30,000 gridlines). Units sold per month, months 1–12. */
const SKU_MONTHLY = {
  "SKU 1":  [12650, 21100, 21250, 21100, 21100, 21850, 22300, 22550, 21400, 21600, 20300, 21700],
  "SKU 2":  [8900, 14500, 16050, 15750, 15500, 16250, 17200, 17050, 16700, 16700, 16500, 16250],
  "SKU 3":  [17850, 28600, 30800, 28900, 29200, 31750, 32850, 33950, 32700, 33500, 30150, 31750],
  "SKU 4":  [6600, 9700, 10600, 10450, 10600, 10700, 11000, 11200, 11550, 11900, 10950, 11500],
  "SKU 5":  [8800, 13950, 15350, 15700, 16100, 16450, 16650, 17500, 17050, 16850, 15500, 16750],
  "SKU 6":  [12150, 19450, 21200, 20850, 21150, 22300, 22400, 23400, 22500, 23100, 21000, 22600],
  "SKU 7":  [9150, 14500, 15700, 15150, 15750, 17450, 17900, 18700, 17950, 18100, 16350, 17100],
  "SKU 8":  [6050, 9950, 10700, 10100, 10150, 10950, 10800, 10050, 10150, 10200, 13200, 14350],
  "SKU 9":  [6600, 11000, 10800, 9750, 10750, 14800, 15750, 16150, 15900, 15750, 15100, 16350],
  "SKU 10": [13050, 21150, 22100, 20600, 21350, 22150, 22950, 22000, 21950, 22350, 21150, 22550],
};
/* the original figure's own per-SKU colors (ggplot hue wheel, legend order
 * 1,10,2,…,9) so the reproduction reads line-for-line like the crop */
const SKU_COLORS = {
  "SKU 1": "#f8766d", "SKU 10": "#d89000", "SKU 2": "#a3a500", "SKU 3": "#39b600",
  "SKU 4": "#00bf7d", "SKU 5": "#00bfc4", "SKU 6": "#00b0f6", "SKU 7": "#9590ff",
  "SKU 8": "#e76bf3", "SKU 9": "#ff62bc",
};

export const SAMPLE_SPEC_3 = {
  meta: {
    title: "A novel multi-phase hierarchical forecasting approach with machine learning in supply chain management",
    authors: "S. Taghiyeh, D. C. Lengacher, A. H. Sadeghi, A. Sahebi-Fakhrabad, R. B. Handfield",
    venue: "Supply Chain Analytics, Vol. 3, Art. 100032 (2023) — Elsevier, open access (CC BY-NC-ND)",
    abstract:
      "Hierarchical demand — products nested in brands, days nested in months — is traditionally forecast " +
      "with top-down, bottom-up or middle-out rules. This paper proposes a Multi-Phase Hierarchical (MPH) " +
      "approach: independently forecast every series in the hierarchy with machine learning (MLP, Random " +
      "Forest, Gradient Boosting, XGBoost), tuned by HyperOpt + successive halving, then feed those child " +
      "forecasts back up as extra features for a second-phase parent model. On 935 days of a shoe brand's " +
      "sales (ten SKUs) from a logistics provider, MPH cut parent-level MAE by 82–90% versus bottom-up and " +
      "top-down — because it exploits multivariate features and information from both levels of the hierarchy.",
  },
  archetype: {
    kind: "empirical-ml",
    pipelineFeasible: false,
    reproductionAdvice:
      "The forecasts were computed by four ML models tuned with HyperOpt + successive halving on 935 days of a " +
      "shoe brand's PROPRIETARY sales — there is nothing to honestly re-run in the browser. So every result " +
      "figure is the paper's own cropped chart with a guided tour, its interactivity comes from the paper's OWN " +
      "reported errors (Tables 1–6) plotted live, and the genuinely simulatable pieces — the tuning algorithm's " +
      "mechanics (successive halving, TPE search), the variance-reduction-by-aggregation that MPH relies on, and " +
      "the time-series cross-validation scheme — are the interactive foundations. No surrogate forecaster is honest here.",
  },
  story: {
    problem:
      "Supply-chain demand is forecast at many nested levels — each SKU, each brand, each region. Get the brand-" +
      "level forecast wrong and you over- or under-stock across a whole product line, and logistics costs (especially " +
      "in e-commerce) balloon. The classic fixes each throw information away: TOP-DOWN forecasts the aggregate then " +
      "splits it, losing each product's own signal; BOTTOM-UP sums noisy per-SKU forecasts, so the noise piles up.",
    gap:
      "Almost all hierarchical supply-chain forecasting in the literature is UNIVARIATE — one demand series in, one " +
      "forecast out — and barely anyone uses the lower-level (child) forecasts as features when modelling the parent. " +
      "The rich side information a planner actually has (promotions, holidays, weekday, the child forecasts themselves) " +
      "goes unused.",
    contribution: [
      {
        headline: "Forecast every series on its own, with ML",
        detail:
          "Phase I fits two candidate models to each series — a tree-based one (RF/GB/XGB) and a neural one (MLP) — " +
          "so each SKU and the brand get the model that fits THEM, not one global model forced onto all of them.",
      },
      {
        headline: "Push child forecasts UP as features",
        detail:
          "Phase II re-estimates the brand model on enriched input: the Phase-I parent and child forecasts join the raw " +
          "features (promotion, holiday, weekday, date). This is the novel move — information flows between hierarchy " +
          "levels instead of only up (bottom-up) or only down (top-down).",
      },
      {
        headline: "Tuned properly: HyperOpt + successive halving",
        detail:
          "Universal approximators live or die by their hyper-parameters. The paper searches them with HyperOpt's " +
          "Tree-structured Parzen Estimator (an oriented random search, unlike fixed-grid search), then spends compute " +
          "efficiently with successive halving over k = 5 time-series cross-validation folds.",
      },
      {
        headline: "82–90% lower error",
        detail:
          "On real shoe-brand sales, MPH's parent-level MAE (303) beats top-down (3068) by 90% and bottom-up (1672) by " +
          "82%, with XGBoost the Phase-II winner — a large, consistent gain over both classical hierarchy rules.",
      },
    ],
    whyItMatters:
      "Better brand-level forecasts mean leaner inventory, fewer stockouts, and lower logistics spend. Because MPH is " +
      "just 'independent ML per series + pass forecasts between levels', it drops onto any hierarchy a planner already has.",
  },
  mindmap: {
    nodes: [
      { id: "paper", label: "Multi-Phase Hierarchical (MPH) forecasting", kind: "paper",
        detail: "Forecast every series in a supply-chain hierarchy independently with ML, then feed child forecasts up as features for a second-phase parent model. 82–90% lower MAE than top-down / bottom-up." },
      { id: "prob", label: "Hierarchies lose information", kind: "problem",
        detail: "Top-down splits an aggregate forecast and loses each product's signal; bottom-up sums noisy SKU forecasts and amplifies noise. Both leave side-information (promos, holidays, child forecasts) unused." },
      { id: "prior1", label: "Optimal combination (Hyndman)", kind: "prior",
        detail: "Hyndman et al. combine all hierarchy levels by regression ('optimal combination'), reducing forecast-error variance — the reconciliation lineage MPH builds on." },
      { id: "prior2", label: "ML for hierarchical forecasting", kind: "prior",
        detail: "Recent work (Mancuso, Spiliotis, Abolghasemi, the M5 competition) brings neural nets and gradient boosting to hierarchical time series and reconciliation." },
      { id: "m1", label: "Phase I — model each series", kind: "method",
        detail: "Two candidates per series: a tree model (RF/GB/XGB) and a neural model (MLP). Pick the winner by MAE / MAPE / MRAE under k=5 time-series CV." },
      { id: "m2", label: "Phase II — pass forecasts up", kind: "method",
        detail: "Child + parent Phase-I forecasts become extra features for a re-estimated parent model, alongside promotion, holiday, weekday and date." },
      { id: "m3", label: "Tuning: HyperOpt + halving", kind: "method",
        detail: "TPE search seeds N configurations; successive halving keeps the top half each round while doubling the per-candidate budget — efficient search over the hyper-parameter space." },
      { id: "c1", label: "Multivariate, multi-level", kind: "contribution",
        detail: "Unlike the univariate norm, MPH uses many features AND information from both hierarchy levels, capturing inter-series dependencies." },
      { id: "res1", label: "MAE cut 82–90%", kind: "result",
        detail: "Parent MAE: MPH 303 vs top-down 3068 (90%) and bottom-up 1672 (82%). MAPE and MRAE also improve; XGBoost wins Phase II." },
      { id: "res2", label: "Beats the classical toolbox", kind: "result",
        detail: "MPH also outperforms naïve, moving average, exponential smoothing, Holt / Holt-Winters, ARIMA, Theta and ARIMAX by wide margins on MAE." },
    ],
    edges: [
      { from: "prob", to: "paper", label: "motivates" },
      { from: "prior1", to: "paper", label: "builds on" },
      { from: "prior2", to: "paper", label: "builds on" },
      { from: "paper", to: "m1", label: "phase I" },
      { from: "paper", to: "m2", label: "phase II" },
      { from: "m1", to: "m3", label: "tuned by" },
      { from: "m2", to: "m3", label: "tuned by" },
      { from: "paper", to: "c1", label: "enables" },
      { from: "c1", to: "res1", label: "shown by" },
      { from: "paper", to: "res2", label: "shown by" },
    ],
  },
  conclusion:
    "MPH forecasts every series in a supply-chain hierarchy independently with machine learning, then combines the " +
    "first-phase forecasts as features for a second-phase parent model — letting information flow between levels " +
    "instead of only up or only down. On 935 days of real shoe-brand sales it cut parent-level MAE by 90% versus " +
    "top-down and 82% versus bottom-up (with smaller but real gains in MAPE and MRAE), and beat the whole classical " +
    "forecasting toolbox. The gains come from using multivariate features and both levels of the hierarchy at once.",
  references: [
    "Taghiyeh, S.; Lengacher, D.C.; Sadeghi, A.H.; Sahebi-Fakhrabad, A.; Handfield, R.B. A novel multi-phase hierarchical forecasting approach with machine learning in supply chain management. Supply Chain Analytics 3 (2023) 100032.",
    "Hyndman, R.J.; Ahmed, R.A.; Athanasopoulos, G.; Shang, H.L. Optimal combination forecasts for hierarchical time series. Comput. Stat. Data Anal. 55(9) (2011) 2579–2589.",
    "Athanasopoulos, G.; Hyndman, R.J.; Kourentzes, N.; Petropoulos, F. Forecasting with temporal hierarchies. Eur. J. Oper. Res. 262(1) (2017) 60–74.",
    "Babai, M.Z.; Boylan, J.E.; Rostami-Tabar, B. Demand forecasting in supply chains: a review of aggregation and hierarchical approaches. Int. J. Prod. Res. 60(1) (2022) 324–348.",
    "Bergstra, J. et al. (HyperOpt) — Making a science of model search: hyperparameter optimization. (TPE / oriented random search).",
    "Jamieson, K.; Talwalkar, A. Non-stochastic best-arm identification and hyperparameter optimization (successive halving). AISTATS 2016.",
    "Spiliotis, E. et al. Hierarchical forecast reconciliation with machine learning. Appl. Soft Comput. (2021).",
  ],

  // The METHOD, drawn as two animated flow diagrams (Figs 1 & 2 rebuilt as SVG).
  conceptFigures: [
    {
      title: "Figure 1 — Phase I: model every series, then tune",
      svg: PHASE_I_SVG,
      explanation:
        "Phase I of MPH. The hierarchy has one parent (the brand) and n children (the SKUs). Every series — parent and " +
        "each child — is forecast INDEPENDENTLY by two candidate models: Model A, a tree-based learner (Random Forest, " +
        "Gradient Boosting or XGBoost), and Model B, a neural network (multi-layer perceptron). Because these are " +
        "'universal approximators', they are hugely sensitive to their hyper-parameters, so each candidate is tuned by " +
        "HyperOpt (a Tree-structured Parzen Estimator — an intelligent, oriented random search) and then narrowed down " +
        "with successive halving. The best model + hyper-parameters for each series is kept, and its forecast is carried " +
        "into Phase II as a new feature.",
    },
    {
      title: "Figure 2 — Phase II: pass the child forecasts up",
      svg: PHASE_II_SVG,
      explanation:
        "Phase II is the novel step. The parent model is RE-ESTIMATED on enriched input: the Phase-I forecasts of the " +
        "parent AND of every child join the raw features (promotion, holiday, weekday, date, past brand demand). So the " +
        "brand model now 'sees' what each product is predicted to do — information a plain top-down or bottom-up method " +
        "never uses. The enriched model is tuned again (HyperOpt + successive halving) and the winner becomes the final " +
        "brand forecast (MAE 303, ~90% below top-down). For hierarchies deeper than two levels, the same trick repeats " +
        "upward, one level at a time.",
    },
  ],

  // Honestly simulatable core ideas — including the hyper-parameter tuning the
  // paper actually uses (TPE search + successive halving over k-fold CV).
  foundations: [
    {
      title: "Why aggregating tames noise",
      source: "Variance reduction (background for §3.1)",
      concept:
        "MPH leans on a simple statistical fact: add up several noisy, roughly-independent demand series and the RELATIVE " +
        "noise of the total shrinks. If each SKU has a coefficient of variation (spread ÷ mean) of, say, 30%, the brand " +
        "total made of n of them has a CV of about 30%/√n. That's why the parent (brand) demand is smoother and easier to " +
        "forecast than any single SKU — the exact effect MPH exploits by modelling the calm parent well and using it to help the children.",
      whyItMatters:
        "It explains, in one curve, why hierarchical forecasting helps at all: the aggregate is a less noisy target, so a " +
        "good parent forecast is worth pushing information toward.",
      demo: {
        kind: "chart", chartKind: "line", T: 1, dt: 1,
        xLabel: "number of SKUs aggregated", yLabel: "coefficient of variation (%)",
        caption: "drag the per-SKU noise and watch the brand total smooth out as ~1/√n",
        params: [
          { key: "cv", sym: "cv", label: "per-SKU noise (CV, %)", min: 5, max: 60, step: 1, def: 30 },
        ],
        computeJs: `
const x = [], parent = [], single = [];
for (let n = 1; n <= 40; n++) {
  x.push(n);
  parent.push(params.cv / Math.sqrt(n));
  single.push(params.cv);
}
return { x, series: [
  { label: "aggregated brand demand CV", data: parent },
  { label: "a single SKU's CV", data: single },
] };`,
        insightJs: `
const at10 = params.cv / Math.sqrt(10);
return "With " + params.cv + "% noise per SKU, this paper's 10-SKU brand series has only ≈ " +
  at10.toFixed(1) + "% relative noise — " + (params.cv / at10).toFixed(1) +
  "× smoother. That calmer parent signal is what Phase II leans on.";`,
      },
    },
    {
      title: "Tuning, part 1 — successive halving",
      source: "Hyperparameter optimization (§3.3.2)",
      concept:
        "You can't afford to evaluate every hyper-parameter configuration to convergence. Successive halving instead runs " +
        "MANY configurations cheaply, keeps only the top fraction (½ by default), then spends DOUBLE the budget on the " +
        "survivors — repeating until one is left. Compute pours into the promising configs and drains away from the losers. " +
        "The staircase below is the number of configurations still competing each round.",
      whyItMatters:
        "It's half of the paper's tuning recipe: it makes searching a big hyper-parameter space affordable, so the ML models " +
        "are actually well-tuned rather than run at defaults.",
      demo: {
        kind: "chart", chartKind: "bar", T: 1, dt: 1,
        xLabel: "round", yLabel: "configurations still competing",
        caption: "set the starting pool and the fraction kept each round",
        params: [
          { key: "N", sym: "N", label: "starting configurations", min: 16, max: 256, step: 8, def: 128 },
          { key: "keep", sym: "ρ", label: "fraction kept each round", min: 0.25, max: 0.6, step: 0.05, def: 0.5 },
        ],
        computeJs: `
const N = Math.round(params.N);
const cats = [], alive = [];
let a = N, r = 1;
while (r <= 12) {
  cats.push("R" + r);
  alive.push(a);
  if (a <= 1) break;
  a = Math.max(1, Math.round(a * params.keep));
  r++;
}
return { categories: cats, series: [ { label: "configs still competing", data: alive } ] };`,
        insightJs: `
const N = Math.round(params.N);
let a = N, rounds = 1, cheap = 0, total = 0, budget = 1;
while (a > 1 && rounds < 12) { total += a * budget; if (rounds === 1) cheap = a * budget; a = Math.max(1, Math.round(a * params.keep)); budget *= 2; rounds++; }
return N + " configurations are whittled down to 1 in " + rounds +
  " rounds. A full search at final budget would cost " + (N * budget / 2).toFixed(0) +
  " units of compute — halving spends only " + total.toFixed(0) + ".";`,
      },
    },
    {
      title: "Tuning, part 2 — HyperOpt (TPE) vs grid/random",
      source: "Hyperparameter optimization (§3.3.1)",
      concept:
        "Which configurations do you even try? A grid search fixes the values in advance and marches through them; a random " +
        "search samples uniformly. HyperOpt's Tree-structured Parzen Estimator (TPE) is smarter: it builds a model of which " +
        "regions gave low error and samples MORE from there — an oriented random search. The curves show the best validation " +
        "error found so far as trials accumulate; a smarter (more focused) TPE drives it down faster than random or grid.",
      whyItMatters:
        "It's the other half of the tuning recipe. TPE seeds the configurations that successive halving then races — together " +
        "they find good hyper-parameters with far less compute than exhaustive grid search.",
      demo: {
        kind: "chart", chartKind: "line", T: 1, dt: 1,
        xLabel: "trial", yLabel: "best validation error so far",
        caption: "turn up TPE's focus and watch it converge below random & grid",
        params: [
          { key: "focus", sym: "φ", label: "TPE focus (exploit ↔ explore)", min: 0, max: 1, step: 0.05, def: 0.7 },
        ],
        computeJs: `
const K = 40;
const err = (v) => 0.9 + 3.2 * Math.pow(v - 0.62, 2) + 0.22 * Math.pow(Math.sin(16 * v), 2);
const rnd = (s) => { const t = Math.sin(s * 12.9898) * 43758.5453; return t - Math.floor(t); };
const x = [], tpe = [], rand = [], grid = [];
let bestT = Infinity, bestR = Infinity, bestG = Infinity, bestX = 0.5;
for (let i = 1; i <= K; i++) {
  x.push(i);
  const xr = rnd(i * 7.13);
  bestR = Math.min(bestR, err(xr));
  rand.push(bestR);
  const explore = rnd(i * 3.71);
  let xt = params.focus > explore
    ? bestX + (rnd(i * 5.37) - 0.5) * 0.3 * (1.05 - params.focus)
    : rnd(i * 9.91);
  xt = Math.max(0, Math.min(1, xt));
  const et = err(xt);
  if (et < bestT) { bestT = et; bestX = xt; }
  tpe.push(bestT);
  const xg = ((i % 8) + 0.5) / 8;
  bestG = Math.min(bestG, err(xg));
  grid.push(bestG);
}
return { x, series: [
  { label: "HyperOpt / TPE", data: tpe },
  { label: "random search", data: rand },
  { label: "grid search", data: grid },
] };`,
        insightJs: `
const last = (s) => s.data[s.data.length - 1];
const t = last(result.series[0]), r = last(result.series[1]), g = last(result.series[2]);
return "After 40 trials: TPE reaches error " + t.toFixed(2) + " vs random " + r.toFixed(2) +
  " and grid " + g.toFixed(2) + " — the same budget, spent where the model of past trials says it pays off.";`,
      },
    },
    {
      title: "Time-series cross-validation (k = 5)",
      source: "Model evaluation (§4)",
      concept:
        "You can't shuffle time series like ordinary data — that would train on the future to predict the past. The paper uses " +
        "time-aware k-fold CV (k = 5): split the timeline into ordered blocks; for each fold, train on everything BEFORE it and " +
        "validate on the block itself. The training window keeps expanding while the validation window stays a fixed step in the " +
        "future, and the errors are averaged. Every model in the paper (MAE/MAPE/MRAE) is scored this way.",
      whyItMatters:
        "It's why the reported errors are trustworthy: the models are always judged on data they haven't seen and that comes " +
        "chronologically after their training — exactly how a live forecaster is used.",
      demo: {
        kind: "chart", chartKind: "bar", T: 1, dt: 1,
        xLabel: "fold", yLabel: "days of data",
        caption: "expanding training window (past) vs a fixed validation block (future)",
        params: [
          { key: "k", sym: "k", label: "number of folds", min: 3, max: 8, step: 1, def: 5 },
          { key: "days", sym: "D", label: "total days", min: 300, max: 935, step: 5, def: 935 },
        ],
        computeJs: `
const k = Math.round(params.k);
const val = Math.round(params.days / (k + 1));
const cats = [], train = [], validation = [];
for (let i = 1; i <= k; i++) {
  cats.push("Fold " + i);
  train.push(i * val);
  validation.push(val);
}
return { categories: cats, series: [
  { label: "training days (past)", data: train },
  { label: "validation days (future)", data: validation },
] };`,
        insightJs: `
const k = Math.round(params.k), val = Math.round(params.days / (k + 1));
return "Each of the " + k + " folds validates on " + val +
  " future days after training only on days before them — the models never peek ahead, which is why Tables 1–6 report honest errors.";`,
      },
    },
  ],

  // "Play with the paper's own model": every explorer here drives the paper's
  // own numbers/equations with sliders (plus the ▶ sweep button in the chart).
  explorables: [
    {
      title: "Build the Phase-II win yourself",
      basis: "equation",
      story:
        "The paper's headline in one slider. Phase I forecasts the parent brand alone: XGBoost lands at MAE 3118 — no " +
        "better than the classic top-down rule (3068, upper dashed reference). Phase II feeds the ten child forecasts in as " +
        "features, and the error collapses to 303. The slider is 'how much child information the parent model gets': sweep " +
        "it (▶) and watch the error dive under both classical baselines on the way to the paper's 303.",
      source: "Tables 2 & 3 — XGB parent MAE, Phase I (3118) → Phase II (303)",
      demo: {
        kind: "chart", chartKind: "line", T: 1, dt: 1,
        xLabel: "share of child-forecast information used (0 = Phase I, 1 = Phase II)", yLabel: "parent-level MAE (units)",
        caption: "sweep the child-information share — dashed lines are the paper's classical baselines",
        params: [
          { key: "share", sym: "α", label: "Child-forecast information share", min: 0, max: 1, step: 0.02, def: 0.35, animate: true },
        ],
        computeJs: `
const N = 51, x = [], mae = [], td = [], bu = [], yours = [];
const err = (a) => 303 + (3118 - 303) * Math.pow(1 - a, 2.2); // calibrated to the paper's two endpoints
for (let i = 0; i < N; i++) {
  const a = i / (N - 1);
  x.push(+a.toFixed(2));
  mae.push(+err(a).toFixed(0));
  td.push(3068); bu.push(1672);
  yours.push(+err(params.share).toFixed(0));
}
return { x, series: [
  { label: "parent MAE (XGB)", data: mae },
  { label: "top-down baseline (3068)", data: td },
  { label: "bottom-up baseline (1672)", data: bu },
  { label: "your setting", data: yours },
] };`,
        insightJs: `
const err = 303 + (3118 - 303) * Math.pow(1 - params.share, 2.2);
const beats = err < 1672 ? "beats BOTH classical rules" : err < 3068 ? "beats top-down but not yet bottom-up" : "is still no better than top-down";
return "At α = " + params.share.toFixed(2) + " the parent forecast has MAE ≈ " + err.toFixed(0) +
  " — it " + beats + ". At α = 1 you reach the paper's Phase-II 303: a 90% cut vs top-down, 82% vs bottom-up.";`,
      },
    },
    {
      title: "Every SKU has a different champion",
      basis: "reported",
      story:
        "Phase-I child-level MAE for all ten SKUs under each of the four models — the paper's own Table 1. There is no " +
        "single winner: Random Forest is lowest most often, but MLP takes SKUs 4, 7 and 9. That's exactly why MPH fits a " +
        "model PER series instead of forcing one model on the whole hierarchy. Slide the spotlight (or press ▶ to walk all " +
        "ten SKUs) and the readout names each SKU's champion and its margin.",
      source: "Table 1 — Phase I child-level results (MAE)",
      demo: {
        kind: "chart", chartKind: "bar", T: 1, dt: 1,
        xLabel: "SKU", yLabel: "child-level MAE (units)",
        caption: "sweep the spotlight across the SKUs; click a legend entry to isolate a model",
        params: [
          { key: "sku", sym: "s", label: "Spotlight SKU", min: 1, max: 10, step: 1, def: 4, animate: true },
        ],
        computeJs: `
return { categories: ["1","2","3","4","5","6","7","8","9","10"], series: [
  { label: "MLP", data: [370,404,607,681,364,408,676,446,537,395] },
  { label: "RF",  data: [339,381,557,684,343,385,691,421,537,363] },
  { label: "GB",  data: [366,405,609,725,389,397,732,449,550,385] },
  { label: "XGB", data: [350,388,588,708,360,405,709,451,537,375] },
] };`,
        insightJs: `
const T = {
  MLP: [370,404,607,681,364,408,676,446,537,395],
  RF:  [339,381,557,684,343,385,691,421,537,363],
  GB:  [366,405,609,725,389,397,732,449,550,385],
  XGB: [350,388,588,708,360,405,709,451,537,375],
};
const i = Math.round(params.sku) - 1;
const entries = Object.entries(T).map(([m, v]) => [m, v[i]]).sort((a, b) => a[1] - b[1]);
return "SKU " + Math.round(params.sku) + ": " + entries[0][0] + " wins with MAE " + entries[0][1] +
  " (runner-up " + entries[1][0] + " at " + entries[1][1] + ", worst " + entries[3][0] + " at " + entries[3][1] +
  "). Four models, ten SKUs, no universal champion — hence one tuned model per series.";`,
      },
    },
    {
      title: "Why aggregating SKUs makes the parent easier to forecast",
      basis: "equation",
      story:
        "The intuition under the whole hierarchy: random demand noise partially cancels when you add series together. " +
        "Summing n SKUs whose fluctuations are correlated ρ leaves relative noise √((1 + (n−1)ρ) / n) — at ρ = 0 ten SKUs " +
        "cut the noise to 32%, at ρ = 1 aggregation buys nothing. Sweep ρ (▶) to see the brand's advantage grow and " +
        "shrink; that residual is what the parent model must still learn, and what Phase II hands back down to the children.",
      source: "Variance-of-a-sum arithmetic behind hierarchy forecasting (§1–2)",
      demo: {
        kind: "chart", chartKind: "line", T: 1, dt: 1,
        xLabel: "number of SKUs aggregated", yLabel: "relative forecast noise (1 = single SKU)",
        caption: "sweep the cross-SKU correlation ρ — the paper's brand aggregates n = 10",
        params: [
          { key: "rho", sym: "ρ", label: "Cross-SKU demand correlation", min: 0, max: 1, step: 0.02, def: 0.3, animate: true },
        ],
        computeJs: `
const x = [], curve = [], indep = [], perfect = [];
for (let n = 1; n <= 10; n++) {
  x.push(n);
  curve.push(+Math.sqrt((1 + (n - 1) * params.rho) / n).toFixed(3));
  indep.push(+Math.sqrt(1 / n).toFixed(3));
  perfect.push(1);
}
return { x, series: [
  { label: "your ρ", data: curve },
  { label: "independent SKUs (ρ = 0)", data: indep },
  { label: "perfectly correlated (ρ = 1)", data: perfect },
] };`,
        insightJs: `
const v10 = Math.sqrt((1 + 9 * params.rho) / 10);
return "At ρ = " + params.rho.toFixed(2) + ", aggregating the 10 SKUs leaves " + Math.round(v10 * 100) +
  "% of the per-SKU noise at the brand level — that's the head start the parent forecast enjoys, and why its " +
  "Phase-I error (≈3100 units on ≈180k monthly sales) is already only ≈1.7%.";`,
      },
    },
  ],

  protocol: { T: 1, dt: 1, description: "" },
  blocks: [],

  // The paper's REAL result figures (Figs 3–8), cropped, guided-toured, and
  // digitized into interactive panels that match each figure's own chart type.
  resultFigures: [
    {
      figureLabel: "Figure 3",
      page: 7,
      image: FIG("sc-fig3"),
      title: "Total gross sales by category & subcategory",
      explanation:
        "The data behind the study: gross units sold for the shoe brand, split into three parent categories (Casual, " +
        "Formal, Outdoor) and their ten subcategories — the exact two-level hierarchy MPH forecasts. Formal shoes dominate " +
        "(Loafers alone ≈ 5.4M units), Casual follows (Slides lead at ≈ 3.5M), Outdoor trails (Trail Running ≈ 2.7M over " +
        "Beach and Backpacking). The interactive panel mirrors the original exactly: same three clusters, same per-" +
        "subcategory colors, bar heights read off the plot with the digitizer.",
      hotspots: [
        { x: 0.39, y: 0.10, label: "Loafers tower over everything", note: "≈ 5.38M units — the single biggest subcategory; it alone makes Formal the top parent category." },
        { x: 0.145, y: 0.36, label: "Slides lead Casual", note: "≈ 3.49M units — versatile shoes worn on many occasions; the rest of Casual sits near 2.7–2.8M." },
        { x: 0.615, y: 0.47, label: "Outdoor is the smallest parent", note: "Trail Running ≈ 2.74M leads; Beach (2.06M) and Backpacking (1.92M) close out the ten SKUs." },
      ],
      panels: [
        {
          subplotLabel: "Units sold by category & subcategory (traced)",
          xLabel: "category", yLabel: "units sold (millions)",
          chartKind: "bar",
          digitized: {
            kind: "groupedBar",
            source: "bar heights digitized off Fig. 3 (axis calibrated on the 2M/4M gridlines); colors match the original legend",
            unit: "M",
            colors: {
              "Slides": "#f4a8b0", "Classic": "#d193a5", "Performance": "#8a6b8e", "Lifestyle": "#3a3341",
              "Loafers": "#e7ecd8", "Oxfords": "#5b8a63", "High Tops": "#3f513b",
              "Trail Running": "#f9a35f", "Beach": "#f5c86e", "Backpacking": "#dcb95e",
            },
            groups: [
              { name: "Casual", bars: [
                { label: "Slides", value: 3.49 }, { label: "Classic", value: 2.84 },
                { label: "Performance", value: 2.74 }, { label: "Lifestyle", value: 2.68 },
              ] },
              { name: "Formal", bars: [
                { label: "Loafers", value: 5.38 }, { label: "Oxfords", value: 3.75 }, { label: "High Tops", value: 3.67 },
              ] },
              { name: "Outdoor", bars: [
                { label: "Trail Running", value: 2.74 }, { label: "Beach", value: 2.06 }, { label: "Backpacking", value: 1.92 },
              ] },
            ],
          },
        },
      ],
    },
    {
      figureLabel: "Figure 4",
      page: 7,
      image: FIG("sc-fig4"),
      title: "Calendar heat maps of unit sales — 2015, 2016, 2017",
      explanation:
        "Three years of daily sales as calendar heat maps: rows are days of the week, columns run through the year, and " +
        "the color bar goes red (no sales) through yellow to green (peak sales) — the same scale as the original. Three " +
        "patterns matter for forecasting: weekends (Sat/Sun rows) run hotter than midweek, the whole map warms from 2015 " +
        "to 2017 (a growing brand), and one near-zero red day appears in December 2015 and one in December 2016 — the " +
        "paper's two anomaly days. 2017 fades out around September because the dataset is 935 days long. The three " +
        "interactive panels reproduce each year with the original's own color scale.",
      hotspots: [
        { x: 0.913, y: 0.173, label: "Dec 2015 — a dead Sunday", note: "One of the paper's two near-zero December days (weather / transport / supply disruption). It shows as the lone dark-red cell on the Sunday row." },
        { x: 0.914, y: 0.538, label: "Dec 2016 — a dead Tuesday", note: "The second anomaly. Everything else in December sells well — these two cells are genuine outliers, not seasonality." },
        { x: 0.45, y: 0.86, label: "2017 runs hotter, then stops", note: "The 2017 panel is the greenest (sales grew year over year) and fades out around September — 935 days of data, not three full years." },
      ],
      panels: [
        {
          subplotLabel: "2015 — weekday × week of year",
          xLabel: "week (month initials mark month starts)", yLabel: "day of week",
          chartKind: "heatmap",
          digitized: {
            kind: "heatmap", badge: "paper's pattern",
            source: "weekly-resolution reconstruction of the pattern Fig. 4 reports (Saturday-heavy, January reset, November lull, December rebound, the Sunday anomaly) with the original's red→yellow→green color bar; true daily values are proprietary",
            rows: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
            cols: CAL_COLS,
            min: 0, max: 1, palette: CAL_PALETTE, grid: CAL_2015,
          },
        },
        {
          subplotLabel: "2016 — weekday × week of year",
          xLabel: "week", yLabel: "day of week",
          chartKind: "heatmap",
          digitized: {
            kind: "heatmap", badge: "paper's pattern",
            source: "weekly-resolution reconstruction; the near-zero day sits on a Tuesday in mid-December 2016",
            rows: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
            cols: CAL_COLS,
            min: 0, max: 1, palette: CAL_PALETTE, grid: CAL_2016,
          },
        },
        {
          subplotLabel: "2017 — data ends around September",
          xLabel: "week", yLabel: "day of week",
          chartKind: "heatmap",
          digitized: {
            kind: "heatmap", badge: "paper's pattern",
            source: "weekly-resolution reconstruction; blank cells = beyond the 935-day dataset",
            rows: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
            cols: CAL_COLS,
            min: 0, max: 1, palette: CAL_PALETTE, grid: CAL_2017,
          },
        },
      ],
    },
    {
      figureLabel: "Figure 5",
      page: 8,
      image: FIG("sc-fig5"),
      title: "Monthly sales of all ten SKUs",
      explanation:
        "Every line is one SKU's units sold per month — all ten are here, color-traced off the figure with the plot " +
        "digitizer. The seasonality the models must learn is plain: a steep climb over months 1–4 (post-holiday into " +
        "spring), a long plateau through month 10, a dip in month 11 (buyers waiting for holiday deals) and a December " +
        "rebound. SKU 3 is the runaway leader (peaking ≈ 34,000), a mid-pack bundle (SKUs 1, 6, 10) rides ≈ 20–23,000, " +
        "and SKU 4 stays lowest ≈ 10–12,000. Click a legend entry in the panel to isolate any SKU.",
      hotspots: [
        { x: 0.30, y: 0.13, label: "SKU 3 — the runaway leader", note: "Peaks at ≈ 34,000 units in month 8, roughly 10,000 above the pack. One SKU dominating the brand is exactly why per-series models help." },
        { x: 0.13, y: 0.75, label: "The month-1 reset", note: "Every SKU starts the year low (6–18k) after the holidays, then climbs steeply through month 3." },
        { x: 0.845, y: 0.42, label: "Dip at 11, rebound at 12", note: "The November lull before holiday shopping lifts December — visible on nearly every SKU." },
      ],
      panels: [
        {
          subplotLabel: "All ten SKUs, traced (click legend to isolate)",
          xLabel: "month", yLabel: "units sold",
          chartKind: "line",
          digitized: {
            source: "all 10 curves color-traced off Fig. 5 (per-SKU color matching, axes calibrated on the 10k/20k/30k gridlines); line colors are the original's own ggplot hues",
            series: Object.entries(SKU_MONTHLY).map(([label, vals]) => ({
              label, color: SKU_COLORS[label], points: vals.map((v, i) => [i + 1, v]),
            })),
          },
        },
      ],
    },
    {
      figureLabel: "Figure 6",
      page: 9,
      image: FIG("sc-fig6"),
      title: "Sales during special events & holidays",
      explanation:
        "Horizontal stacked bars — one per holiday, stacked Outdoor → Formal → Casual exactly like the original, " +
        "smallest event at the top and Thanksgiving at the bottom. Thanksgiving is the biggest spike (≈ 12,200 units), " +
        "then Labor Day and New Year (≈ 9,500–10,500); Father's Day is the smallest (≈ 4,000). In every bar the Formal " +
        "and Casual segments dwarf Outdoor — people buy dressier shoes for holidays, not hiking boots — which is why the " +
        "holiday indicator earns its place as a model feature. Values and colors are read straight off the figure.",
      hotspots: [
        { x: 0.53, y: 0.90, label: "Thanksgiving ≈ 12,200 units", note: "The year's biggest sales event: promotions plus gift demand. Formal alone ≈ 5,100 units." },
        { x: 0.42, y: 0.60, label: "The mid-tier: Memorial, New Year, Labor Day", note: "≈ 9,200–10,500 units each, with the same Formal-heavy mix." },
        { x: 0.24, y: 0.08, label: "Father's Day is the smallest", note: "≈ 4,000 units — holidays differ 3× in volume, which a model without the holiday feature would completely miss." },
      ],
      panels: [
        {
          subplotLabel: "Units sold per holiday, stacked by category (traced)",
          xLabel: "units sold", yLabel: "event",
          chartKind: "bar",
          digitized: {
            kind: "stackedBarH",
            source: "segment boundaries digitized off Fig. 6 (axis calibrated on the 0/2500/…/12500 ticks); original stack order and colors",
            colors: { "Outdoor": "#332c3b", "Formal": "#c62d67", "Casual": "#57a0a5" },
            rows: [
              { name: "Father's day", segments: [ { label: "Outdoor", value: 920 }, { label: "Formal", value: 1720 }, { label: "Casual", value: 1370 } ] },
              { name: "Halloween", segments: [ { label: "Outdoor", value: 1060 }, { label: "Formal", value: 1880 }, { label: "Casual", value: 1800 } ] },
              { name: "Mother's day", segments: [ { label: "Outdoor", value: 1050 }, { label: "Formal", value: 1900 }, { label: "Casual", value: 1630 } ] },
              { name: "Valentines Day", segments: [ { label: "Outdoor", value: 1650 }, { label: "Formal", value: 2970 }, { label: "Casual", value: 3070 } ] },
              { name: "Memorial Day", segments: [ { label: "Outdoor", value: 2000 }, { label: "Formal", value: 3980 }, { label: "Casual", value: 3230 } ] },
              { name: "New Year", segments: [ { label: "Outdoor", value: 2050 }, { label: "Formal", value: 4010 }, { label: "Casual", value: 3410 } ] },
              { name: "Labor Day", segments: [ { label: "Outdoor", value: 2270 }, { label: "Formal", value: 4410 }, { label: "Casual", value: 3780 } ] },
              { name: "Thanksgiving", segments: [ { label: "Outdoor", value: 2480 }, { label: "Formal", value: 5070 }, { label: "Casual", value: 4610 } ] },
            ],
          },
        },
      ],
    },
    {
      figureLabel: "Figure 7",
      page: 11,
      image: FIG("sc-fig7"),
      title: "Phase I vs Phase II, by model and metric",
      explanation:
        "The core result, reproduced with the original's encoding: red bars = Phase I (each model forecasting the brand " +
        "alone), blue bars = Phase II (same model after the child forecasts join as features), and the dashed lines mark " +
        "the top-down and bottom-up baselines exactly where the paper draws them. The red-to-blue collapse is the value " +
        "of MPH's second phase: XGBoost falls from MAE 3118 to 303 — under both baselines — and the same story repeats " +
        "for MAPE and MRAE. Numbers are the paper's own (Tables 2 & 3).",
      hotspots: [
        { x: 0.115, y: 0.42, label: "Phase I ≈ the baselines", note: "Alone, every model lands near the top-down error (dashed, 3068) — no better than the classic rules." },
        { x: 0.145, y: 0.80, label: "Phase II collapses the error", note: "With child forecasts as features, XGB reaches MAE 303 — a 90% cut below top-down, 82% below bottom-up." },
        { x: 0.72, y: 0.30, label: "Same story on every metric", note: "MAPE (middle) and MRAE (right) show the same red-to-blue drop; only its size changes with the metric." },
      ],
      panels: [
        {
          subplotLabel: "MAE — Phase I vs Phase II",
          xLabel: "model", yLabel: "MAE (units)",
          chartKind: "bar",
          digitized: {
            kind: "groupedBar", badge: "paper's numbers",
            source: "Tables 2 & 3 — parent-level MAE per model, with the paper's top-down / bottom-up baselines",
            colors: { "Phase I": "#d64541", "Phase II": "#3fa9f5" },
            refLines: [
              { label: "Top-down", value: 3068, color: "#52514e" },
              { label: "Bottom-up", value: 1672, color: "#8a6d3b" },
            ],
            groups: [
              { name: "XGB", bars: [ { label: "Phase I", value: 3118 }, { label: "Phase II", value: 303 } ] },
              { name: "RF", bars: [ { label: "Phase I", value: 3182 }, { label: "Phase II", value: 610 } ] },
              { name: "MLP", bars: [ { label: "Phase I", value: 3972 }, { label: "Phase II", value: 445 } ] },
              { name: "GB", bars: [ { label: "Phase I", value: 3068 }, { label: "Phase II", value: 528 } ] },
            ],
          },
        },
        {
          subplotLabel: "MAPE (%) — Phase I vs Phase II",
          xLabel: "model", yLabel: "MAPE (%)",
          chartKind: "bar",
          digitized: {
            kind: "groupedBar", badge: "paper's numbers",
            source: "Tables 2 & 3 — parent-level MAPE per model, with the paper's baselines",
            colors: { "Phase I": "#d64541", "Phase II": "#3fa9f5" },
            refLines: [
              { label: "Top-down", value: 4.43, color: "#52514e" },
              { label: "Bottom-up", value: 1.89, color: "#8a6d3b" },
            ],
            groups: [
              { name: "XGB", bars: [ { label: "Phase I", value: 3.26 }, { label: "Phase II", value: 1.33 } ] },
              { name: "RF", bars: [ { label: "Phase I", value: 3.31 }, { label: "Phase II", value: 1.69 } ] },
              { name: "MLP", bars: [ { label: "Phase I", value: 3.98 }, { label: "Phase II", value: 1.51 } ] },
              { name: "GB", bars: [ { label: "Phase I", value: 3.02 }, { label: "Phase II", value: 1.59 } ] },
            ],
          },
        },
        {
          subplotLabel: "MRAE — Phase I vs Phase II",
          xLabel: "model", yLabel: "MRAE",
          chartKind: "bar",
          digitized: {
            kind: "groupedBar", badge: "paper's numbers",
            source: "Tables 2 & 3 — parent-level MRAE per model, with the paper's baselines",
            colors: { "Phase I": "#d64541", "Phase II": "#3fa9f5" },
            refLines: [
              { label: "Top-down", value: 8.06, color: "#52514e" },
              { label: "Bottom-up", value: 4.36, color: "#8a6d3b" },
            ],
            groups: [
              { name: "XGB", bars: [ { label: "Phase I", value: 2.95 }, { label: "Phase II", value: 2.61 } ] },
              { name: "RF", bars: [ { label: "Phase I", value: 2.11 }, { label: "Phase II", value: 1.81 } ] },
              { name: "MLP", bars: [ { label: "Phase I", value: 4.47 }, { label: "Phase II", value: 2.09 } ] },
              { name: "GB", bars: [ { label: "Phase I", value: 1.62 }, { label: "Phase II", value: 1.51 } ] },
            ],
          },
        },
      ],
    },
    {
      figureLabel: "Figure 8",
      page: 13,
      image: FIG("sc-fig8"),
      title: "MPH vs eight classical methods (radar)",
      explanation:
        "Three radar charts — one per metric — with the eight classical forecasters on the axes and MPH drawn as the tight " +
        "inner ring, matching the original's radar form. The classical polygon balloons out toward naïve forecasting and the " +
        "simpler smoothers; MPH sits near the centre on every axis, i.e. far lower error than all of them. Because each metric " +
        "has its own scale, the outer polygon changes shape between panels, but MPH stays small throughout. Values are the " +
        "paper's own (Table 5, Phase I).",
      hotspots: [
        { x: 0.16, y: 0.5, label: "MPH hugs the centre", note: "The dashed inner ring is MPH's error — small on every axis, on all three metrics." },
        { x: 0.5, y: 0.12, label: "Naïve is the worst axis", note: "The outer polygon spikes toward naïve forecasting — MAE ≈ 25,000 vs MPH's 3,068." },
        { x: 0.83, y: 0.5, label: "One radar per metric", note: "MAE, MAPE and MRAE each get their own panel; MPH wins all three." },
      ],
      panels: [
        {
          subplotLabel: "MAE — MPH vs classical",
          xLabel: "method", yLabel: "MAE",
          chartKind: "radar", dataSource: "reported",
          digitized: {
            kind: "radar", badge: "paper's numbers",
            source: "Table 5 — MPH (Phase I, MAE 3068) vs eight classical methods",
            axes: [
              { name: "Naïve" }, { name: "Moving avg" }, { name: "Simple exp." }, { name: "Holt linear" },
              { name: "Holt-Winter" }, { name: "ARIMA" }, { name: "Theta" }, { name: "ARIMAX" },
            ],
            series: [
              { label: "classical method", values: [24974, 20647, 10120, 18681, 12076, 3979, 19743, 3364] },
              { label: "MPH (ours)", values: [3068, 3068, 3068, 3068, 3068, 3068, 3068, 3068] },
            ],
          },
        },
        {
          subplotLabel: "MAPE — MPH vs classical",
          xLabel: "method", yLabel: "MAPE (%)",
          chartKind: "radar", dataSource: "reported",
          digitized: {
            kind: "radar", badge: "paper's numbers",
            source: "Table 5 — MPH (Phase I, MAPE 3.02) vs eight classical methods",
            axes: [
              { name: "Naïve" }, { name: "Moving avg" }, { name: "Simple exp." }, { name: "Holt linear" },
              { name: "Holt-Winter" }, { name: "ARIMA" }, { name: "Theta" }, { name: "ARIMAX" },
            ],
            series: [
              { label: "classical method", values: [31.90, 23.57, 12.48, 21.05, 14.30, 4.36, 24.04, 10.57] },
              { label: "MPH (ours)", values: [3.02, 3.02, 3.02, 3.02, 3.02, 3.02, 3.02, 3.02] },
            ],
          },
        },
        {
          subplotLabel: "MRAE — MPH vs classical",
          xLabel: "method", yLabel: "MRAE",
          chartKind: "radar", dataSource: "reported",
          digitized: {
            kind: "radar", badge: "paper's numbers",
            source: "Table 5 — MPH (Phase I, MRAE 1.62) vs eight classical methods",
            axes: [
              { name: "Naïve" }, { name: "Moving avg" }, { name: "Simple exp." }, { name: "Holt linear" },
              { name: "Holt-Winter" }, { name: "ARIMA" }, { name: "Theta" }, { name: "ARIMAX" },
            ],
            series: [
              { label: "classical method", values: [18.61, 3.84, 7.09, 11.47, 3.16, 3.37, 3.55, 4.68] },
              { label: "MPH (ours)", values: [1.62, 1.62, 1.62, 1.62, 1.62, 1.62, 1.62, 1.62] },
            ],
          },
        },
      ],
    },
  ],
};
