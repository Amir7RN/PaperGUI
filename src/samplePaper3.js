/**
 * Third bundled sample — an EMPIRICAL / SURVEY paper, in the same PaperSpec
 * format the analyzer produces. It has no simulatable method (its results are
 * measured survey responses), so archetype.pipelineFeasible is false: the
 * dashboard is story + mindmap + the paper's real figures + reported-data
 * explorables (its own survey numbers, made interactive) rather than a live
 * simulation. It also showcases a digitized RADAR panel built from the paper's
 * own reported percentages.
 *
 * Paper: Noghabaei, Heydarian, Balali, Han — "Trend Analysis on Adoption of
 * Virtual and Augmented Reality in the Architecture, Engineering, and
 * Construction Industry", Data 2020, 5(1), 26 (MDPI). Open access, CC BY.
 */

const BASE = (typeof import.meta !== "undefined" && import.meta.env) ? import.meta.env.BASE_URL : "/";
const FIG = (name) => `${BASE}figs/${name}.jpg`;

export const SAMPLE_SPEC_3 = {
  meta: {
    title: "Trend Analysis on Adoption of Virtual and Augmented Reality in the Architecture, Engineering, and Construction Industry",
    authors: "M. Noghabaei, A. Heydarian, V. Balali, and K. Han",
    venue: "Data (MDPI), Vol. 5, No. 1, Art. 26 (2020)",
    abstract:
      "Two rounds of an industry survey (a year apart, 158 experts in total) measure how the " +
      "Architecture, Engineering and Construction (AEC) industry is adopting Augmented and Virtual " +
      "Reality (AR/VR). Confidence in AR/VR's future rose significantly between 2017 and 2018 " +
      "(mean 2.63 → 3.20 on a 0–4 scale, p = 0.001); residential and commercial sectors adopt the " +
      "most, institutional and transportation grew fastest, and respondents expect the biggest future " +
      "gains in healthcare. The paper quantifies the trend and maps the gaps that new AR/VR tools could fill.",
  },
  archetype: {
    kind: "empirical-survey",
    pipelineFeasible: false,
    reproductionAdvice:
      "The results are survey responses from 158 people — there is nothing to simulate. Every number " +
      "is the paper's own reported percentage or mean, so figures are shown as the real cropped tables/maps " +
      "with guided tours, and the interactivity comes from the paper's OWN reported data plotted as charts " +
      "(bars for per-option percentages, a radar for the sector mix). No surrogate model is honest here.",
  },
  story: {
    problem:
      "AR and VR could fix real weak spots in how buildings get designed and built — clunky 3D " +
      "visualization, poor on-site communication, unsafe training. But the construction industry has " +
      "been slow to adopt them, and nobody had hard numbers on why or how fast that's changing.",
    gap:
      "Earlier work showed AR/VR helps in retail, mining and healthcare, and argued it should help " +
      "construction too — but there was no trend data: no measurement of who is actually adopting it, " +
      "in which sectors, or whether confidence is rising.",
    contribution: [
      {
        headline: "Two surveys, a year apart",
        detail:
          "158 AEC experts and researchers answered the same survey in 2017 and again in 2018, so the " +
          "paper measures CHANGE over time, not just a one-off snapshot.",
      },
      {
        headline: "Confidence is rising — and it's significant",
        detail:
          "Mean confidence that AR/VR will run most projects within 5–10 years climbed from 2.63 to 3.20 " +
          "on a 0–4 scale (unpaired t-test, p = 0.001) — a real, statistically significant shift, not noise.",
      },
      {
        headline: "A map of where the gaps are",
        detail:
          "It pins down which sectors adopt most (residential, commercial), which grew fastest " +
          "(institutional, transportation), what's holding adoption back (budget, know-how) and where the " +
          "biggest future upside is (healthcare) — a to-do list for tool builders.",
      },
    ],
    whyItMatters:
      "If you build AR/VR tools for construction, this tells you where the demand already is and where it's " +
      "heading — so effort goes to the sectors and use-cases most ready to pay for it.",
  },
  mindmap: {
    nodes: [
      { id: "paper", label: "AR/VR-in-AEC adoption survey", kind: "paper",
        detail: "Two-round industry survey (2017 & 2018, 158 experts) quantifying how fast the construction industry is adopting Augmented and Virtual Reality, and where the gaps are." },
      { id: "prob", label: "Industry slow to adopt AR/VR", kind: "problem",
        detail: "AR/VR promises better visualization, communication and training for construction, but the AEC industry has lagged — with no data on why or how fast that's changing." },
      { id: "prior1", label: "AR/VR proven elsewhere", kind: "prior",
        detail: "Prior studies show AR/VR benefits retail, mining, healthcare and education (safety training, immersion, better comprehension) — motivating its use in construction." },
      { id: "prior2", label: "BIM as the digital backbone", kind: "prior",
        detail: "Building Information Modeling is already widely used (>74% of the industry); AR/VR is positioned as the immersive layer on top of BIM." },
      { id: "m1", label: "Two-round Likert survey", kind: "method",
        detail: "The same questionnaire (0–4 confidence scales, sector/tool/limitation multiple-choice) run a year apart, analyzed in SPSS/Excel with unpaired t-tests." },
      { id: "c1", label: "Confidence rose (p=0.001)", kind: "contribution",
        detail: "Mean future-confidence climbed 2.63 → 3.20 on a 0–4 scale between the two surveys — a statistically significant increase." },
      { id: "c2", label: "Gap map for tool builders", kind: "contribution",
        detail: "Identifies leading sectors, fastest-growing sectors, top limitations and highest-upside domains — a roadmap for where AR/VR tools are most needed." },
      { id: "res1", label: "Residential & commercial lead", kind: "result",
        detail: "Residential (23%) and commercial (25% overall) are the most common project types; institutional and transportation grew the most from 2017 to 2018." },
      { id: "res2", label: "Healthcare = biggest future bet", kind: "result",
        detail: "Respondents expect the highest future AR/VR growth in healthcare facilities (23%) and commercial buildings (21%); >70% expect AR/VR on most projects within 5–10 years." },
    ],
    edges: [
      { from: "prob", to: "paper", label: "motivates" },
      { from: "prior1", to: "paper", label: "builds on" },
      { from: "prior2", to: "paper", label: "builds on" },
      { from: "paper", to: "m1", label: "uses" },
      { from: "paper", to: "c1", label: "finds" },
      { from: "paper", to: "c2", label: "finds" },
      { from: "c1", to: "res2", label: "shown by" },
      { from: "c2", to: "res1", label: "shown by" },
    ],
  },
  conclusion:
    "Across two surveys of 158 AEC experts (2017 and 2018), confidence that AR/VR will run most projects " +
    "within 5–10 years rose significantly (mean 2.63 → 3.20 on a 0–4 scale, p = 0.001). Residential and " +
    "commercial sectors adopt AR/VR the most, institutional and transportation grew fastest, budget and " +
    "know-how are the main limitations, and healthcare is seen as the biggest future opportunity — a clear, " +
    "measured upward trend in AR/VR adoption in construction.",
  references: [
    "Noghabaei, M.; Heydarian, A.; Balali, V.; Han, K. Trend Analysis on Adoption of Virtual and Augmented Reality in the AEC Industry. Data 2020, 5(1), 26.",
    "Chi, H.-L.; Kang, S.-C.; Wang, X. Research trends and opportunities of augmented reality applications in architecture, engineering, and construction. Autom. Constr. 2013, 33, 116–122.",
    "Heydarian, A. et al. Immersive virtual environments versus physical built environments: A benchmarking study for building design. Autom. Constr. 2015, 54, 116–126.",
    "Wang, X.; Kim, M.J.; Love, P.E.D.; Kang, S.-C. Augmented Reality in built environment: Classification and implications for future research. Autom. Constr. 2013, 32, 1–13.",
    "NBS. National BIM Report 2017. RIBA Enterprises, 2017.",
    "Bruno, F. et al. Mixed prototyping for products usability evaluation. J. Comput. Des. Eng. 2019.",
  ],
  conceptFigures: [
    {
      title: "Figure 1 — Where the respondents are (2017, 2018, overall)",
      image: FIG("arvr-fig1"),
      explanation:
        "Three U.S. heatmaps show where the surveyed AR/VR experts work. California dominates every panel " +
        "(51% of high-AR/VR-experience respondents), with Illinois (12%) and New York (9%) next. The point " +
        "isn't the geography for its own sake — it tells you the survey's centre of gravity is the tech-heavy " +
        "West Coast, which is worth keeping in mind when reading the adoption numbers.",
    },
  ],
  foundations: [
    {
      title: "Likert scales and mean scores",
      source: "Survey methodology (background for §5)",
      concept:
        "Each attitude question offers ordered choices — here 'definitely not' = 0 up to 'definitely yes' = 4. " +
        "Turning words into numbers lets you average a whole group into one mean score. A mean of 2.6 sits " +
        "between 'might or might not' and 'probably yes'; a mean of 3.2 leans firmly toward 'probably yes'. The " +
        "shape of the response distribution matters too — the same mean can come from consensus or from a split crowd.",
      whyItMatters:
        "The paper's headline claim ('confidence rose') is exactly a comparison of two such mean scores, so " +
        "reading a Likert distribution is the skill you need to trust it.",
      demo: {
        kind: "chart", chartKind: "bar", T: 1, dt: 1,
        xLabel: "response", yLabel: "share of respondents (%)",
        caption: "slide the mood and watch the mean move across the 0–4 scale",
        params: [
          { key: "mood", sym: "μ", label: "Overall mood (mean response)", min: 0, max: 4, step: 0.1, def: 2.6 },
        ],
        computeJs: `
// a bell-ish distribution over the 5 Likert options centred on 'mood'
const opts = ["def. not","prob. not","maybe","prob. yes","def. yes"];
const w = opts.map((_, i) => Math.exp(-Math.pow(i - params.mood, 2) / 1.1));
const s = w.reduce((a,b)=>a+b, 0);
return { categories: opts, series: [ { label: "% of respondents", data: w.map(v => 100 * v / s) } ] };`,
      },
    },
    {
      title: "Is the change real? The unpaired t-test",
      source: "Statistical testing (background for §5)",
      concept:
        "Two survey rounds give two mean scores. Are they really different, or could the gap be luck? A t-test " +
        "compares the gap between the means to the spread within each group. A small p-value (the paper reports " +
        "p = 0.001) means a gap that big would almost never happen by chance — so the increase is 'statistically " +
        "significant'. Bigger gaps, tighter spreads and more respondents all push the p-value down.",
      whyItMatters:
        "It's what lets the authors say confidence 'significantly' increased rather than just 'looked higher' — " +
        "the difference between a finding and a coincidence.",
      demo: {
        kind: "chart", chartKind: "line", T: 1, dt: 1 / 120,
        xLabel: "confidence score", yLabel: "response density",
        caption: "drag the two survey means apart and watch them separate",
        params: [
          { key: "m1", sym: "μ₁", label: "2017 mean", min: 1, max: 4, step: 0.05, def: 2.63 },
          { key: "m2", sym: "μ₂", label: "2018 mean", min: 1, max: 4, step: 0.05, def: 3.20 },
          { key: "sd", sym: "σ",  label: "Spread (SD)", min: 0.4, max: 1.4, step: 0.05, def: 0.95 },
        ],
        computeJs: `
const N = helpers.n, x = [], a = [], b = [];
const g = (t, m) => Math.exp(-Math.pow(t - m, 2) / (2 * params.sd * params.sd));
for (let i = 0; i < N; i++) {
  const t = 0 + 5 * (i / (N - 1));
  x.push(t); a.push(g(t, params.m1)); b.push(g(t, params.m2));
}
return { x, series: [ { label: "2017 survey", data: a }, { label: "2018 survey", data: b } ] };`,
      },
    },
  ],
  // The hands-on layer for this measured paper: its OWN reported survey numbers,
  // made interactive. Every value is read straight from the paper's tables/text.
  explorables: [
    {
      title: "Confidence in AR/VR's future — it grew in a year",
      basis: "reported",
      story:
        "The survey's headline number: the mean confidence that AR/VR will run most projects within 5–10 " +
        "years, on a 0–4 scale. It rose from 2.63 in 2017 to 3.20 in 2018 — and an unpaired t-test says that " +
        "jump is statistically significant (p = 0.001).",
      source: "§5, unpaired t-test (M₂₀₁₇ = 2.63, M₂₀₁₈ = 3.20, p = 0.001)",
      demo: {
        kind: "chart", chartKind: "bar", T: 1, dt: 1,
        xLabel: "survey round", yLabel: "mean confidence (0–4)",
        caption: "hover the bars for the exact reported means",
        params: [],
        computeJs: `return { categories: ["2017", "2018"], series: [ { label: "mean confidence (0–4)", data: [2.63, 3.20] } ] };`,
      },
    },
    {
      title: "Which sectors are building with AR/VR",
      basis: "reported",
      story:
        "The overall share of respondents' projects by sector, and how each shifted from 2017 to 2018. " +
        "Residential and commercial dominate; industrial and 'other' are marginal. Toggle the two years to " +
        "see who grew.",
      source: "Table 3 — companies' project types (2017, 2018 columns)",
      demo: {
        kind: "chart", chartKind: "bar", T: 1, dt: 1,
        xLabel: "sector", yLabel: "share of respondents (%)",
        caption: "hover for exact percentages; click the legend to isolate a year",
        params: [],
        computeJs: `
return { categories: ["Residential","Commercial","Institutional","Transportation","Industrial","Other"], series: [
  { label: "2017", data: [21, 27, 23, 15, 9, 5] },
  { label: "2018", data: [27, 23, 19, 16, 12, 4] },
] };`,
      },
    },
    {
      title: "Which VR headsets the industry recommends",
      basis: "reported",
      story:
        "Respondents' most-recommended VR devices. Oculus Rift leads at about 45%, but HTC Vive and Microsoft " +
        "HoloLens gained between the two rounds while Oculus and Samsung Gear slipped — a live hardware race.",
      source: "§4.4 — VR device familiarity/recommendation",
      demo: {
        kind: "chart", chartKind: "bar", T: 1, dt: 1,
        xLabel: "device", yLabel: "recommended by (%)",
        caption: "the approximate reported recommendation shares",
        params: [],
        computeJs: `return { categories: ["Oculus Rift","HTC Vive","Samsung Gear","MS HoloLens"], series: [ { label: "% recommending", data: [45, 25, 18, 12] } ] };`,
      },
    },
    {
      title: "What's holding AR/VR back",
      basis: "reported",
      story:
        "The limitations respondents named. Lack of budget tops the list (21%), followed by upper management's " +
        "and design teams' lack of understanding (17% each). These are the gaps the paper says new tools and " +
        "training should target.",
      source: "§4.5 — reported limitations of AR/VR adoption",
      demo: {
        kind: "chart", chartKind: "bar", T: 1, dt: 1,
        xLabel: "limitation", yLabel: "cited by (%)",
        caption: "hover for the exact reported percentages",
        params: [],
        computeJs: `return { categories: ["Lack of budget","Mgmt. understanding","Design-team knowledge"], series: [ { label: "% citing", data: [21, 17, 17] } ] };`,
      },
    },
  ],
  protocol: { T: 1, dt: 1, description: "" },
  blocks: [],
  resultFigures: [
    {
      figureLabel: "Figure 1",
      page: 8,
      image: FIG("arvr-fig1"),
      title: "Geographical distribution of respondents",
      explanation:
        "Three U.S. choropleths — 2017, 2018 and overall — coloured by the number of respondents per state " +
        "(the colour bar runs 0 → 100). California is the deepest blue in all three (51% of high-experience " +
        "AR/VR respondents), with Illinois and New York the only other clearly shaded states. Read it as a " +
        "caveat on the whole survey: the sample leans heavily toward a few tech-forward states, so the " +
        "adoption numbers reflect industry leaders more than the national average.",
      hotspots: [
        { x: 0.06, y: 0.45, label: "California dominates", note: "California is the darkest state in every panel — 51% of the most AR/VR-experienced respondents work there." },
        { x: 0.30, y: 0.42, label: "Illinois, a distant second", note: "Illinois is the next-most-shaded state at ~12% — already a big gap below California." },
        { x: 0.72, y: 0.45, label: "Overall = the two years combined", note: "The right panel pools both surveys; the pattern barely changes, confirming the West-Coast concentration is stable, not a one-year fluke." },
      ],
    },
    {
      figureLabel: "Table 3",
      page: 9,
      image: FIG("arvr-table3"),
      title: "BIM & project-type trends between 2017 and 2018",
      explanation:
        "The paper's big reference table: for every survey option — project sector, BIM-usage frequency, years " +
        "of experience, and what BIM is used for — it lists the 2017, 2018 and overall percentages. The story " +
        "in the numbers: daily BIM use is the norm (37% overall), the 1–3-years-experience group is the largest " +
        "and growing (35% → 41%), and clash detection / model validation / visualization are the top BIM uses. " +
        "The interactive panel on the right turns the sector column into a radar so you can see the 2017→2018 " +
        "shift in the project mix at a glance.",
      hotspots: [
        { x: 0.5, y: 0.09, label: "sector mix", note: "Companies' project types — residential and commercial lead; this is the row plotted as the radar on the right." },
        { x: 0.5, y: 0.55, label: "1–3 yrs is the biggest group", note: "Familiarity by experience: the 1–3-year cohort is largest and grew 35% → 41%, i.e. lots of relatively new AR/VR users entering." },
        { x: 0.5, y: 0.82, label: "top BIM uses", note: "Model validation, clash detection and visualization dominate; energy/lighting and facility management barely register." },
      ],
      panels: [
        {
          subplotLabel: "Project-type mix, 2017 vs 2018",
          xLabel: "sector", yLabel: "% of respondents",
          chartKind: "radar", dataSource: "digitized",
          digitized: {
            kind: "radar",
            source: "Table 3 — companies' project types (2017, 2018 columns), read directly from the table",
            axes: [
              { name: "Residential" }, { name: "Commercial" }, { name: "Institutional" },
              { name: "Transportation" }, { name: "Industrial" }, { name: "Other" },
            ],
            series: [
              { label: "2017", values: [21, 27, 23, 15, 9, 5] },
              { label: "2018", values: [27, 23, 19, 16, 12, 4] },
            ],
          },
        },
        {
          subplotLabel: "How often respondents use BIM",
          xLabel: "frequency", yLabel: "% (overall)",
          chartKind: "bar", dataSource: "reported",
          computeJs: `return { categories: ["Never","Monthly","Weekly","Daily"], series: [ { label: "% of respondents", data: [21, 16, 26, 37] } ] };`,
        },
      ],
    },
  ],
};
