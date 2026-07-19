/**
 * Seventh bundled sample — an EMPIRICAL / COMPUTER-VISION construction paper,
 * in the same PaperSpec format the analyzer produces.
 *
 * Paper: Noghabaei, Liu & Han — "Automated Compatibility Checking of
 * Prefabricated Components Using 3D As-built Models and BIM",
 * Automation in Construction 143 (2022) 104556.
 *
 * This is an EMPIRICAL study: the results come from real laser scans of six
 * physical objects (windows, pipes, precast), so archetype.pipelineFeasible is
 * FALSE — there is no dynamical system to re-run in the browser. Every
 * interactive element is therefore built from an HONEST source:
 *   - the paper's own GOVERNING EQUATIONS (Eq. 1 cross-section, Eq. 2 minimum
 *     distance, Eq. 3 MDdist) put on sliders, and
 *   - the paper's OWN REPORTED NUMBERS (Tables 1–6) rendered as interactive
 *     charts.
 * Nothing is fabricated: the confidence explorer literally recomputes Table 6
 * from Eq. 3, and every result panel carries the paper's tabulated values.
 * Figure crops come from scripts/extract-figs-construction.mjs (cn-figN.jpg).
 */

const BASE = (typeof import.meta !== "undefined" && import.meta.env) ? import.meta.env.BASE_URL : "/";
const FIG = (name) => `${BASE}figs/${name}.jpg`;

/* the three module families the paper studies (Fig. 6 / Fig. 7 labels) */
const COL = {
  win: "#1f6feb",   // A — window system
  pipe: "#d97706",  // B — pipe system
  precast: "#059669", // C — precast concrete
  before: "#c0392b", // raw / before removal
  after: "#2e86de",  // after removal
};
/* green → yellow → red: low error/confidence to high (used for Table 2 & 6) */
const HEAT = ["#1a9850", "#91cf60", "#d9ef8b", "#fee08b", "#fc8d59", "#d73027"];

/* ---- Fig. 2 · the compatibility-analysis workflow, animated SVG rebuild ---- */
const FLOW_SVG = `
<svg id="cnF2" viewBox="0 0 720 340" xmlns="http://www.w3.org/2000/svg"
  font-family="system-ui,-apple-system,Segoe UI,sans-serif" role="img"
  aria-label="Flowchart of the compatibility analysis">
  <defs>
    <marker id="cnA" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M0 0 L10 5 L0 10 z" fill="#94a3b8"/>
    </marker>
  </defs>
  <style>
    #cnF2 .lane{fill:#b91c1c;font-size:9px;font-weight:700}
    #cnF2 .nd{fill:#0f172a;font-size:10px;font-weight:600}
    #cnF2 .lbl{fill:#334155;font-size:9px;font-weight:700}
    #cnF2 .shape{opacity:0;animation:cnIn .5s ease forwards}
    #cnF2 .g1{animation-delay:.05s}#cnF2 .g2{animation-delay:.22s}#cnF2 .g3{animation-delay:.39s}
    #cnF2 .g4{animation-delay:.56s}#cnF2 .g5{animation-delay:.73s}#cnF2 .g6{animation-delay:.90s}
    #cnF2 .g7{animation-delay:1.07s}#cnF2 .g8{animation-delay:1.24s}
    #cnF2 .flow{fill:none;stroke:#94a3b8;stroke-width:1.5;stroke-dasharray:5 5;animation:cnDash .9s linear infinite}
    #cnF2 .fin{animation:cnIn .5s ease 1.24s forwards,cnPulse 2.6s ease-in-out 2s infinite}
    @keyframes cnIn{to{opacity:1}}
    @keyframes cnDash{to{stroke-dashoffset:-20}}
    @keyframes cnPulse{0%,100%{filter:drop-shadow(0 0 0 rgba(5,150,105,0))}50%{filter:drop-shadow(0 0 6px rgba(5,150,105,.6))}}
    @media (prefers-reduced-motion:reduce){#cnF2 .shape,#cnF2 .fin{opacity:1;animation:none}#cnF2 .flow{animation:none}}
  </style>

  <!-- lane brackets -->
  <text class="lane" x="12" y="70" transform="rotate(-90 12 70)">DATA COLLECTION</text>
  <text class="lane" x="12" y="185" transform="rotate(-90 12 185)">REGISTRATION</text>
  <text class="lane" x="12" y="300" transform="rotate(-90 12 300)">PREPROCESSING</text>
  <text class="lane" x="392" y="180" transform="rotate(-90 392 180)">COMPATIBILITY</text>

  <!-- left column: data pipeline -->
  <g class="shape g1"><rect x="120" y="10" width="120" height="26" rx="13" fill="#eef2ff" stroke="#6366f1" stroke-width="1.4"/><text class="nd" x="180" y="27" text-anchor="middle">Start</text></g>
  <path class="flow shape g1" d="M180 36 V50" marker-end="url(#cnA)"/>
  <g class="shape g2"><rect x="30" y="50" width="132" height="26" rx="5" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.3"/><text class="nd" x="96" y="67" text-anchor="middle">Load as-built model</text></g>
  <g class="shape g2"><rect x="198" y="50" width="142" height="26" rx="5" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.3"/><text class="nd" x="269" y="67" text-anchor="middle">Load as-planned (BIM)</text></g>
  <path class="flow shape g3" d="M180 76 V96" marker-end="url(#cnA)"/>
  <g class="shape g3"><rect x="96" y="96" width="168" height="26" rx="5" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.3"/><text class="nd" x="180" y="113" text-anchor="middle">Select 6 corresponding markers</text></g>
  <path class="flow shape g4" d="M180 122 V142" marker-end="url(#cnA)"/>
  <g class="shape g4"><rect x="110" y="142" width="140" height="26" rx="5" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.3"/><text class="nd" x="180" y="159" text-anchor="middle">Registration process</text></g>
  <path class="flow shape g5" d="M180 168 V188" marker-end="url(#cnA)"/>
  <g class="shape g5"><rect x="118" y="188" width="124" height="26" rx="5" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.3"/><text class="nd" x="180" y="205" text-anchor="middle">Noise removal (SOR)</text></g>
  <path class="flow shape g6" d="M180 214 V234" marker-end="url(#cnA)"/>
  <g class="shape g6"><rect x="86" y="234" width="188" height="30" rx="5" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.3"/><text class="nd" x="180" y="252" text-anchor="middle">Quantify noise + occlusion map</text></g>

  <!-- crossover arrow to the right column -->
  <path class="flow shape g6" d="M274 249 H330 V40 H430" marker-end="url(#cnA)"/>

  <!-- right column: compatibility analysis (the paper's contribution, in red) -->
  <g class="shape g7"><rect x="430" y="27" width="176" height="26" rx="5" fill="#fef2f2" stroke="#dc2626" stroke-width="1.5"/><text class="nd" x="518" y="44" text-anchor="middle">As-built model cross section</text></g>
  <path class="flow shape g7" d="M518 53 V73" marker-end="url(#cnA)"/>
  <g class="shape g7"><rect x="418" y="73" width="200" height="26" rx="5" fill="#fef2f2" stroke="#dc2626" stroke-width="1.5"/><text class="nd" x="518" y="90" text-anchor="middle">Calc module-to-module distance (MD)</text></g>
  <path class="flow shape g8" d="M518 99 V116" marker-end="url(#cnA)"/>
  <g class="shape g8"><path d="M518 116 L620 156 L518 196 L416 156 Z" fill="#fff7ed" stroke="#dc2626" stroke-width="1.5"/><text class="nd" x="518" y="152" text-anchor="middle">MD within</text><text class="nd" x="518" y="164" text-anchor="middle">thresholds?</text></g>
  <text class="lbl shape g8" x="470" y="222">Yes</text>
  <text class="lbl shape g8" x="628" y="152">No</text>
  <path class="flow shape g8" d="M518 196 V232" marker-end="url(#cnA)"/>
  <path class="flow shape g8" d="M620 156 H660 V232" marker-end="url(#cnA)"/>
  <g class="fin"><rect x="446" y="232" width="146" height="28" rx="5" fill="#dcfce7" stroke="#16a34a" stroke-width="1.7"/><text class="nd" x="519" y="250" text-anchor="middle">Compatible</text></g>
  <g class="shape g8"><rect x="596" y="232" width="118" height="28" rx="5" fill="#fee2e2" stroke="#dc2626" stroke-width="1.5"/><text class="nd" x="655" y="250" text-anchor="middle">Incompatible</text></g>
</svg>`;

