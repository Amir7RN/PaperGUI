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

/* ---- Fig 4 · a calendar heat map reconstructed from the described pattern
 * (weekends sell more; sales rise through the year; a couple of near-zero days
 * in December). The company's true daily values are proprietary, so this grid
 * is illustrative of the SHAPE the paper reports, not traced pixel values. ---- */
const CAL_GRID = (() => {
  const wk = [0.95, 0.34, 0.30, 0.33, 0.42, 0.62, 1.0]; // Sun..Sat — weekend-heavy
  const g = [];
  for (let d = 0; d < 7; d++) {
    const row = [];
    for (let m = 0; m < 12; m++) {
      const trend = 0.28 + 0.5 * (m / 11);            // rising through the year
      let v = 0.30 * wk[d] + 0.62 * trend * (0.6 + 0.4 * wk[d]);
      if (m === 11 && (d === 2 || d === 3)) v = 0.03; // the two near-zero Dec days
      row.push(Math.max(0, Math.min(1, +v.toFixed(3))));
    }
    g.push(row);
  }
  return g;
})();

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
      },
    },
  ],

  // Hands-on layer: the paper's OWN reported numbers (Tables 1–6), made interactive.
  explorables: [
    {
      title: "The headline: MPH vs the hierarchy rules",
      basis: "reported",
      story:
        "The whole paper in one chart. Parent-level MAE (forecast error, lower is better): the classic top-down rule scores " +
        "3068, bottom-up 1672 — and MPH just 303. That's a 90% cut versus top-down and 82% versus bottom-up, because MPH " +
        "uses information from BOTH levels of the hierarchy plus multivariate features.",
      source: "Table 4 — Top-down / Bottom-up vs MPH (MAE)",
      demo: {
        kind: "chart", chartKind: "bar", T: 1, dt: 1,
        xLabel: "method", yLabel: "parent-level MAE (units)",
        caption: "hover the bars for the exact reported MAE",
        params: [],
        computeJs: `return { categories: ["Top-down","Bottom-up","MPH (ours)"], series: [ { label: "parent MAE", data: [3068, 1672, 303] } ] };`,
      },
    },
    {
      title: "Every SKU has a different champion",
      basis: "reported",
      story:
        "Phase-I child-level MAE for all ten SKUs under each of the four models. There is no single winner: Random Forest is " +
        "lowest most often, but MLP takes SKUs 4, 7 and 9, and the gaps are small — which is exactly why MPH fits a model " +
        "PER series instead of forcing one model on the whole hierarchy. Click the legend to isolate a model.",
      source: "Table 1 — Phase I child-level results (MAE)",
      demo: {
        kind: "chart", chartKind: "bar", T: 1, dt: 1,
        xLabel: "SKU", yLabel: "child-level MAE (units)",
        caption: "hover for exact per-SKU MAE; click a legend entry to isolate a model",
        params: [],
        computeJs: `return { categories: ["1","2","3","4","5","6","7","8","9","10"], series: [
  { label: "MLP", data: [370,404,607,681,364,408,676,446,537,395] },
  { label: "RF",  data: [339,381,557,684,343,385,691,421,537,363] },
  { label: "GB",  data: [366,405,609,725,389,397,732,449,550,385] },
  { label: "XGB", data: [350,388,588,708,360,405,709,451,537,375] },
] };`,
      },
    },
    {
      title: "MPH vs the whole classical toolbox",
      basis: "reported",
      story:
        "MPH's final parent MAE (303) against eight classical forecasters run on the same data. Naïve forecasting is off the " +
        "chart at ~25,000; even ARIMAX (3364) and ARIMA (3979) — the best classical methods here — are an order of magnitude " +
        "worse than MPH. Multivariate features + hierarchy information is what opens the gap.",
      source: "Tables 5 & 6 — MPH vs traditional time-series methods (MAE)",
      demo: {
        kind: "chart", chartKind: "bar", T: 1, dt: 1,
        xLabel: "method", yLabel: "MAE (units)",
        caption: "the classical methods' MAE dwarfs MPH's 303",
        params: [],
        computeJs: `return { categories: ["Naïve","Moving avg","Simple exp.","Holt linear","Holt-Winter","ARIMA","Theta","ARIMAX","MPH (ours)"], series: [
  { label: "MAE", data: [24974,20647,10120,18681,12076,3979,19743,3364,303] },
] };`,
      },
    },
    {
      title: "Not every metric improves equally",
      basis: "reported",
      story:
        "The improvement MPH delivers depends on which error you care about. MAE and MRAE improve dramatically (90% and 81% " +
        "vs top-down), but MAPE improves less (39%) — because MAPE divides by the actual value, so a few small-demand SKUs " +
        "inflate the percentage. The paper's point: judge a forecaster on several metrics, not one.",
      source: "Table 4 — % improvement of MPH vs Top-down and Bottom-up",
      demo: {
        kind: "chart", chartKind: "bar", T: 1, dt: 1,
        xLabel: "metric", yLabel: "error reduction (%)",
        caption: "MPH's improvement over each baseline, per metric",
        params: [],
        computeJs: `return { categories: ["MAE","MAPE","MRAE"], series: [
  { label: "vs Top-down", data: [90, 39, 81] },
  { label: "vs Bottom-up", data: [82, 29, 65] },
] };`,
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
        "Formal, Outdoor) and their subcategories. Formal shoes dominate — Loafers are the single biggest subcategory — " +
        "followed by Casual (Slides lead) and Outdoor (Trail Running leads Beach and Backpacking). This uneven, nested " +
        "structure is exactly the hierarchy MPH forecasts. The interactive panel reads the subcategory heights off the plot.",
      hotspots: [
        { x: 0.44, y: 0.10, label: "Formal leads (Loafers)", note: "The Formal category — Loafers especially — has the highest gross sales, so it dominates the brand total." },
        { x: 0.16, y: 0.28, label: "Casual next (Slides)", note: "Within Casual, Slides sell most — versatile, worn on many occasions." },
        { x: 0.78, y: 0.40, label: "Outdoor smallest", note: "Outdoor trails the other two; Trail Running outsells Beach and Backpacking." },
      ],
      panels: [
        {
          subplotLabel: "Subcategory gross sales (read off Fig. 3)",
          xLabel: "subcategory", yLabel: "units sold (millions)",
          chartKind: "bar", dataSource: "reported",
          computeJs: `return { categories: ["Slides","Classic","Perf.","Lifestyle","Loafers","Oxfords","HighTops","TrailRun","Beach","Backpack"], series: [
  { label: "units sold (millions, approx.)", data: [3.4, 2.75, 2.65, 2.5, 5.1, 3.6, 3.5, 2.7, 2.05, 1.9] },
] };`,
        },
      ],
    },
    {
      figureLabel: "Figure 4",
      page: 7,
      image: FIG("sc-fig4"),
      title: "Calendar heat map of unit sales",
      explanation:
        "Three years (2015–2017) of daily sales as a calendar heat map: rows are days of the week, columns are the months, " +
        "colour is that day's sales. Two patterns jump out and both matter for forecasting — weekends sell more than weekdays " +
        "(so the weekday dummy features earn their keep), and sales rise over the years (a growing brand). A couple of near-" +
        "zero days in December stand out as anomalies. The panel reconstructs this weekend-up, year-up SHAPE (the true daily " +
        "values are proprietary).",
      hotspots: [
        { x: 0.5, y: 0.12, label: "Weekends darker", note: "Saturday/Sunday rows are consistently higher than mid-week — the weekday feature captures this." },
        { x: 0.92, y: 0.2, label: "Rising over time", note: "The palette warms across 2015→2017: an overall upward sales trend." },
        { x: 0.88, y: 0.5, label: "Two near-zero Dec days", note: "A pair of December days with almost no sales — likely weather or a supply-chain disruption." },
      ],
      panels: [
        {
          subplotLabel: "Sales pattern: weekday × month",
          xLabel: "month", yLabel: "day of week",
          chartKind: "heatmap", dataSource: "reported",
          digitized: {
            kind: "heatmap",
            source: "reconstructed from the pattern described for Fig. 4 (weekends higher, sales rising through the year) — the company's true daily values are proprietary",
            rows: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
            cols: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
            min: 0, max: 1, grid: CAL_GRID,
          },
        },
      ],
    },
    {
      figureLabel: "Figure 5",
      page: 8,
      image: FIG("sc-fig5"),
      title: "Monthly sales of the ten SKUs",
      explanation:
        "Each line is one SKU's sales by month, showing the seasonality the models must learn: a sharp climb over months 1–4 " +
        "(post-holiday, into spring/summer), a plateau through months 4–10, a dip in month 11 (buyers waiting for holiday " +
        "deals) and a rebound in month 12 (holiday shopping). One SKU sells far above the rest. The panel traces the top " +
        "seller and a typical mid-pack SKU straight off the figure.",
      hotspots: [
        { x: 0.5, y: 0.12, label: "One runaway SKU", note: "The top green line sits ~10,000 units above the pack all year — a very different series to forecast." },
        { x: 0.18, y: 0.6, label: "Climb, months 1–4", note: "All SKUs rise into spring/summer after the post-holiday reset." },
        { x: 0.82, y: 0.45, label: "Dip 11 → rebound 12", note: "A November lull before holiday shopping lifts December." },
      ],
      panels: [
        {
          subplotLabel: "Monthly units (traced off Fig. 5)",
          xLabel: "month", yLabel: "units sold",
          chartKind: "line",
          digitized: {
            source: "traced off Fig. 5 — the leading SKU and a typical SKU",
            series: [
              { label: "top-selling SKU", points: [[1, 17000], [2, 28500], [3, 31200], [4, 28600], [5, 29500], [6, 32000], [7, 33000], [8, 34500], [9, 33200], [10, 34000], [11, 30000], [12, 32200]] },
              { label: "a typical SKU", points: [[1, 8500], [2, 13800], [3, 15200], [4, 15000], [5, 15600], [6, 16200], [7, 16800], [8, 17000], [9, 16500], [10, 16600], [11, 15200], [12, 16000]] },
            ],
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
        "Units sold around eight holidays, split by category. Thanksgiving, Labor Day and New Year drive the biggest spikes " +
        "(promotions plus gift-buying), and within them Casual and Formal shoes lead while Outdoor lags — people buy dressier " +
        "shoes for holiday events, not hiking boots. This is why the holiday feature helps the models. The original stacks the " +
        "three categories; the panel shows them grouped so you can compare category by category.",
      hotspots: [
        { x: 0.7, y: 0.9, label: "Thanksgiving biggest", note: "The largest holiday spike (~12,000 units) — deep promotions and gift demand." },
        { x: 0.55, y: 0.5, label: "Formal & Casual lead", note: "Dressier shoes dominate holiday sales; Outdoor is the smallest slice." },
        { x: 0.2, y: 0.1, label: "Father's Day smallest", note: "Among the tracked events, Father's Day moves the fewest units." },
      ],
      panels: [
        {
          subplotLabel: "Holiday sales by category (read off Fig. 6)",
          xLabel: "holiday", yLabel: "units sold",
          chartKind: "bar", dataSource: "reported",
          computeJs: `return { categories: ["Thanksgiving","Labor Day","New Year","Memorial Day","Valentine's","Halloween","Mother's Day","Father's Day"], series: [
  { label: "Casual",  data: [4700, 3800, 3400, 3300, 3000, 1700, 1600, 1300] },
  { label: "Formal",  data: [5000, 4400, 4000, 4000, 2900, 1900, 1900, 1600] },
  { label: "Outdoor", data: [2500, 2300, 2100, 2000, 1800, 1200, 1100, 1100] },
] };`,
        },
      ],
    },
    {
      figureLabel: "Figure 7",
      page: 11,
      image: FIG("sc-fig7"),
      title: "Phase I vs Phase II, by model and metric",
      explanation:
        "The core result. For each of the four models (XGB, RF, MLP, GB) the tall red bar is the Phase-I parent error and the " +
        "short blue bar is the Phase-II error after the child forecasts are added as features — the collapse from red to blue " +
        "is the value of MPH's second phase. The dashed lines in the paper mark the top-down (3068) and bottom-up (1672) " +
        "baselines. All three metrics tell the same story; XGBoost wins Phase II with MAE 303. These are the exact reported numbers.",
      hotspots: [
        { x: 0.16, y: 0.75, label: "Phase I (red)", note: "Parent forecast from the model alone — comparable to the top-down baseline." },
        { x: 0.22, y: 0.9, label: "Phase II (blue)", note: "After child forecasts join as features, error drops sharply — XGB reaches MAE 303." },
        { x: 0.5, y: 0.25, label: "Baselines dashed", note: "The paper overlays top-down (3068) and bottom-up (1672) as reference lines." },
      ],
      panels: [
        {
          subplotLabel: "MAE — Phase I vs Phase II",
          xLabel: "model", yLabel: "MAE (units)",
          chartKind: "bar", dataSource: "reported",
          computeJs: `return { categories: ["XGB","RF","MLP","GB"], series: [
  { label: "Phase I (parent alone)", data: [3118, 3182, 3972, 3068] },
  { label: "Phase II (+ child forecasts)", data: [303, 610, 445, 528] },
] };`,
        },
        {
          subplotLabel: "MAPE — Phase I vs Phase II",
          xLabel: "model", yLabel: "MAPE (%)",
          chartKind: "bar", dataSource: "reported",
          computeJs: `return { categories: ["XGB","RF","MLP","GB"], series: [
  { label: "Phase I", data: [3.26, 3.31, 3.98, 3.02] },
  { label: "Phase II", data: [1.33, 1.69, 1.51, 1.59] },
] };`,
        },
        {
          subplotLabel: "MRAE — Phase I vs Phase II",
          xLabel: "model", yLabel: "MRAE",
          chartKind: "bar", dataSource: "reported",
          computeJs: `return { categories: ["XGB","RF","MLP","GB"], series: [
  { label: "Phase I", data: [2.95, 2.11, 4.47, 1.62] },
  { label: "Phase II", data: [2.61, 1.81, 2.09, 1.51] },
] };`,
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
        "inner ring. The classical polygon balloons out toward naïve forecasting and the simpler smoothers; MPH sits near the " +
        "centre on every axis, i.e. far lower error than all of them. Because each metric has its own scale, the shape of the " +
        "outer polygon changes between panels, but MPH stays small throughout. Values are the paper's own (Table 5, Phase I).",
      hotspots: [
        { x: 0.16, y: 0.5, label: "MPH near the centre", note: "The dashed inner ring is MPH's error — small on every axis." },
        { x: 0.5, y: 0.12, label: "Naïve worst", note: "The outer polygon spikes toward naïve forecasting — the weakest classical baseline." },
        { x: 0.83, y: 0.5, label: "One panel per metric", note: "MAE, MAPE and MRAE each get their own radar; MPH wins all three." },
      ],
      panels: [
        {
          subplotLabel: "MAE — MPH vs classical",
          xLabel: "method", yLabel: "MAE",
          chartKind: "radar", dataSource: "reported",
          digitized: {
            kind: "radar",
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
            kind: "radar",
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
            kind: "radar",
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