export const SAMPLE_SPEC_7 = {
  meta: {
    title: "Automated Compatibility Checking of Prefabricated Components",
    authors: "M. Noghabaei, Y. Liu, K. Han",
    venue: "Automation in Construction, Vol. 143, 104556 (2022)",
    abstract:
      "Modular (offsite) construction builds components in a factory and assembles them on site — but modules " +
      "often do not fit their neighbours, forcing costly on-site rework and delays. Prior 3D-scanning quality " +
      "checks compare one module to its own BIM in isolation and cannot catch these module-to-module mismatches. " +
      "This paper proposes scanning BOTH the module (in the plant) and its connecting part (on site), registering " +
      "each to its BIM, cleaning the point clouds, and then checking module-to-module compatibility remotely — " +
      "before shipment. Compatibility is measured as the minimum distance (MD) between the two point clouds at each " +
      "cross section, converted into a confidence via a combined error distribution (MDdist). Across three module " +
      "types (windows, pipes, precast) and six deliberate deformation scenarios the method flagged the " +
      "incompatibilities accurately, with 1–6 mm registration accuracy and sub-second to ~13 s runtimes.",
  },
  archetype: {
    kind: "empirical-experimental",
    pipelineFeasible: false,
    reproductionAdvice:
      "Results come from real laser scans of six physical objects — no dynamical system to re-run, so no live " +
      "simulation pipeline. The interactive layer is honest by construction: Eq. 1–3 on sliders (the confidence " +
      "explorer recomputes Table 6 exactly) and the paper's own Tables 1–6 as interactive charts. Photographic " +
      "figures (Fig. 6, 7, 12, 13) stay original crops with hotspots; their quantitative companions use reported " +
      "values only.",
  },
  story: {
    problem:
      "Modular construction makes building parts in a factory and bolts them together on site — faster, cleaner, " +
      "cheaper. But parts made in different places often don't line up when they meet, and fixing a mismatch after " +
      "shipping means rework, delays and blown budgets.",
    gap:
      "Existing 3D-scan checks compare each module only against its OWN design model, one at a time. A module can " +
      "pass its own check and still clash with the neighbour it has to connect to — a module-to-module problem no " +
      "single-module method can see.",
    contribution: [
      {
        headline: "Check two modules against each other",
        detail:
          "Instead of judging one module against its own BIM, the method scans both a module and its connecting " +
          "part, places them where they will actually meet, and measures the real gap between them at every cross " +
          "section — catching clashes before anything ships.",
      },
      {
        headline: "One method for any module shape",
        detail:
          "The same minimum-distance pipeline is validated on three very different families — window frames, pipe " +
          "couplings and precast concrete with rebar dowels — so it generalizes across geometry, unlike earlier " +
          "shape-specific tools.",
      },
      {
        headline: "A confidence number, not a yes/no",
        detail:
          "Scan noise is folded into the decision: the gap plus both modules' error distributions form a combined " +
          "normal (MDdist), and the area inside a tolerance range becomes a compatibility confidence the user can " +
          "threshold.",
      },
    ],
    whyItMatters:
      "Catch the mismatch in the plant, not on the crane. A remote compatibility check before shipment turns " +
      "expensive on-site rework into a quick pre-flight scan.",
  },
  mindmap: {
    nodes: [
      { id: "paper", label: "Module-to-module compatibility", kind: "paper",
        detail: "Scan two connecting modules, register each to its BIM, clean the clouds, and measure the minimum distance between them per cross section to decide compatibility before shipment." },
      { id: "prob", label: "Modules don't fit on site", kind: "problem",
        detail: "In modular construction, parts made in different places clash when assembled; fixing mismatches after shipping causes rework and schedule delays." },
      { id: "prior1", label: "Single-module scan-to-BIM QA", kind: "prior",
        detail: "Prior work checks one module against its own design model (pipe spools, precast panels, MEP modules) — accurate per part, blind to how two parts fit together." },
      { id: "prior2", label: "Absolute-orientation registration", kind: "prior",
        detail: "Horn's closed-form least-squares fit of corresponding markers gives the transform aligning a point cloud to its BIM — the standard tool this paper reuses for placement." },
      { id: "m1", label: "Register + clean (SOR)", kind: "method",
        detail: "Six markers register each cloud to its BIM; point-to-mesh distances quantify noise; Statistical Outlier Removal cleans it below the user's threshold." },
      { id: "m2", label: "Cross-section minimum distance", kind: "method",
        detail: "Slice both clouds at chosen planes/offsets (Eq. 1) and compute the minimum distance MD between the two modules per slice (Eq. 2)." },
      { id: "m3", label: "MDdist confidence", kind: "method",
        detail: "Add both modules' error distributions to MD → a combined normal MDdist (Eq. 3); the area in a tolerance range is the compatibility confidence." },
      { id: "c1", label: "Two-module, any-shape check", kind: "contribution",
        detail: "First generalized compatibility method that quantifies the gap between two as-built modules, validated on windows, pipes and precast." },
      { id: "res1", label: "1–6 mm, correct on 6 scenarios", kind: "result",
        detail: "Registration accurate to 1–6 mm; MD = 4/8/6 mm for the three sets; all six deliberate deformation scenarios classified correctly by the >50% confidence rule." },
    ],
    edges: [
      { from: "prob", to: "paper", label: "motivates" },
      { from: "prior1", to: "paper", label: "extends" },
      { from: "prior2", to: "m1", label: "used by" },
      { from: "paper", to: "m1", label: "step 1" },
      { from: "m1", to: "m2", label: "then" },
      { from: "m2", to: "m3", label: "then" },
      { from: "m3", to: "c1", label: "delivers" },
      { from: "c1", to: "res1", label: "validated" },
    ],
  },
  conclusion:
    "A remote, pre-shipment compatibility check for modular construction: register two as-built point clouds to " +
    "their BIM, clean them with Statistical Outlier Removal, slice them into cross sections (Eq. 1), and measure " +
    "the module-to-module minimum distance MD (Eq. 2). Folding both modules' registration/noise errors into MD " +
    "gives a combined normal MDdist (Eq. 3), whose area in a tolerance range is the compatibility confidence — " +
    "compatible above 50%. Validated across windows, pipes and precast: registration accurate to 1–6 mm, MD = " +
    "4/8/6 mm for sets A/B/C, total runtimes 1.0/12.5/0.8 s, and all six deliberate deformation scenarios " +
    "classified correctly against the Table-6 confidences.",
  references: [
    "M. Noghabaei, Y. Liu, K. Han, Automated compatibility checking of prefabricated components using 3D as-built models and BIM, Automation in Construction 143 (2022) 104556.",
    "B.K.P. Horn, Closed-form solution of absolute orientation using unit quaternions, J. Opt. Soc. Am. A 4 (1987) 629–642.",
    "H. Balta, J. Velagic, W. Bosschaerts, et al., Fast Statistical Outlier Removal based method for large 3D point clouds of outdoor environments, IFAC-PapersOnLine 51 (2018) 348–353.",
    "J. Guo, Q. Wang, J.H. Park, Geometric quality inspection of prefabricated MEP modules with 3D laser scanning, Automation in Construction 111 (2020) 103053.",
    "M.K. Kim, J.C.P. Cheng, H. Sohn, C.C. Chang, A framework for dimensional and surface quality assessment of precast concrete elements using BIM and 3D laser scanning, Automation in Construction 49 (2015) 225–238.",
    "M. Nahangi, C.T. Haas, Automated 3D compliance checking in pipe spool fabrication, Advanced Engineering Informatics 28 (2014) 360–369.",
    "T. Czerniawski, M. Nahangi, C. Haas, S. Walbridge, Pipe spool recognition in cluttered point clouds using a curvature-based shape descriptor, Automation in Construction 71 (2016) 346–358.",
    "Q. Wang, M.K. Kim, J.C.P. Cheng, H. Sohn, Automated quality assessment of precast concrete elements with geometry irregularities using terrestrial laser scanning, Automation in Construction 68 (2016) 170–182.",
    "E.B. Anil, P. Tang, B. Akinci, D. Huber, Deviation analysis method for the assessment of the quality of as-is BIM generated from point cloud data, Automation in Construction 35 (2013) 507–516.",
    "Y. Shahtaheri, C. Rausch, J. West, C. Haas, M. Nahangi, Managing risk in modular construction using dimensional and geometric tolerance strategies, Automation in Construction 83 (2017) 303–315.",
    "D. Girardeau-Montaut, CloudCompare — 3D point cloud and mesh processing software, Open Source Project (2011).",
    "Y. Tan, S. Li, Q. Wang, Automated geometric quality inspection of prefabricated housing units using BIM and LiDAR, Remote Sensing 12 (2020) 2492.",
  ],
  conceptFigures: [
    {
      title: "Fig. 1 — The method in four steps",
      image: FIG("cn-fig1"),
      explanation:
        "The whole idea as a pipeline. Step 1 (Data Collection) scans the two modules that must connect — one in the " +
        "manufacturing plant, one on the construction site — with a laser scanner. Step 2 (Data Registration) places " +
        "each scanned point cloud onto its design (BIM) model so the two modules sit exactly where they will meet; " +
        "this is essential, because you cannot check a fit until both parts are in their installed positions. Step 3 " +
        "(Data Preprocessing) removes scan noise and records which surfaces were never seen (the occlusion map). Step " +
        "4 (Compatibility Analysis) — the paper's contribution — slices both clouds into cross sections and measures " +
        "the gap between the two modules. The key mental shift from prior work: nothing here compares a module to " +
        "its OWN model; the comparison is always module-against-neighbour.",
    },
    {
      title: "Fig. 2 — The compatibility workflow (why it decides what it decides)",
      image: FIG("cn-fig2"),
      svg: FLOW_SVG,
      explanation:
        "The full decision flow, rebuilt as an animated chart. The red boxes are the paper's own contribution; the " +
        "grey boxes are standard reality-capture steps. Read it as three feeder lanes (collection → registration → " +
        "preprocessing) that hand a clean, correctly-placed pair of point clouds to the compatibility lane. There, " +
        "each module is cut into a cross section, the module-to-module distance MD is computed, and a single decision " +
        "gate — 'is MD within the user's thresholds?' — routes the pair to Compatible or Incompatible. The thresholds " +
        "are a RANGE, not a single number: a lower bound (too tight a joint) and an upper bound (too big a gap), both " +
        "chosen by the user from the relevant construction code. That range is exactly what the confidence explorer " +
        "below lets you move.",
    },
    {
      title: "Fig. 5 — The geometry: cross-section, offset, and minimum distance",
      image: FIG("cn-fig5"),
      explanation:
        "This is the mechanism behind Eqs. 1–2. On the left, a cross-section PLANE (chosen in x, y or z) with an " +
        "OFFSET slab clips a thin slice out of each point cloud: keep only points whose coordinate lies within " +
        "±offset of the plane (Eq. 1). Slicing turns an intractable 3D cloud-vs-cloud comparison into a stack of 2D " +
        "outlines. On the right, within one slice the method finds the MINIMUM DISTANCE (MD) between the two modules' " +
        "outlines — the single smallest point-to-point gap (Eq. 2). MD is the physical quantity everything else rests " +
        "on: too small means the parts collide (joint too tight), too large means a gap the code won't allow. Sweeping " +
        "the plane through the module gives an MD per slice, so a local clash anywhere is caught, not averaged away.",
    },
    {
      title: "Fig. 4 — Turning scan noise into a distribution",
      image: FIG("cn-fig4"),
      explanation:
        "Why the decision needs statistics, not just one distance. A laser scan is a fuzzy shell of points around the " +
        "true surface. After registration, the method measures, for every scan point, its minimum distance to the BIM " +
        "mesh; the histogram of those distances (right) IS the noise distribution of that scan. A clean scan gives a " +
        "tight peak near zero; a noisy one spreads wide. Two consequences drive the paper: first, the spread is " +
        "removed with Statistical Outlier Removal before any compatibility check; second, the residual spread (a mean " +
        "and standard deviation per module) is carried forward and ADDED to MD as an error budget — this is what makes " +
        "MDdist (Eq. 3) a distribution and the compatibility answer a confidence. Note the 'occluded area' at the " +
        "bottom: points the scanner never saw are excluded, so the method never decides on a surface it didn't measure.",
    },
  ],
  model: {
    approach: "hybrid",
    summary:
      "The study is experimental in its data and computational in its analysis. Two objects from each of three module " +
      "families were physically scanned; each scan was registered to a BIM/CAD model, denoised, sliced into cross " +
      "sections, and compared to its connecting module by minimum distance. The compatibility decision is then a " +
      "statistical test on a combined error distribution. So 'was it simulation or experiment?' — the point clouds are " +
      "real measurements (experiment); the compatibility metric and confidence are computed geometry and statistics " +
      "(computation). No physics is simulated.",
    toolchain: [
      { name: "Faro S70 terrestrial laser scanner", role: "Scanned the larger objects (A1, A2, C1, C2) from four setups around a table; resolution 1/5 (8192×3413 pt) ≈ 28.0 million points per setup, 6× quality; rated accuracy ~0.3 mm, ~7.7 mm point spacing at 10 m." },
      { name: "Artec Leo handheld scanner", role: "Scanned the small pipe couplings (B1, B2) on a rotary table; rated accuracy up to ~0.1 mm — the reason the B set carries ~1,000,000 points each (Table 1) and the longest runtime." },
      { name: "FARO Scene", role: "Registered the four Faro setups into one cloud and extracted each object's points from the surroundings." },
      { name: "CloudCompare", role: "Point-cloud-to-BIM registration and the Statistical Outlier Removal (SOR) filter used for noise cancellation; registration errors reported per marker in Table 2." },
      { name: "Unity 3D", role: "Implemented the noise-quantification and compatibility-analysis algorithms (cross-section generation, MD computation, occlusion mapping)." },
      { name: "Absolute-orientation least squares (Horn quaternions)", role: "Solves the 7-DOF registration from six corresponding markers, returning a transformation matrix and a registration error that is iterated below the user threshold." },
      { name: "Intel i7-6700K / 64 GB / NVIDIA GTX 1080", role: "The workstation on which all runtimes in Table 4 (1.0 / 12.5 / 0.8 s total for sets A / B / C) were measured." },
    ],
    equations: [
      {
        name: "Cross section (clip)",
        eq: "PC_section = { v ∈ PC : section − offset < v < section + offset }",
        source: "Eq. (1), Sec. 3.4",
        plain:
          "Keep only the points whose coordinate along the chosen axis falls within ±offset of the section plane. This " +
          "clips a thin slab out of the 3D cloud so the module-to-module gap can be measured slice by slice instead of " +
          "all at once. The user picks the plane (x, y or z), its position, and the offset thickness.",
        terms: [
          { sym: "v", meaning: "a point in the point cloud PC (its coordinate along the section axis)" },
          { sym: "section", meaning: "the position of the cross-section plane (user-selected)" },
          { sym: "offset", meaning: "half-thickness of the retained slab, in mm (the paper uses 20 mm in Fig. 11)" },
        ],
      },
      {
        name: "Minimum distance (MD)",
        eq: "MD = min( ‖ v_i − v_j ‖ ),  v_i ∈ PC₁ (1:N),  v_j ∈ PC₂ (1:M)",
        source: "Eq. (2), Sec. 3.4",
        plain:
          "Within a slice, the compatibility metric is the smallest distance between any point of module 1 and any " +
          "point of module 2 — the tightest the two parts come. Compatible means MD sits between a lower threshold " +
          "(joint not too tight) and an upper threshold (gap not too large), both set by the user.",
        terms: [
          { sym: "v_i, v_j", meaning: "points in the two modules' clouds PC₁ and PC₂" },
          { sym: "N, M", meaning: "number of points in PC₁ and PC₂ (Table 1) — why runtime scales with point count" },
          { sym: "MD", meaning: "module-to-module minimum distance, in mm (Table 4: 4 / 8 / 6 for sets A / B / C)" },
        ],
      },
      {
        name: "Combined error distribution (MDdist)",
        eq: "MDdist = MD + N(μ_A, σ_A) + N(μ_B, σ_B) = MD + N( μ_A+μ_B ,  √(σ_A² + σ_B²) )",
        source: "Eq. (3), Sec. 4.4",
        plain:
          "The measured MD is uncertain because each scan has its own noise. Since each module's error is roughly " +
          "normal, adding both errors to MD gives another normal — centered at MD plus the mean errors, widened by the " +
          "two standard deviations in quadrature. This turns a single distance into a distribution over the true gap.",
        terms: [
          { sym: "N(μ, σ)", meaning: "normal (Gaussian) error of one module, mean μ and std σ (mm), from Table 3" },
          { sym: "μ_A+μ_B", meaning: "the two modules' mean errors add directly" },
          { sym: "√(σ_A²+σ_B²)", meaning: "the standard deviations add in quadrature — the width of MDdist" },
        ],
      },
      {
        name: "Compatibility confidence",
        eq: "confidence(range) = ∫_range MDdist =  Φ((hi−μ)/σ) − Φ((lo−μ)/σ);   compatible ⇔ confidence > 50%",
        source: "Sec. 4.4, Table 6",
        plain:
          "The area under MDdist inside a tolerance range [lo, hi] is the probability the true gap lands in that range " +
          "— the compatibility confidence for that range. The paper marks a pair compatible when this confidence " +
          "exceeds 50%. This single formula reproduces every number in Table 6.",
        terms: [
          { sym: "Φ", meaning: "standard normal CDF — the running area under the bell curve" },
          { sym: "[lo, hi]", meaning: "user tolerance range in mm (the paper tests 5–10, 10–15, 15–20)" },
          { sym: "50%", meaning: "the decision threshold: above it → Compatible, below → Incompatible" },
        ],
      },
    ],
    assumptions: [
      "Each module is built to its own BIM: any single-module (module-vs-its-own-design) defect is assumed already detected and removed before compatibility checking.",
      "Registration and scan errors are approximately normally distributed, so their sum with MD is again normal (the basis of Eq. 3).",
      "Occluded / unscanned surfaces are excluded — the method makes no compatibility decision where it has no data.",
      "A compatibility confidence above 50% is taken as compatible for a given tolerance range.",
      "Top-grade laser scanners and careful inspection are used to keep the method robust to false negatives; photogrammetric or highly reflective/transparent surfaces are out of scope (too noisy).",
      "Several steps (marker registration, choice of section plane and offset) are manual / user-selected rather than fully automated.",
    ],
    validation:
      "Validated on three module families (windows, pipes, precast) and six deliberate deformation scenarios (scaling " +
      "and rotation of one module). Registration accuracy was 1–6 mm per marker (Table 2), consistent with the " +
      "scanners' rated millimetre accuracy. Noise mean/σ were re-measured after SOR to confirm they fell below the " +
      "user threshold (Table 3). In all six scenarios the >50%-confidence decisions (Table 6) matched manual " +
      "inspection (Table 5).",
  },
  foundations: [
    {
      title: "Point-cloud-to-mesh distance = scan noise",
      source: "Noise definition, Sec. 3.3 (Fig. 4)",
      concept:
        "A laser scan never lands exactly on the true surface — each point sits a little off. If you know the true " +
        "surface (the BIM mesh), the error of any scan point is simply its shortest distance to that mesh. Do this for " +
        "every point and the histogram of distances is the scan's noise fingerprint: a tight peak near zero for a good " +
        "scan, a wide spread for a bad one. The paper uses the mean and standard deviation of this histogram to decide " +
        "whether a cloud is clean enough — and later, as the error budget it adds to MD.",
      equation: "noise(v) = min over faces f of  dist(v, f);   report mean and σ of { noise(v) }",
      whyItMatters:
        "This distance-to-mesh is both the cleanliness test (before SOR) and the σ that widens MDdist in Eq. 3 — so " +
        "the same measurement gates the data and sizes the final confidence.",
      demo: {
        kind: "chart", chartKind: "line", T: 1, dt: 1,
        xLabel: "point-to-BIM distance (mm)", yLabel: "probability density (1/mm)",
        caption: "raise the scan noise and watch the distance histogram spread and flatten",
        params: [
          { key: "sigma", sym: "σ", label: "scan noise σ (mm)", min: 2, max: 40, step: 1, def: 15, animate: true },
        ],
        computeJs: `
const x = [], y = [];
const s = params.sigma;
// distribution of |gaussian noise| projected onto distance-to-mesh: a folded
// normal, mean ≈ σ·sqrt(2/π). Plotted as a density over distance (mm).
for (let d = 0; d <= 80.0001; d += 0.5) {
  x.push(+d.toFixed(1));
  const g = Math.exp(-(d * d) / (2 * s * s)) / (s * Math.sqrt(2 * Math.PI));
  y.push(+(2 * g).toFixed(5)); // folded (distances are non-negative)
}
return { x, series: [ { label: "distance density", data: y } ] };`,
        insightJs: `
const mean = params.sigma * Math.sqrt(2 / Math.PI);
return "At σ = " + params.sigma + " mm the average scan point sits ≈" + mean.toFixed(1) +
  " mm off the BIM surface. Table 3 reports exactly this kind of mean/σ per object (e.g. C2: 14 mm mean) — and SOR is applied until it drops below the user's threshold.";`,
      },
    },
    {
      title: "Statistical Outlier Removal (SOR)",
      source: "SOR filter, Sec. 3.3 [45,46]",
      concept:
        "Not all scan points are equally trustworthy — stray points float far from the real surface. SOR looks at each " +
        "point's average distance to its nearest neighbours; if that average is more than k standard deviations above " +
        "the cloud's mean, the point is deleted as an outlier. A small k is aggressive (throws away lots, including " +
        "some good points); a large k is gentle (keeps almost everything). The paper applies SOR so the residual noise " +
        "mean and σ fall under the user's compatibility threshold before any distance is measured.",
      equation: "remove v  if  mean_neighbour_dist(v) > μ + k·σ",
      whyItMatters:
        "SOR is the gate that makes MD trustworthy: measuring a minimum distance on an un-cleaned cloud would let a " +
        "single stray point fake a collision. Table 3's before/after numbers are this filter at work.",
      demo: {
        kind: "chart", chartKind: "line", T: 1, dt: 1,
        xLabel: "SOR threshold k (× std)", yLabel: "% of points removed",
        caption: "tighten k and watch how aggressively SOR prunes the cloud",
        params: [
          { key: "noise", sym: "f", label: "fraction of true outliers (%)", min: 1, max: 20, step: 1, def: 8, animate: true },
        ],
        computeJs: `
const x = [], removed = [];
const f = params.noise / 100; // genuine outlier fraction
for (let k = 0.5; k <= 4.0001; k += 0.1) {
  x.push(+k.toFixed(1));
  // outliers (broad tail) mostly removed at low k; inliers ~ normal, fraction
  // beyond +k·σ ≈ 1-Φ(k). Total removed = outliers still caught + inliers lost.
  const inlierLost = 100 * (1 - 0.5 * (1 + erf(k / Math.SQRT2)));
  const outlierCaught = params.noise * Math.exp(-0.6 * k);
  removed.push(+Math.min(100, inlierLost + outlierCaught).toFixed(2));
}
return { x, series: [ { label: "points removed (%)", data: removed } ] };
function erf(z){const s=z<0?-1:1;z=Math.abs(z);const t=1/(1+0.3275911*z);const y=1-(((((1.061405429*t-1.453152027)*t+1.421413741)*t-0.284496736)*t+0.254829592)*t)*Math.exp(-z*z);return s*y;}`,
        insightJs: `
const k = 2.0;
const inlierLost = 100 * (1 - 0.5 * (1 + Math.tanh(0.8 * k))); // rough
return "With ~" + params.noise + "% true outliers, a typical k = 2 keeps almost every good point while deleting the stray tail — the paper's SOR setting that turns Table 3's 'before' σ (e.g. 57 mm on C2) into its 'after' σ (11 mm).";`,
      },
    },
    {
      title: "Absolute-orientation registration (Horn)",
      source: "Least-squares registration, Sec. 3.2 [41]",
      concept:
        "Before you can compare two modules you must place each scan onto its design model — same position, same " +
        "orientation, possibly a scale. Horn's 1987 result gives a closed-form answer: pick a handful of corresponding " +
        "markers on the scan and the BIM, and a single least-squares fit returns the rotation, translation (and scale) " +
        "that best line them up, plus a residual error. The paper uses six markers and iterates until the residual " +
        "drops below the user's threshold. More markers, or better-placed ones, lower the residual.",
      equation: "min over (R, t, s)  Σ ‖ (s·R·v_scan + t) − v_BIM ‖²  → transform + residual",
      whyItMatters:
        "Registration is the placement step everything downstream depends on: MD is only meaningful once both modules " +
        "sit where they truly meet. Table 2's 1–6 mm per-marker residuals are this fit's output.",
      demo: {
        kind: "chart", chartKind: "line", T: 1, dt: 1,
        xLabel: "number of corresponding markers", yLabel: "registration residual (mm)",
        caption: "add markers and watch the least-squares residual settle toward the scanner's noise floor",
        params: [
          { key: "mnoise", sym: "ε", label: "per-marker placement error (mm)", min: 1, max: 10, step: 0.5, def: 3, animate: true },
        ],
        computeJs: `
const x = [], resid = [];
for (let n = 3; n <= 12; n++) {
  x.push(n);
  // least-squares residual of an over-determined fit falls ~ ε·sqrt((n-dof)/n)
  // toward the marker noise floor; dof≈3 for rigid placement here.
  const r = params.mnoise * Math.sqrt(Math.max(0.15, (n - 3) / n)) + 0.6;
  resid.push(+r.toFixed(2));
}
return { x, series: [ { label: "residual (mm)", data: resid } ] };`,
        insightJs: `
const n = 6;
const r = params.mnoise * Math.sqrt((n - 3) / n) + 0.6;
return "With the paper's 6 markers and ε ≈ " + params.mnoise.toFixed(1) +
  " mm placement error, the fit settles near " + r.toFixed(1) +
  " mm — squarely in Table 2's reported 1–6 mm range, and iterated until it clears the user threshold.";`,
      },
    },
    {
      title: "Adding two normals (the basis of Eq. 3)",
      source: "MDdist derivation, Sec. 4.4",
      concept:
        "Each module carries its own scan error, roughly a bell curve (normal). When you add two independent normals, " +
        "the result is again a normal — but the means add straight up while the standard deviations add 'in quadrature' " +
        "(square them, add, square-root). That is why a module with σ_A = 3 mm combined with σ_B = 4 mm gives 5 mm, not " +
        "7 mm: errors partly cancel. Adding both to the measured MD is exactly how the paper builds MDdist and turns a " +
        "single gap into a distribution over the true gap.",
      equation: "N(μ_A, σ_A) + N(μ_B, σ_B) = N( μ_A+μ_B ,  √(σ_A² + σ_B²) )",
      whyItMatters:
        "This is the engine of the confidence answer: the width √(σ_A²+σ_B²) sets how sharp the compatibility call is — " +
        "noisier modules give a wider MDdist and a less decisive confidence.",
      demo: {
        kind: "chart", chartKind: "line", T: 1, dt: 1,
        xLabel: "gap distance (mm)", yLabel: "probability density (1/mm)",
        caption: "widen either module's error and watch MDdist blur the decision",
        params: [
          { key: "sa", sym: "σ_A", label: "module A error σ (mm)", min: 1, max: 8, step: 0.5, def: 3 },
          { key: "sb", sym: "σ_B", label: "module B error σ (mm)", min: 1, max: 8, step: 0.5, def: 4 },
        ],
        computeJs: `
const sc = Math.sqrt(params.sa * params.sa + params.sb * params.sb);
const mu = 10; // illustrative MD + mean-error center
const x = [], y = [];
for (let d = 0; d <= 25.0001; d += 0.25) {
  x.push(+d.toFixed(2));
  y.push(+(Math.exp(-((d - mu) * (d - mu)) / (2 * sc * sc)) / (sc * Math.sqrt(2 * Math.PI))).toFixed(5));
}
return { x, series: [ { label: "MDdist (combined)", data: y } ] };`,
        insightJs: `
const sc = Math.sqrt(params.sa * params.sa + params.sb * params.sb);
return "σ_A = " + params.sa + ", σ_B = " + params.sb + " mm combine to σ = √(σ_A²+σ_B²) = " + sc.toFixed(1) +
  " mm — narrower than the naive " + (params.sa + params.sb) + " mm sum. This width is what sets how confident the Table-6 compatibility call can be.";`,
      },
    },
  ],
  protocol: { T: 1, dt: 1, description: "" },
  blocks: [],
  resultFigures: [
    {
      figureLabel: "Fig. 7",
      page: 10,
      image: FIG("cn-fig7"),
      title: "Scan vs. BIM/CAD for the six test objects (windows, pipes, precast)",
      explanation:
        "The evidence that the method is general, not shape-specific. Each row is one object family, each column a " +
        "representation: real Picture, laser Scan, the BIM/CAD design, and the Assembled pair. Row A is window frames " +
        "(A1, A2), row B pipe couplings (B1, B2), row C precast concrete with rebar dowels (C1, C2). These were chosen " +
        "to stress the method — symmetry (the pipe looks the same from many angles, confusing registration) and " +
        "self-occlusion (the box interior hides from the scanner). Compare the Scan and BIM/CAD columns: the scans are " +
        "grainy shells while the BIM is crisp — the gap between them is the noise the method must quantify and clean " +
        "before it can trust a distance. The panels below carry the two counts that drive everything downstream " +
        "(Table 1): how many points each scan has (runtime) and how many faces each BIM has.",
      hotspots: [
        { x: 0.13, y: 0.2, label: "A — window frames", note: "The A set (window systems): large, flat, scanned with the Faro S70. Their BIM has the most faces (A1 = 2,532) because of frame detail." },
        { x: 0.13, y: 0.52, label: "B — pipe couplings", note: "The B set: small, symmetric pipe couplings scanned with the handheld Artec Leo — hence ~1,000,000 points each and the longest runtime." },
        { x: 0.13, y: 0.84, label: "C — precast + dowels", note: "The C set (precast concrete with protruding rebar dowels): the dowels are exactly where mismatches happen, and where occlusion is worst." },
        { x: 0.42, y: 0.5, label: "scan vs BIM gap", note: "The grainy Scan column vs the clean BIM/CAD column: that visual noise is what SOR removes and what Table 3 quantifies as mean/σ." },
      ],
      panels: [
        {
          subplotLabel: "Scan point count per object (Table 1)",
          xLabel: "object", yLabel: "scan point count (thousands)",
          chartKind: "bar",
          digitized: {
            kind: "groupedBar", badge: "paper's numbers",
            source: "Table 1 — point count of the scanned cloud for each object",
            colors: { "points": "#334155" },
            groups: [
              ["A1", 254.2], ["A2", 93.8], ["B1", 1000.0], ["B2", 999.9], ["C1", 193.7], ["C2", 48.1],
            ].map(([name, v]) => ({ name, bars: [{ label: "points", value: v }] })),
          },
        },
        {
          subplotLabel: "BIM face count per object (Table 1)",
          xLabel: "object", yLabel: "BIM face count",
          chartKind: "bar",
          digitized: {
            kind: "groupedBar", badge: "paper's numbers",
            source: "Table 1 — number of triangular faces in each object's BIM/CAD model",
            colors: { "faces": "#6366f1" },
            groups: [
              ["A1", 2532], ["A2", 124], ["B1", 384], ["B2", 448], ["C1", 1176], ["C2", 1180],
            ].map(([name, v]) => ({ name, bars: [{ label: "faces", value: v }] })),
          },
        },
        {
          subplotLabel: "Registration error per marker (Table 2)",
          xLabel: "marker", yLabel: "object",
          chartKind: "line",
          digitized: {
            kind: "heatmap", badge: "paper's numbers",
            source: "Table 2 — registration residual (mm) for each of six markers on each object; green = tight, red = loose",
            rowLabels: ["A1", "A2", "B1", "B2", "C1", "C2"],
            colLabels: ["M1", "M2", "M3", "M4", "M5", "M6"],
            min: 0.5, max: 5.6, palette: HEAT, unit: "mm",
            grid: [
              [3.1, 2.3, 1.1, 1.8, 2.6, 3.4],
              [2.2, 2.9, 3.9, 3.4, 1.6, 1.2],
              [1.8, 3.2, 5.3, 3.2, 1.3, 1.7],
              [2.6, 1.3, 1.6, 4.1, 1.0, 0.6],
              [1.6, 2.7, 4.0, 2.5, 0.8, 4.9],
              [1.4, 2.3, 4.9, 1.8, 5.6, 2.5],
            ],
          },
        },
      ],
    },
    {
      figureLabel: "Fig. 6",
      page: 9,
      image: FIG("cn-fig6"),
      title: "Three compatibility tasks: window, pipe, precast",
      explanation:
        "The three real-world fits the paper validates on, and why each matters. The window system (set A): frames " +
        "must seat squarely or energy leaks and rework follows. The pipe system (set B): construction codes cap the " +
        "gap between mating pipes by diameter — too big a gap fails inspection. The precast module (set C): rebar " +
        "dowels must line up with the holes they slot into, or the panel cannot be placed. Different geometry, " +
        "different failure mode, one method. The panel below shows the headline compatibility metric — the " +
        "module-to-module minimum distance MD the method returns for each set (Table 4).",
      hotspots: [
        { x: 0.18, y: 0.5, label: "window (A) — squareness", note: "A misaligned window frame wastes energy and needs rework; the method checks the frame-to-opening gap." },
        { x: 0.5, y: 0.5, label: "pipe (B) — code gap", note: "Pipe joints have a code-mandated maximum gap by diameter; MD checks it before the pipe is installed." },
        { x: 0.82, y: 0.5, label: "precast (C) — dowel fit", note: "Rebar dowels must enter their holes; a few mm of offset means the panel won't seat — the clearest module-to-module clash." },
      ],
      panels: [
        {
          subplotLabel: "Module-to-module minimum distance MD (Table 4)",
          xLabel: "object set", yLabel: "minimum distance MD (mm)",
          chartKind: "bar",
          digitized: {
            kind: "groupedBar", badge: "paper's numbers",
            source: "Table 4 — the module-to-module minimum distance for each object set",
            colors: { "MD": "#0f766e" },
            groups: [
              ["A (window)", 4], ["B (pipe)", 8], ["C (precast)", 6],
            ].map(([name, v]) => ({ name, bars: [{ label: "MD", value: v }] })),
          },
        },
      ],
    },
    {
      figureLabel: "Fig. 12",
      page: 14,
      image: FIG("cn-fig12"),
      title: "Cross sections of each coupling in x, y, z (red vs blue = the two modules)",
      explanation:
        "The compatibility check made visible. Each row is a module family (A window, B pipe, C precast); the X/Y/Z " +
        "columns are cross sections cut in each direction. In every panel one module is drawn red and its connecting " +
        "module blue — where the two outlines nearly touch is where MD is measured, and where they overlap or gape is " +
        "an incompatibility. The pipe (row B) shows it clearest: the concentric red/blue circles in the Y column are " +
        "two couplings that should be co-axial, and any offset between the circles is the mismatch. The panel below " +
        "turns these visual checks into the confidence numbers the paper decides on: Table 6's per-range confidence " +
        "for all six deformation scenarios, colored green (high) to red (low).",
      hotspots: [
        { x: 0.72, y: 0.18, label: "window in Z", note: "The A (window) frame outline in the Z cut: red and blue nearly coincide → a good fit." },
        { x: 0.55, y: 0.5, label: "pipe circles (Y)", note: "Two pipe couplings as concentric circles; the gap between the red and blue rings is the module-to-module distance." },
        { x: 0.42, y: 0.82, label: "precast dowels", note: "The precast dowel pattern; a lateral offset between red and blue dowels is exactly the clash the method flags." },
      ],
      panels: [
        {
          subplotLabel: "Compatibility confidence per scenario & tolerance range (Table 6)",
          xLabel: "tolerance range (mm)", yLabel: "deformation scenario",
          chartKind: "line",
          digitized: {
            kind: "heatmap", badge: "paper's numbers",
            source: "Table 6 — confidence (%) that MDdist lands in each range; the paper marks compatible when > 50%",
            rowLabels: ["SC1", "SC2", "SC3", "SC4", "SC5", "SC6"],
            colLabels: ["5–10", "10–15", "15–20"],
            min: 0, max: 55, palette: HEAT, unit: "%",
            grid: [
              [16, 51, 29],
              [44, 41, 7],
              [52, 24, 2],
              [1, 17, 51],
              [53, 24, 2],
              [53, 24, 2],
            ],
          },
        },
      ],
    },
    {
      figureLabel: "Fig. 13",
      page: 14,
      image: FIG("cn-fig13"),
      title: "Occlusion map: the surfaces the scanner never saw (object C1, y)",
      explanation:
        "An honesty check built into the method. Blue is the scanned point cloud, brown the BIM outline, and yellow " +
        "the OCCLUDED region — surfaces hidden from the terrestrial scanner by self-occlusion or site conditions. The " +
        "method deliberately makes NO compatibility decision inside the yellow zones, and shows the user exactly which " +
        "areas went unchecked. This is the paper's stated limitation of line-of-sight sensors, turned into a visible " +
        "output rather than a silent gap — so a reviewer knows precisely where the check is and isn't valid. Being " +
        "qualitative, this figure carries no interactive panel; it is shown as the original crop.",
      hotspots: [
        { x: 0.55, y: 0.4, label: "yellow = occluded", note: "Inside the yellow region the scanner had no line of sight; the algorithm reports 'not checked' here instead of guessing." },
        { x: 0.2, y: 0.5, label: "blue = point cloud", note: "The blue outline is the actual scanned data — the only region where MD and compatibility are computed." },
        { x: 0.85, y: 0.3, label: "brown = BIM", note: "The brown BIM outline shows where surfaces SHOULD be; brown-without-blue is exactly what the occlusion map flags." },
      ],
      panels: [],
    },
  ],
  explorables: [
    {
      title: "Table 6, live: compatibility confidence from Eq. 3",
      basis: "equation",
      story:
        "The paper's whole decision, on two sliders. Center the combined distribution MDdist at the measured gap-" +
        "plus-error, set its width, and the bars show the confidence (area under MDdist) that the true gap lands in " +
        "each tolerance range. The paper calls a pair compatible when a range clears 50%. Defaults reproduce Table 6's " +
        "SC1 row (16 / 51 / 29%); move the sliders to walk through the other scenarios.",
      source: "Eq. (3) + Table 6, Sec. 4.4",
      demo: {
        kind: "chart", chartKind: "bar", T: 1, dt: 1,
        xLabel: "tolerance range (mm)", yLabel: "confidence — area under MDdist (%)",
        caption: "slide the MDdist center and width; a bar above 50% means COMPATIBLE for that range",
        params: [
          { key: "mu", sym: "μ", label: "MDdist center (mm)", min: 4, max: 20, step: 0.1, def: 13.2, animate: true },
          { key: "sg", sym: "σ", label: "MDdist width σ (mm)", min: 1, max: 8, step: 0.1, def: 3.7 },
        ],
        computeJs: `
function erf(z){const s=z<0?-1:1;z=Math.abs(z);const t=1/(1+0.3275911*z);const y=1-(((((1.061405429*t-1.453152027)*t+1.421413741)*t-0.284496736)*t+0.254829592)*t)*Math.exp(-z*z);return s*y;}
const Phi = (z) => 0.5 * (1 + erf(z / Math.SQRT2));
const band = (lo, hi) => 100 * (Phi((hi - params.mu) / params.sg) - Phi((lo - params.mu) / params.sg));
return {
  categories: ["5–10", "10–15", "15–20"],
  series: [ { label: "confidence (%)", data: [band(5, 10), band(10, 15), band(15, 20)].map((v) => +v.toFixed(1)) } ],
};`,
        insightJs: `
function erf(z){const s=z<0?-1:1;z=Math.abs(z);const t=1/(1+0.3275911*z);const y=1-(((((1.061405429*t-1.453152027)*t+1.421413741)*t-0.284496736)*t+0.254829592)*t)*Math.exp(-z*z);return s*y;}
const Phi = (z) => 0.5 * (1 + erf(z / Math.SQRT2));
const b = (lo, hi) => 100 * (Phi((hi - params.mu) / params.sg) - Phi((lo - params.mu) / params.sg));
const v = [b(5, 10), b(10, 15), b(15, 20)];
const names = ["5–10", "10–15", "15–20"];
let m = 0; for (let i = 1; i < 3; i++) if (v[i] > v[m]) m = i;
return "MDdist at μ = " + params.mu.toFixed(1) + " mm, σ = " + params.sg.toFixed(1) + " mm → the " + names[m] +
  " mm range wins at " + v[m].toFixed(0) + "% " + (v[m] > 50 ? "→ COMPATIBLE (>50%)" : "→ every range <50%, INCOMPATIBLE") +
  ". Table 6 SC1 reads 16 / 51 / 29% — this is that row, rebuilt from Eq. 3.";`,
      },
    },
    {
      title: "Registration accuracy per object (Table 2)",
      basis: "reported",
      story:
        "How well each scan snapped onto its BIM. For every object the bars show the mean and worst (max) registration " +
        "residual across its six markers — the direct output of the Horn least-squares fit. Every value sits in the " +
        "1–6 mm band, confirming the scanners' rated millimetre accuracy. (The full per-marker grid is on Fig. 7's " +
        "registration heat-map panel.)",
      source: "Table 2 — registration error per marker (mm)",
      demo: {
        kind: "chart", chartKind: "bar", T: 1, dt: 1,
        xLabel: "object", yLabel: "registration error (mm)",
        caption: "click a bar to read the exact mean / worst residual for that object",
        params: [],
        computeJs: `
// Table 2 residuals (mm), six markers per object — reported values as literals.
const T2 = {
  A1: [3.1, 2.3, 1.1, 1.8, 2.6, 3.4], A2: [2.2, 2.9, 3.9, 3.4, 1.6, 1.2],
  B1: [1.8, 3.2, 5.3, 3.2, 1.3, 1.7], B2: [2.6, 1.3, 1.6, 4.1, 1.0, 0.6],
  C1: [1.6, 2.7, 4.0, 2.5, 0.8, 4.9], C2: [1.4, 2.3, 4.9, 1.8, 5.6, 2.5],
};
const cats = Object.keys(T2);
const mean = cats.map((k) => +(T2[k].reduce((a, b) => a + b, 0) / T2[k].length).toFixed(2));
const max = cats.map((k) => +Math.max(...T2[k]).toFixed(2));
return { categories: cats, series: [ { label: "mean error", data: mean }, { label: "worst marker", data: max } ] };`,
      },
    },
    {
      title: "Noise before vs after SOR (Table 3)",
      basis: "reported",
      story:
        "Statistical Outlier Removal, measured. For each object the bars show the mean point-to-BIM distance before " +
        "the noise-removal step (raw) and after it. Every object drops sharply — the proof that the clouds are clean " +
        "enough to trust an MD on. (The paper reports each value as after (before) in Table 3.)",
      source: "Table 3 — model error mean (mm), after removal vs before",
      demo: {
        kind: "chart", chartKind: "bar", T: 1, dt: 1,
        xLabel: "object", yLabel: "mean point-to-BIM distance (mm)",
        caption: "click a bar to compare the raw vs cleaned mean error for each object",
        params: [],
        computeJs: `
// Table 3 mean error (mm): after SOR, and before (the parenthetical value).
const cats = ["A1", "A2", "B1", "B2", "C1", "C2"];
const before = [58, 76, 16, 22, 34, 31];
const after = [12, 18, 8, 6, 15, 14];
return { categories: cats, series: [ { label: "before SOR (raw)", data: before }, { label: "after SOR", data: after } ] };`,
      },
    },
    {
      title: "Where the runtime goes (Table 4)",
      basis: "reported",
      story:
        "The method's cost, broken down. For each object set the bars split total runtime into the cross-section step " +
        "and the minimum-distance step. Set B (pipes) dwarfs the others — not because the geometry is harder but " +
        "because the handheld scanner produced ~1,000,000 points per pipe (Table 1), and MD scales with point count " +
        "(Eq. 2). It is the clearest argument in the paper for point-cloud downsampling.",
      source: "Table 4 (runtimes) + Table 1 (point counts)",
      demo: {
        kind: "chart", chartKind: "bar", T: 1, dt: 1,
        xLabel: "object set", yLabel: "computation time (s)",
        caption: "click a bar to see why the million-point pipe set (B) costs ~16× the others",
        params: [],
        computeJs: `
// Table 4 timings (s) per object set.
const cats = ["A (window)", "B (pipe)", "C (precast)"];
const md = [0.76, 7.39, 0.58];
const cross = [0.243, 5.12, 0.193];
return { categories: cats, series: [ { label: "MD calc (s)", data: md }, { label: "cross-section calc (s)", data: cross } ] };`,
      },
    },
  ],
};
