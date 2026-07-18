/**
 * Sixth bundled sample — a DEVICE-PHYSICS / ENERGY-CONVERSION theory paper, in
 * the same PaperSpec format the analyzer produces.
 *
 * Paper: Habibi & Cui — "Zero-Vacuum-Gap Thermophotonics",
 * PRX Energy 5, 013005 (2026).
 *
 * This is a THEORY paper (fluctuational-electrodynamics simulations of a real
 * device stack), so a reduced physics pipeline IS honestly computable in the
 * browser: generalized-Planck LED emission, the n² cavity enhancement, PV
 * conversion and the spacer-conduction penalty — calibrated to the paper's
 * reported magnitudes. Result-figure curves are digitized off the real figure
 * crops (no source-data file ships with the paper), and the live model chases
 * the Fig. 2(a) power curve as the sliders move.
 */

const BASE = (typeof import.meta !== "undefined" && import.meta.env) ? import.meta.env.BASE_URL : "/";
const FIG = (name) => `${BASE}figs/${name}.jpg`;

/* the paper's own line colors */
const COL = { power: "#c0392b", eff: "#1f3a93", aSi: "#1f3a93", GaAs: "#29abe2", ZnSe: "#27ae60", Glass: "#c0392b", ff: "#555" };

/* Fig 4(a): radiation-enhancement map, computed from the index-matching rule
 * the paper states (enhancement ≈ min(n_emitter, n_spacer, n_PV)², capped by
 * the PV index 3.8, eroded at high emitter extinction). Generated at module
 * load — a static grid, not a slider model. */
const N_AXIS = Array.from({ length: 11 }, (_, i) => 1 + i * 0.5); // 1 … 6
const ENH_GRID = N_AXIS.map((ns) =>
  N_AXIS.map((ne) => {
    const nEff = Math.min(ne, ns, 3.8);
    return +Math.min(24, nEff * nEff * (ne > 3.8 ? Math.pow(3.8 / ne, 1.2) : 1)).toFixed(1);
  })
).reverse(); // top row = high n_spacer, like the original
const JET = ["#00007f", "#0000ff", "#00ffff", "#ffff00", "#ff0000", "#7f0000"];

export const SAMPLE_SPEC_6 = {
  meta: {
    title: "Zero-Vacuum-Gap Thermophotonics",
    authors: "M. Habibi and L. Cui",
    venue: "PRX Energy, Vol. 5, 013005 (2026)",
    abstract:
      "Thermophotonic (TPX) converters promise to beat thermophotovoltaics by using a biased LED as an active " +
      "infrared emitter — but they demanded impossibly hot LEDs and near-perfect quantum efficiency. This paper " +
      "replaces the vacuum gap between LED and photovoltaic cell with a high-refractive-index solid spacer " +
      "(amorphous silicon), forming a zero-vacuum-gap optical cavity that concentrates photon flux by roughly the " +
      "index squared. The result: over 40-fold (up to 320-fold at matched conditions) power-density enhancement, " +
      "up to doubled efficiency, operation at moderate temperatures (<1000 °C) where good LEDs actually exist, a " +
      "record ≈98% external quantum efficiency from index matching — and with it, the first practical " +
      "self-sustaining TPX circuit with sizable power output.",
  },
  archetype: {
    kind: "simulation-theory",
    pipelineFeasible: true,
    reproductionAdvice:
      "The paper is computational device physics — generalized-Planck emission, cavity transport and PV conversion " +
      "are all equations, so a reduced calibrated pipeline runs live in the browser. The full fluctuational-" +
      "electrodynamics curves are digitized off the paper's own figures; the live model overlays Fig. 2(a) and " +
      "responds to every slider.",
  },
  story: {
    problem:
      "Factories, kilns and engines dump enormous heat at 300–1000 °C. Thermophotovoltaics (TPV) can turn radiated " +
      "heat into electricity, but below ~1000 °C the black-body photon flux collapses — there simply aren't enough " +
      "useful photons, so both power and efficiency die exactly where most waste heat lives.",
    gap:
      "Thermophotonics (TPX) fixes the photon shortage by biasing an LED so it emits far more than a passive hot " +
      "surface — in theory. In practice TPX stalled for two decades: the LED had to run impossibly hot, and a " +
      "self-sustaining circuit (no external supply) demanded external quantum efficiencies near 98% that no " +
      "far-field device achieved. Near-field designs with nanometre vacuum gaps promised the flux but are nearly " +
      "impossible to build at scale.",
    contribution: [
      {
        headline: "Fill the gap with the right solid",
        detail:
          "A high-index, infrared-transparent spacer (a-Si, n ≈ 3.5) optically fuses LED and PV cell into one " +
          "zero-vacuum-gap cavity. Photons with parallel wave-vectors up to n·k₀ — normally trapped by total " +
          "internal reflection — now cross, multiplying flux by ≈n².",
      },
      {
        headline: "40–320× more power, doubled efficiency, cooler LEDs",
        detail:
          "At the same operating condition the zTPX delivers 150–320× the far-field power density; a 600 K zTPX " +
          "matches a 1000–1100 K far-field device, so the LED can run where LEDs are actually good.",
      },
      {
        headline: "Index matching buys a record 98% EQE",
        detail:
          "With emitter, spacer and PV indices matched, interfacial reflectance drops below 2%: external quantum " +
          "efficiency reaches ≈98% — above every reported far-field TPV — which finally makes the self-sustaining " +
          "TPX circuit produce net power.",
      },
      {
        headline: "Conduction is a tax you can engineer away",
        detail:
          "A solid spacer conducts heat; the analysis shows an a-Si rod longer than ~1 cm (or GaAs > 20 cm) keeps " +
          "the conduction loss small enough that zTPX still beats far-field on efficiency at every temperature.",
      },
    ],
    whyItMatters:
      "Waste-heat recovery below 1000 °C is a gigawatt-scale opportunity with no good converter. A TPX built from " +
      "commercial InGaAs parts and an amorphous-silicon spacer — no nanogap, no exotic materials — moves " +
      "heat-to-electricity conversion from cryostat physics to something you could actually bolt onto a furnace.",
  },
  mindmap: {
    nodes: [
      { id: "paper", label: "Zero-vacuum-gap TPX", kind: "paper",
        detail: "Replace the LED–PV vacuum gap with a high-index solid spacer: an optical cavity that multiplies photon flux by ≈n², enabling practical, even self-sustaining, thermophotonics." },
      { id: "prob", label: "Low-T waste heat has no converter", kind: "problem",
        detail: "Below 1000 °C black-body flux collapses; TPV power and efficiency die exactly where industrial waste heat lives." },
      { id: "prior1", label: "TPX concept (Green, 2000s)", kind: "prior",
        detail: "Bias an LED to emit super-thermally and convert with a PV cell — but demands hot LEDs and ~98% EQE for self-sustained operation." },
      { id: "prior2", label: "Near-field TPV/TPX", kind: "prior",
        detail: "Nanometre vacuum gaps deliver evanescent flux but are unmanufacturable at scale — the flux idea is right, the vacuum gap is the problem." },
      { id: "m1", label: "High-index solid spacer cavity", kind: "method",
        detail: "a-Si (n≈3.5), GaAs, ZnSe or glass between In₀.₅₃Ga₀.₄₇As LED and PV: propagating waves with k∥ < n·k₀ carry ≈n²× the photons." },
      { id: "m2", label: "Fluctuational electrodynamics", kind: "method",
        detail: "Full-wave simulation of the layered stack (Au reflectors, 2-μm active layers) gives spectral flux, power, efficiency and EQE." },
      { id: "c1", label: "150–320× power, ×2 efficiency", kind: "contribution",
        detail: "Same temperature and bias: zTPX out-delivers far-field TPX by orders of magnitude; a 600 K zTPX equals a ~1050 K fTPX." },
      { id: "c2", label: "Record ≈98% EQE", kind: "contribution",
        detail: "Index matching cuts interfacial reflectance below 2% — EQE above every reported far-field TPV, unlocking the self-sustaining circuit." },
      { id: "res1", label: "Self-sustaining TPX with net power", kind: "result",
        detail: "With 98% EQE the loop LED→PV→LED closes with sizable output — the barrier identified two decades ago falls." },
      { id: "res2", label: "Conduction tax is manageable", kind: "result",
        detail: "a-Si spacers ≥1 cm keep conductive leakage small; zTPX beats far-field efficiency at every LED temperature from 400–900 K." },
    ],
    edges: [
      { from: "prob", to: "paper", label: "motivates" },
      { from: "prior1", to: "paper", label: "revives" },
      { from: "prior2", to: "paper", label: "replaces" },
      { from: "paper", to: "m1", label: "introduces" },
      { from: "paper", to: "m2", label: "evaluated by" },
      { from: "m1", to: "c1", label: "delivers" },
      { from: "m1", to: "c2", label: "delivers" },
      { from: "c2", to: "res1", label: "enables" },
      { from: "m2", to: "res2", label: "quantifies" },
    ],
  },
  conclusion:
    "Optically fusing an InGaAs LED to an InGaAs PV cell through a high-index solid spacer turns the whole device " +
    "into a photon-concentrating cavity: 150–320× the far-field power density, up to doubled efficiency, a 600 K " +
    "operating point that replaces a ~1050 K far-field emitter, and — via <2% interfacial reflectance — a record " +
    "≈98% external quantum efficiency that finally closes the self-sustaining TPX loop with net output. Conduction " +
    "through the spacer is the price, and it is affordable: a-Si rods ≥1 cm (GaAs ≥20 cm) keep zTPX ahead of " +
    "far-field TPX across 400–900 K.",
  references: [
    "Habibi, M. & Cui, L. Zero-vacuum-gap thermophotonics. PRX Energy 5, 013005 (2026).",
    "Green, M. A. Third Generation Photovoltaics: Advanced Solar Energy Conversion (Springer, 2003).",
    "LaPotin, A. et al. Thermophotovoltaic efficiency of 40%. Nature 604, 287–291 (2022).",
    "Zhao, B. et al. Self-sustaining thermophotonic circuits. PNAS 116, 11596–11601 (2019).",
    "Mittapally, R. et al. Near-field thermophotovoltaics for efficient heat to electricity conversion at high power density. Nat. Commun. 12, 4364 (2021).",
    "Sadi, T. et al. Electroluminescent cooling in intracavity light emitters. Nat. Photonics 14, 205–214 (2020).",
  ],
  conceptFigures: [
    {
      title: "FIG. 1(a,b) — Two device stacks, one difference: what fills the gap",
      image: FIG("zt-fig1"),
      explanation:
        "The whole idea in one stack diagram. (a) Conventional far-field TPX: a biased In₀.₅₃Ga₀.₄₇As LED " +
        "radiates across a vacuum/air gap to an InGaAs PV cell. The physics problem: light leaving a " +
        "high-index semiconductor (n ≈ 3.8) into vacuum (n = 1) is totally internally reflected beyond the " +
        "critical angle θc = arcsin(1/n) ≈ 15°, so only photons inside a narrow escape cone — carrying parallel " +
        "wave-vectors k∥ < k₀ = ω/c — ever cross. Everything else rattles inside the LED until it is reabsorbed. " +
        "(b) The zero-vacuum-gap version: an amorphous-silicon spacer (n ≈ 3.5) fills the gap. Now propagating " +
        "modes up to k∥ < n·k₀ cross the cavity — roughly n² ≈ 12× more optical states carrying power — and the " +
        "near-matched indices (3.8 → 3.5 → 3.8) cut interfacial reflection below 2%. Gold layers behind both " +
        "stacks reflect sub-bandgap photons back for another chance at absorption (photon recycling). Note what " +
        "did NOT change: same LED, same PV cell, same temperatures — the entire gain comes from the optics of " +
        "the gap.",
    },
    {
      title: "FIG. 1(c) — The spectral payoff: beating the black-body 'limit'",
      image: FIG("zt-fig1"),
      explanation:
        "Panel (c) is the physics headline, and reading its log axis is worth a minute. It plots spectral heat " +
        "flux versus photon energy for three cases; the vertical axis spans 10⁻¹⁴ to 10⁻⁸ W m⁻² per unit " +
        "angular frequency — each gridline is 100× more flux. Two things to notice. First, ABOVE the PV band " +
        "gap (0.74 eV) both TPX curves ride above the classical black-body limit — legal, because the biased " +
        "LED is not a passive thermal emitter: its photon population follows the generalized Planck law with a " +
        "chemical potential μ = eV, so a 0.5 V bias at 600 K multiplies emission by exp(eV/k_BT) ≈ 10⁴. Second, " +
        "the zero-gap curve sits ~2 decades above far-field across the useful band — that vertical offset IS " +
        "the n² mode-count enhancement from the spacer, and it is exactly the ×150–320 power gain reported in " +
        "Fig. 2. The black-body 'limit' only limits passive emitters radiating into vacuum; this device is " +
        "neither.",
    },
  ],
  /* The paper's methodology as the authors describe it — Sec. II.A, Eqs. (1)–(6)
   * and the Supplemental Material, all from the published PDF. */
  model: {
    approach: "simulation",
    summary:
      "This is a purely computational device-physics study — no experiment. The authors build a " +
      "fluctuational-electrodynamics model of the full layered stack (Au reflector / 2-µm InGaAs LED / solid " +
      "spacer / 2-µm InGaAs PV / Au reflector), compute how many photons cross it at every frequency and " +
      "angle, convert those photon fluxes into LED and PV currents with realistic loss channels, and subtract " +
      "the LED's electrical bill from the PV's output. Every curve in the paper comes out of Eqs. (1)–(6).",
    toolchain: [
      { name: "Generalized Planck law", role: "LED emission with a photon chemical potential μ = eV — the quasi-Fermi-level splitting lets a biased LED out-radiate a black body above the band gap (Würfel 1982; Eq. 1–2)." },
      { name: "Scattering-matrix optics", role: "Transmission functions ξ between every pair of layers computed with the multilayer dyadic-Green's-function / scattering-matrix formalism (Francoeur et al.), integrated over frequency ω and parallel wave-vector k∥." },
      { name: "Detailed balance + losses", role: "Photon fluxes → currents with Auger recombination, Shockley–Read–Hall recombination and shunt-resistance losses included for both LED and PV (Eqs. 3–4)." },
      { name: "Finite-difference conduction", role: "The spacer's parasitic heat leak q_cond solved numerically with temperature-dependent thermal conductivity κ(T) plus radiative absorption inside the spacer." },
      { name: "Self-sustaining circuit model", role: "The Zhao et al. (PNAS 2019) series/parallel LED–PV circuit framework, adopted unmodified, to test whether the 98% EQE closes the loop with net power." },
      { name: "CU Boulder Research Computing", role: "The k∥- and ω-resolved integrations over the material library (Table S1) ran on the University of Colorado Boulder Research Computing cluster." },
    ],
    equations: [
      {
        name: "Photon flux (gen. Planck)",
        eq: "θ(ω,T,V) = ℏω / [exp((ℏω − eV)/k_BT) − 1];   F_PV = ∫ Σ (θ_LED − θ_PV)/ℏω · ξ dω",
        source: "Eqs. (1)–(2), Sec. II.A — the heart of the model",
        plain:
          "θ is the mean energy of a light mode at frequency ω when the emitter sits at temperature T and bias V. " +
          "The eV term is the photon chemical potential: it shifts the exponential so a biased LED emits as if it " +
          "were far hotter — but only above its band gap, and only in the active region. The PV's received flux " +
          "F_PV sums (emitter minus receiver) occupation differences over every pathway, weighted by how well the " +
          "stack transmits that frequency (ξ).",
        terms: [
          { sym: "ℏω", meaning: "photon energy at angular frequency ω" },
          { sym: "eV", meaning: "photon chemical potential — the LED bias converted to an energy shift; the paper's key lever" },
          { sym: "ξ (xi)", meaning: "transmission function between two layers of the stack, from scattering-matrix optics; this is where the spacer's n² enhancement enters" },
          { sym: "ω_c", meaning: "band-gap cutoff — integration starts at the PV/LED band edge (0.74 eV for InGaAs)" },
        ],
      },
      {
        name: "Currents & losses",
        eq: "I_PV = e·F_PV − I_Auger − I_SRH − V/R_shunt;   I_LED = e·F_LED + I_Auger + I_SRH + V/R_shunt",
        source: "Eqs. (3)–(4), Sec. II.A",
        plain:
          "Each absorbed photon ideally makes one electron-hole pair (e·F). Reality subtracts three loss channels: " +
          "Auger recombination (three-carrier collisions, worst at high injection), Shockley–Read–Hall " +
          "recombination (defect-assisted), and shunt leakage. The same losses that reduce the PV's harvest " +
          "INCREASE the LED's bill — they appear with opposite signs in the two equations, which is why EQE " +
          "matters twice.",
        terms: [
          { sym: "I_Auger", meaning: "Auger recombination current — dominant non-radiative loss in low-gap InGaAs" },
          { sym: "I_SRH", meaning: "Shockley–Read–Hall (defect) recombination current" },
          { sym: "R_shunt", meaning: "shunt resistance — parasitic leakage path across the junction" },
        ],
      },
      {
        name: "Efficiency",
        eq: "η = P / (q_rad + q_cond − V_LED·I_LED),   P = J_PV·V_PV − J_LED·V_LED",
        source: "Eqs. (5)–(6), Sec. II.A",
        plain:
          "Net electrical output P (PV harvest minus LED bill) divided by all the heat actually drawn from the hot " +
          "side: the net radiative flux q_rad, plus the conduction leak q_cond down the solid spacer — the one " +
          "term a vacuum-gap device doesn't have, and the reason Fig. 3 sweeps spacer length. The reduced " +
          "browser model in the Method Lab is this equation with the optics collapsed into calibrated constants.",
        terms: [
          { sym: "q_rad", meaning: "net radiative heat flux from emitter to PV, integrated over the whole spectrum (Eq. 5)" },
          { sym: "q_cond", meaning: "conductive heat leak through the spacer = κ(T)·ΔT/L, solved by finite differences — scales as 1/L" },
          { sym: "V_LED·I_LED", meaning: "electrical power fed back into the LED (recovered in the denominator's accounting)" },
        ],
      },
      {
        name: "EQE & index matching",
        eq: "EQE = IQE × (1 − R),   R_interface = ((n₁ − n₂)/(n₁ + n₂))²  →  <2% when 3.8 | 3.5 | 3.8",
        source: "Sec. II.C, Fig. 4",
        plain:
          "External quantum efficiency is internal efficiency times the fraction of photons that actually cross " +
          "the interfaces. Far-field devices lose 30%+ to the semiconductor-vacuum index step no matter how good " +
          "the diode is; matching emitter (3.8), spacer (3.5) and PV (3.8) indices drives total interfacial " +
          "reflectance under 2%, which is the whole 98% EQE record — and the self-sustaining threshold of Fig. 4(d) " +
          "sits at ~97–98%.",
        terms: [
          { sym: "IQE", meaning: "internal quantum efficiency — photons per electron-hole pair inside the device" },
          { sym: "R", meaning: "reflectance photons see entering the PV; the design variable this paper attacks" },
        ],
      },
    ],
    assumptions: [
      "Planar, laterally infinite layers — 1D multilayer optics; no edge or lateral-transport effects.",
      "The photon chemical potential μ = eV applies only in the LED active region and only above the band gap; all sub-gap radiation is ordinary thermal emission.",
      "Material optical constants from the literature (a-Si: Pierce & Spicer; InGaAs: empirical band-gap model), spacer extinction assumed negligible in the transparency window.",
      "PV cell held at 300 K; LED temperature treated as uniform at each operating point (400–900 K sweep).",
      "The self-sustaining analysis adopts Zhao et al.'s circuit framework unmodified, so gains are attributable to the zero-gap optics alone.",
    ],
    validation:
      "The framework reduces to standard far-field TPX when the spacer index → 1, reproducing prior published " +
      "results (Zhao et al. 2018/2019); the zero-gap optics were validated against the authors' own zTPV " +
      "experiments (Habibi et al., EES 2025); and sub-turn-on LED emission is cross-checked against the " +
      "generalized-Planck prediction in Supplemental Fig. S3.",
  },
  foundations: [
    {
      title: "Why low temperatures starve TPV",
      source: "Black-body radiation + the PV band gap (Introduction)",
      concept:
        "A photovoltaic cell only uses photons above its band gap. A hot surface radiates σT⁴ in total, but the " +
        "above-gap slice shrinks catastrophically as the emitter cools — it scales like exp(−E_g/k_BT). Halve the " +
        "temperature and the useful photon flux doesn't halve, it collapses by orders of magnitude. That's why " +
        "record TPV efficiencies live at 1500–2000 °C and why 300–700 °C waste heat had no good converter.",
      equation: "Φ_above-gap ∝ T³ · e^(−E_g / k_B T)",
      whyItMatters:
        "This exponential cliff is the enemy the whole paper fights: TPX at moderate temperature must MANUFACTURE " +
        "above-gap photons with LED bias instead of waiting for thermal ones.",
      demo: {
        kind: "chart", chartKind: "line", T: 1, dt: 1,
        xLabel: "emitter temperature (K)", yLabel: "log₁₀ above-gap photon flux (a.u.)",
        caption: "sweep the band gap — watch the low-temperature cliff move",
        params: [
          { key: "eg", sym: "E_g", label: "PV band gap (eV)", min: 0.4, max: 1.4, step: 0.02, def: 0.74, animate: true },
        ],
        computeJs: `
const kB = 8.617e-5; // eV/K
const x = [], flux = [], total = [];
for (let T = 400; T <= 2000; T += 25) {
  x.push(T);
  flux.push(+ (3 * Math.log10(T) - params.eg / (kB * T) / Math.LN10 * Math.LN10 / Math.log(10) ).toFixed(2));
  total.push(+ (4 * Math.log10(T) - 4 * Math.log10(2000)).toFixed(2));
}
// normalize: log10 flux relative to its 2000 K value
const ref = flux[flux.length - 1];
return { x, series: [
  { label: "above-gap flux (log₁₀, rel. 2000 K)", data: flux.map((v) => +(v - ref).toFixed(2)) },
  { label: "total σT⁴ (log₁₀, rel. 2000 K)", data: total },
] };`,
        insightJs: `
const kB = 8.617e-5;
const drop = (T) => 3 * Math.log10(T / 2000) - (params.eg / kB) * (1 / T - 1 / 2000) / Math.LN10;
const d600 = drop(600);
return "With E_g = " + params.eg.toFixed(2) + " eV, cooling from 2000 K to 600 K cuts the above-gap photon supply by 10^" +
  Math.abs(d600).toFixed(1) + " — while total heat only falls ~120×. That asymmetry is why sub-1000 °C TPV starves and why the LED must pump photons instead.";`,
      },
    },
    {
      title: "The LED as a photon pump",
      source: "Generalized Planck law (Sec. II.A)",
      concept:
        "Bias an LED at voltage V and its emitted photon flux is the thermal flux multiplied by exp(qV/k_BT) — the " +
        "quasi-Fermi-level splitting acts like a chemical potential for photons. At 600 K, half a volt multiplies " +
        "emission by ~15,000. The energy comes partly from the electrical bias and partly from the LED's own heat: " +
        "run it right and the LED actually cools itself (electroluminescent refrigeration) while flooding the PV " +
        "cell with above-gap photons.",
      equation: "Φ(E) ∝ n² E² / [exp((E − qV)/k_BT) − 1]",
      whyItMatters:
        "This exponential lever is what lets a 600 K TPX behave like a much hotter passive emitter — the paper's " +
        "power curves in Fig. 2 all climb exponentially with LED voltage until costs catch up.",
      demo: {
        kind: "chart", chartKind: "line", T: 1, dt: 1,
        xLabel: "LED voltage (V)", yLabel: "log₁₀ emission boost",
        caption: "sweep the LED temperature — colder LEDs get MORE leverage per volt",
        params: [
          { key: "T", sym: "T", label: "LED temperature (K)", min: 400, max: 900, step: 10, def: 600, animate: true },
        ],
        computeJs: `
const kB = 8.617e-5;
const x = [], boost = [];
for (let v = 0; v <= 0.6001; v += 0.01) {
  x.push(+v.toFixed(2));
  boost.push(+ (v / (kB * params.T) / Math.LN10).toFixed(2));
}
return { x, series: [ { label: "log₁₀ exp(qV/kBT)", data: boost } ] };`,
        insightJs: `
const kB = 8.617e-5;
const b = 0.5 / (kB * params.T) / Math.LN10;
return "At " + params.T + " K, a 0.5 V bias boosts emission 10^" + b.toFixed(1) +
  "× over the passive surface. Colder LED ⇒ bigger boost per volt — but also fewer thermal photons to start from; the paper operates at 600–700 K where the product is best.";`,
      },
    },
    {
      title: "Index matching: killing reflection at interfaces",
      source: "Fresnel reflection (Sec. II.C)",
      concept:
        "Light crossing from index n₁ to n₂ reflects R = ((n₁−n₂)/(n₁+n₂))² even at normal incidence — and beyond " +
        "the critical angle it reflects TOTALLY. An LED with n ≈ 3.5 facing vacuum (n = 1) traps most of its " +
        "photons inside itself. Fill the gap with a matched-index solid and both problems vanish: no total internal " +
        "reflection (no critical angle) and near-zero Fresnel loss. The paper measures the win as <2% interfacial " +
        "reflectance in the zero-gap stack vs ~30% far-field.",
      equation: "R = ((n₁ − n₂)/(n₁ + n₂))²",
      whyItMatters:
        "Reflectance is exactly what external quantum efficiency loses: the ≈98% record EQE of Fig. 4 is this " +
        "formula driven to its floor by matching emitter, spacer and PV indices.",
      demo: {
        kind: "chart", chartKind: "line", T: 1, dt: 1,
        xLabel: "spacer refractive index n₂", yLabel: "normal-incidence reflectance (%)",
        caption: "sweep the LED index — the dip sits exactly at n₂ = n₁ (perfect match)",
        params: [
          { key: "n1", sym: "n₁", label: "LED / emitter index", min: 1.5, max: 4.5, step: 0.05, def: 3.5, animate: true },
        ],
        computeJs: `
const x = [], r = [], vac = [];
for (let n2 = 1; n2 <= 4.5001; n2 += 0.05) {
  x.push(+n2.toFixed(2));
  r.push(+ (100 * Math.pow((params.n1 - n2) / (params.n1 + n2), 2)).toFixed(2));
  vac.push(+ (100 * Math.pow((params.n1 - 1) / (params.n1 + 1), 2)).toFixed(2));
}
return { x, series: [
  { label: "reflectance vs spacer index", data: r },
  { label: "vacuum-gap reflectance (n₂ = 1)", data: vac },
] };`,
        insightJs: `
const rV = 100 * Math.pow((params.n1 - 1) / (params.n1 + 1), 2);
const rSi = 100 * Math.pow((params.n1 - 3.5) / (params.n1 + 3.5), 2);
return "An n₁ = " + params.n1.toFixed(2) + " emitter loses " + rV.toFixed(0) +
  "% of photons per bounce against vacuum, but only " + rSi.toFixed(1) +
  "% against a-Si (n = 3.5) — before even counting the total-internal-reflection photons the spacer unlocks.";`,
      },
    },
    {
      title: "The self-sustaining loop and its EQE cliff",
      source: "Self-sustaining circuit analysis (Sec. II.C, Fig. 4d)",
      concept:
        "A self-sustaining TPX powers its own LED from its PV output — no external supply. Every photon cycle " +
        "loses a fraction (1 − EQE) to non-radiative recombination, so the loop gain is roughly " +
        "EQE_LED × EQE_PV × (voltage ratio). Below a threshold EQE the loop consumes more than it makes and net " +
        "power is negative; above it, output grows explosively. That threshold sits near 90–98% — which is why " +
        "twenty years of ~90% devices produced nothing and this paper's 98% changes the game.",
      equation: "P_net > 0  ⇔  EQE_loop > V_LED / V_PV-equivalent",
      whyItMatters:
        "It reframes the EQE record as THE enabling number: Fig. 4(d)'s contour shows net power appearing only in " +
        "the top-right corner where this paper (98%) sits and previous work (≤96%) doesn't.",
      demo: {
        kind: "chart", chartKind: "line", T: 1, dt: 1,
        xLabel: "external quantum efficiency (%)", yLabel: "net power of the loop (a.u.)",
        caption: "sweep the loop's voltage ratio — the EQE threshold slides with it",
        params: [
          { key: "vr", sym: "V_r", label: "LED voltage ÷ PV output voltage", min: 0.7, max: 0.98, step: 0.01, def: 0.88, animate: true },
        ],
        computeJs: `
const x = [], p = [], zero = [];
for (let e = 80; e <= 100.001; e += 0.25) {
  x.push(+e.toFixed(2));
  const eqe = e / 100;
  p.push(+ (100 * (eqe - params.vr) * Math.exp(6 * (eqe - params.vr))).toFixed(2));
  zero.push(0);
}
return { x, series: [
  { label: "net loop power", data: p },
  { label: "break-even", data: zero },
] };`,
        insightJs: `
const thr = params.vr * 100;
return "At a voltage ratio of " + params.vr.toFixed(2) + ", the loop breaks even at EQE ≈ " + thr.toFixed(0) +
  "%. Reported far-field devices (90–96%) sit " + (thr > 96 ? "below" : "near") +
  " the cliff; the zTPX's 98% clears it with margin — hence 'self-sustaining with sizable power output'.";`,
      },
    },
  ],
  protocol: {
    T: 0.6,
    dt: 0.005,
    description:
      "The pipeline's horizontal axis is the LED VOLTAGE (0 → 0.6 V), exactly like the paper's Fig. 2–3. Reduced " +
      "generalized-Planck model of the InGaAs (E_g = 0.74 eV) LED → a-Si cavity → InGaAs PV stack, calibrated to " +
      "the paper's reported magnitudes (×320 power enhancement at 600 K, ≈17% peak efficiency for a 5-cm a-Si " +
      "spacer). Every slider feeds the same model that overlays Fig. 2(a).",
  },
  /* Reduced model, NUMERICALLY CALIBRATED against the digitized Fig. 2(a)
   * curves (RMS deviation ≈5% of range on power, ≈10% on efficiency, at the
   * paper's operating point 600 K / n=3.5 / EQE 0.98·0.96 / L=5 cm):
   *   P_rad  = C·(n²/3.5²)·(T/600)⁴·exp(qV / m·k_B·T)        C=2.66e-3, m=1.37
   *   P_PV   = P_rad·η_PV·f_h                                 f_h=0.42
   *   P_LED  = P_PV·exp((V−V*)/w)   V* = 0.84·η_LED·η_PV·E_g  w=0.055 V
   *   η      = (P_PV−P_LED)/(P_rad·h + c/L)                   h=1.36, c=8
   * m>1 absorbs photon recycling + above-gap spectral weighting of the full
   * fluctuational-electrodynamics stack; V* is the collapse voltage where the
   * pump's electrical bill catches the harvest — it moves with both EQEs. */
  blocks: [
    {
      key: "emit",
      plain: "First lever: bias the LED. Every extra tenth of a volt multiplies the photon output ~5×, because the voltage acts like a chemical potential pushing photons out. This block is the raw photon firehose, before any losses.",
      title: "LED emission — generalized Planck with voltage boost",
      equation: "P_rad(V) = C · n²/3.5² · (T/600 K)⁴ · e^{qV / m·k_B·T},  m ≈ 1.37 (photon recycling)",
      params: [
        { key: "TLED", sym: "T", label: "LED temperature (K)", min: 400, max: 900, step: 10, def: 600 },
        { key: "nSpacer", sym: "n", label: "Spacer refractive index", min: 1.0, max: 3.8, step: 0.05, def: 3.5 },
      ],
      theory:
        "Sec. II.A: the LED's photon emission follows the generalized Planck law — thermal emission multiplied by " +
        "exp(qV/k_BT) through the quasi-Fermi-level splitting. The zero-gap cavity multiplies the flux again by " +
        "≈n² by unlocking modes beyond the total-internal-reflection cone. The effective ideality m ≈ 1.37 " +
        "absorbs photon recycling and the above-gap spectral weighting of the full simulation; C = 2.66×10⁻³ W/m² " +
        "is calibrated so the traced Fig. 2(a) power curve is reproduced within ≈5% RMS across its 5.5 decades.",
      pythonCode: `import numpy as np
kB = 8.617e-5            # eV/K
V = np.arange(0, 0.6+0.005, 0.005)
def p_rad(V, T=600.0, n=3.5):
    C, m = 2.66e-3, 1.37     # calibrated to the digitized Fig. 2(a)
    return C*(n**2/3.5**2)*(T/600)**4*np.exp(V/(m*kB*T))`,
      computeJs: `
const kB = 8.617e-5, m = 1.37;
const out = new Array(helpers.n);
for (let i = 0; i < helpers.n; i++) {
  const V = helpers.t[i];
  out[i] = 2.66e-3 * (params.nSpacer * params.nSpacer / 12.25) * Math.pow(params.TLED / 600, 4) *
    Math.exp(V / (m * kB * params.TLED));
}
return out;`,
    },
    {
      key: "cost",
      plain: "Nothing is free: pushing photons out of the LED costs electrical power, and that bill explodes as the bias approaches the collapse voltage V* — the point where the pump starts eating its own harvest. Higher EQE pushes V* later; that's the whole game.",
      title: "LED electrical input — the cost of pumping",
      equation: "P_LED = P_PV · e^{(V − V*)/w},   V* = 0.84 · η_LED · η_PV · E_g,   w ≈ 0.055 V",
      params: [
        { key: "EQEled", sym: "η_LED", label: "LED external quantum efficiency", min: 0.80, max: 0.999, step: 0.001, def: 0.98 },
      ],
      theory:
        "Each emitted photon extracts ≈qV of electrical work from the bias supply; non-radiative recombination " +
        "inflates that by 1/EQE, and near flat-band the injection cost outruns the exponential emission gain. The " +
        "reduced model compresses all of that into a collapse voltage V* = 0.84·η_LED·η_PV·E_g ≈ 0.585 V at the " +
        "paper's EQEs — exactly where the traced Fig. 2(a) curves dive. Drop η_LED to 0.90 and watch V* (and the " +
        "whole power peak) slide left: that IS the two-decade TPX stall, on one slider.",
      pythonCode: `def p_led(V, p_pv, eqe_led=0.98, eqe_pv=0.96, Eg=0.74, w=0.055):
    v_star = 0.841*eqe_led*eqe_pv*Eg   # collapse voltage
    return p_pv*np.exp((V - v_star)/w)`,
      computeJs: `
// input = P_rad from the emit block. The bill is expressed against the harvest
// P_PV = P_rad·η_PV·f_h so that P_PV − P_LED collapses at V = V*.
const Eg = 0.74, w = 0.055, fh = 0.42;
const vStar = 0.841 * params.EQEled * params.EQEpv * Eg;
const out = new Array(helpers.n);
for (let i = 0; i < helpers.n; i++) {
  const V = helpers.t[i];
  out[i] = input[i] * params.EQEpv * fh * Math.exp((V - vStar) / w);
}
return out;`,
    },
    {
      key: "pv",
      plain: "The harvest: every photon that crosses the cavity dumps an electron-hole pair into the PV cell, which sells it back as electricity. Index matching means almost every photon makes the crossing — the harvest tracks the firehose at a fixed exchange rate.",
      title: "PV conversion — harvesting the cavity flux",
      equation: "P_PV = P_rad · η_PV · f_h,   f_h ≈ 0.42 (delivered-and-sold fraction, calibrated)",
      params: [
        { key: "EQEpv", sym: "η_PV", label: "PV external quantum efficiency", min: 0.85, max: 0.99, step: 0.005, def: 0.96 },
      ],
      theory:
        "Sec. II.B–C: the InGaAs cell (same n = 3.8 index family) absorbs the concentrated above-gap flux; the " +
        "cavity's <2% interfacial reflectance is what keeps the delivered fraction — and with it the loop EQE — " +
        "near its record 98%. f_h bundles the maximum-power-point voltage (≈0.8·E_g at high injection) with the " +
        "sub-gap recycling losses; it is calibrated so the model rides the digitized Fig. 2(a) curve.",
      pythonCode: `def p_pv(p_rad, eqe_pv=0.96, fh=0.42):
    return p_rad*eqe_pv*fh`,
      computeJs: `
// input = P_LED from the cost block; recompute P_rad from params (blocks are
// pure functions of the shared parameter set).
const kB = 8.617e-5, m = 1.37;
const out = new Array(helpers.n);
for (let i = 0; i < helpers.n; i++) {
  const V = helpers.t[i];
  const prad = 2.66e-3 * (params.nSpacer * params.nSpacer / 12.25) * Math.pow(params.TLED / 600, 4) *
    Math.exp(V / (m * kB * params.TLED));
  out[i] = prad * params.EQEpv * 0.42;
}
return out;`,
    },
    {
      key: "net",
      plain: "The bottom line: PV harvest minus LED bill, divided by all the heat you spent — including the heat quietly leaking down the solid spacer. Long spacer = small leak. This curve peaking and collapsing is the paper's Fig. 2(a) in miniature.",
      title: "Net output & the conduction tax (headline)",
      equation: "η = (P_PV − P_LED) / (P_rad·h + c/L),   h ≈ 1.36, c ≈ 8 W·cm/m²",
      params: [
        { key: "Lsp", sym: "L", label: "Spacer length (cm)", min: 1, max: 40, step: 1, def: 5 },
      ],
      theory:
        "Sec. II.B: the solid spacer conducts κΔT/L of parasitic heat from the hot to the cold side. An a-Si rod " +
        "longer than ~1 cm keeps that tax below the radiative transfer, which is why Fig. 3 shows efficiency " +
        "climbing with spacer length and why zTPX beats far-field at every temperature once L ≥ 1 cm. h·P_rad is " +
        "the radiative heat actually drawn from the hot side per unit emitted flux; c/L is the conduction leak.",
      pythonCode: `def efficiency(p_pv, p_led, p_rad, L_cm=5.0, h=1.36, c=8.0):
    p_net = p_pv - p_led
    q_cond = c/L_cm                # W/m^2 — absolute conduction leak, ∝ 1/L
    return 100*p_net/(p_rad*h + q_cond)`,
      computeJs: `
// efficiency (%) = net electrical output / (radiative heat drawn + conduction
// leak through the spacer). The conduction term is an ABSOLUTE flux ∝ 1/L —
// that's why efficiency rises with voltage (output outgrows the fixed leak)
// and with spacer length, matching the family of curves in Fig. 3(a).
const kB = 8.617e-5, m = 1.37, Eg = 0.74, w = 0.055, fh = 0.42, h = 1.36, c = 8;
const out = new Array(helpers.n);
const vStar = 0.841 * params.EQEled * params.EQEpv * Eg;
for (let i = 0; i < helpers.n; i++) {
  const V = helpers.t[i];
  const prad = 2.66e-3 * (params.nSpacer * params.nSpacer / 12.25) * Math.pow(params.TLED / 600, 4) *
    Math.exp(V / (m * kB * params.TLED));
  const ppv = prad * params.EQEpv * fh;
  const pled = ppv * Math.exp((V - vStar) / w);
  const eta = 100 * (ppv - pled) / (prad * h + c / params.Lsp);
  out[i] = Math.max(-5, Math.min(60, eta));
}
return out;`,
    },
  ],
  resultFigures: [
    {
      figureLabel: "FIG. 2",
      page: 4,
      image: FIG("zt-fig2"),
      title: "The enhanced power density and efficiency of the zTPX",
      explanation:
        "The core result. (a,b) Power density (red, log axis) and efficiency (blue) versus LED voltage — solid = " +
        "zero-gap, dashed = far-field — for a-Si (600 K) and GaAs (700 K) spacers: at matched conditions the zTPX " +
        "delivers ×320 (a-Si) and ×150 (GaAs) more power. (c) The power-enhancement ratio across LED temperature " +
        "for four spacer materials — it tracks the index (a-Si n≈3.5 → hundreds; glass n≈1.4 → single digits). " +
        "(d) The equivalent-temperature reading: a 600 K zTPX makes as much power as a 1000–1100 K far-field " +
        "device. The first panel overlays the LIVE reduced model (dashed) on the digitized paper curve — move any " +
        "pipeline slider and watch it respond.",
      hotspots: [
        { x: 0.33, y: 0.2, label: "×320 at one bias", note: "At 0.5 V and 600 K the zero-gap curve rides ~2.5 decades above far-field — the n² cavity plus the higher usable bias point." },
        { x: 0.3, y: 0.42, label: "the collapse past 0.55 V", note: "Push the bias too close to the band gap and the LED's electrical cost outruns the PV harvest — every curve dives. The live model reproduces this cliff." },
        { x: 0.25, y: 0.75, label: "index sets the prize", note: "Panel (c): a-Si and GaAs (n ≈ 3.3–3.5) buy 100–2000×; glass (n ≈ 1.4) only ~10× — the enhancement IS the refractive index at work." },
      ],
      panels: [
        {
          subplotLabel: "a · Power density vs LED voltage (a-Si, 600 K) — live model chases the paper",
          xLabel: "LED voltage (V)", yLabel: "log₁₀ power density (W/m²)",
          chartKind: "line",
          digitized: {
            source: "traced off FIG. 2(a): solid = zTPX, dashed = far-field TPX (log₁₀ W/m²)",
            series: [
              { label: "zTPX (paper)", color: COL.power, points: [[0, -3.05], [0.05, -2.72], [0.1, -2.4], [0.15, -2.07], [0.2, -1.75], [0.25, -1.42], [0.3, -1.1], [0.35, -0.77], [0.4, -0.45], [0.44, -0.2], [0.48, 0.05], [0.52, 0.28], [0.545, 0.3], [0.56, 0.1], [0.575, -0.8], [0.585, -2.2]] },
              { label: "far-field TPX (paper)", color: "#e08283", points: [[0, -5.4], [0.05, -5.05], [0.1, -4.7], [0.15, -4.35], [0.2, -4.0], [0.25, -3.68], [0.3, -3.42], [0.33, -3.35], [0.36, -3.42], [0.39, -3.75], [0.41, -4.4], [0.43, -5.6]] },
            ],
          },
          computeJs: `
const x = [], y = [];
for (let i = 0; i < helpers.n; i++) {
  x.push(helpers.t[i]);
  y.push(Math.log10(Math.max(1e-6, outputs.pv[i] - outputs.cost[i])));
}
return { x, series: [ { label: "reduced model P_net", data: y } ] };`,
        },
        {
          subplotLabel: "a · Efficiency vs LED voltage (a-Si, 600 K)",
          xLabel: "LED voltage (V)", yLabel: "efficiency (%)",
          chartKind: "line",
          computeJs: `
return { x: [...helpers.t], series: [ { label: "reduced model η", data: [...outputs.net] } ] };`,
          digitized: {
            source: "traced off FIG. 2(a), right axis: solid = zTPX, dashed = far-field",
            series: [
              { label: "zTPX (paper)", color: COL.eff, points: [[0, 0], [0.1, 0.7], [0.2, 2.2], [0.3, 5.2], [0.35, 7.6], [0.4, 10.5], [0.45, 13.8], [0.5, 16.4], [0.52, 17.0], [0.545, 15.5], [0.56, 9], [0.575, 0]] },
              { label: "far-field (paper)", color: "#7f9bd1", points: [[0, 0], [0.1, 1.1], [0.15, 2.6], [0.2, 5.0], [0.25, 8.0], [0.28, 9.7], [0.3, 10.0], [0.33, 9.0], [0.36, 6.2], [0.39, 2.5], [0.42, 0]] },
            ],
          },
        },
        {
          subplotLabel: "c · Power-enhancement ratio vs LED temperature (log₁₀)",
          xLabel: "LED temperature (K)", yLabel: "log₁₀ enhancement ratio",
          chartKind: "line",
          digitized: {
            source: "traced off FIG. 2(c) — four spacer materials, log axis",
            series: [
              { label: "a-Si (n≈3.5)", color: COL.aSi, points: [[400, 3.35], [500, 2.92], [600, 2.51], [700, 2.22], [800, 2.05], [900, 1.94]] },
              { label: "GaAs (n≈3.3)", color: COL.GaAs, points: [[400, 3.28], [500, 2.86], [600, 2.45], [700, 2.17], [800, 2.0], [900, 1.9]] },
              { label: "ZnSe (n≈2.5)", color: COL.ZnSe, points: [[400, 2.73], [500, 2.4], [600, 2.1], [700, 1.9], [800, 1.75], [900, 1.62]] },
              { label: "glass (n≈1.4)", color: COL.Glass, points: [[400, 1.0], [500, 0.93], [600, 0.83], [700, 0.72], [800, 0.64], [900, 0.58]] },
            ],
          },
        },
        {
          subplotLabel: "d · Equivalent far-field emitter temperature",
          xLabel: "fTPX emitter temperature (K)", yLabel: "equivalent zTPX temperature (K)",
          chartKind: "line",
          digitized: {
            source: "traced off FIG. 2(d) — the zTPX temperature that matches a far-field device's power",
            series: [
              { label: "a-Si", color: "#c0392b", points: [[500, 420], [700, 468], [900, 538], [1100, 600]] },
              { label: "GaAs", color: "#27ae60", points: [[500, 415], [700, 462], [900, 530], [1100, 594]] },
              { label: "ZnSe", color: "#29abe2", points: [[500, 436], [700, 502], [900, 590], [1100, 668]] },
              { label: "glass", color: "#1f3a93", points: [[500, 468], [700, 600], [900, 752], [1100, 898]] },
              { label: "no advantage (y = x)", color: "#999", points: [[500, 500], [1100, 1100]] },
            ],
          },
        },
      ],
    },
    {
      figureLabel: "FIG. 3",
      page: 5,
      image: FIG("zt-fig3"),
      title: "The conduction effect — how long must the spacer be?",
      explanation:
        "The solid spacer's one drawback: it conducts heat. (a,b) Efficiency vs LED voltage for a-Si (600 K) and " +
        "GaAs (700 K) spacers of different lengths — every zero-gap curve beats the far-field dashed curve once " +
        "the spacer passes ~1 cm (a-Si) or ~20 cm (GaAs, whose crystalline κ is ~30× higher). (c,d) Efficiency vs " +
        "LED temperature: the family of solid curves climbs from the far-field floor toward the zero-conduction " +
        "ceiling as the spacer lengthens. The 'conduction tax' κΔT/L is exactly the slider L in the pipeline — " +
        "drag it and watch the Fig. 2(a) model shift.",
      hotspots: [
        { x: 0.28, y: 0.22, label: "10 cm ≈ 18.3%", note: "The longest a-Si spacer nearly reaches the zero-conduction ceiling — conduction loss ∝ 1/L becomes negligible." },
        { x: 0.22, y: 0.35, label: "far-field peaks EARLY", note: "The dashed far-field curve peaks near 0.28 V, far below the zero-gap optimum near 0.42–0.52 V — the cavity lets you exploit higher bias." },
        { x: 0.3, y: 0.72, label: "the whole family beats far-field", note: "Panel (c): even the 1-cm a-Si spacer edges the dashed far-field curve at every temperature from 400–900 K." },
      ],
      panels: [
        {
          subplotLabel: "a · Efficiency vs voltage — a-Si spacer lengths (600 K)",
          xLabel: "LED voltage (V)", yLabel: "efficiency (%)",
          chartKind: "line",
          digitized: {
            source: "traced off FIG. 3(a): spacer thicknesses 1/2/5/10 cm vs far-field (dashed)",
            series: [
              { label: "10 cm", color: "#1a1a1a", points: [[0, 0], [0.1, 1.2], [0.2, 3.8], [0.3, 8.6], [0.35, 12], [0.38, 15.5], [0.42, 18.3], [0.47, 17], [0.52, 12], [0.56, 3], [0.575, 0]] },
              { label: "5 cm", color: "#555", points: [[0, 0], [0.1, 1.0], [0.2, 3.2], [0.3, 7.4], [0.36, 11], [0.41, 14.5], [0.44, 16.2], [0.49, 14.5], [0.54, 8], [0.575, 0]] },
              { label: "2 cm", color: "#8a8a8a", points: [[0, 0], [0.1, 0.8], [0.2, 2.5], [0.3, 5.8], [0.38, 10], [0.43, 12.9], [0.47, 12], [0.53, 6], [0.575, 0]] },
              { label: "1 cm", color: "#b5b5b5", points: [[0, 0], [0.1, 0.6], [0.2, 2.0], [0.3, 4.7], [0.4, 8.6], [0.45, 10.4], [0.5, 8.8], [0.55, 3], [0.575, 0]] },
              { label: "far-field", color: COL.ff, points: [[0, 0], [0.1, 1.1], [0.2, 5.0], [0.25, 8.0], [0.29, 10.0], [0.33, 9.0], [0.37, 5.5], [0.42, 0]] },
            ],
          },
        },
        {
          subplotLabel: "c · Efficiency vs LED temperature — a-Si spacer family",
          xLabel: "LED temperature (K)", yLabel: "efficiency (%)",
          chartKind: "line",
          digitized: {
            source: "traced off FIG. 3(c): zero-conduction ceiling, 10/5/2/1-cm spacers, far-field floor",
            series: [
              { label: "zero conduction", color: "#1f3a93", points: [[400, 1.5], [500, 8], [600, 16], [700, 25], [800, 33], [900, 40.5]] },
              { label: "10 cm", color: "#1a1a1a", points: [[400, 1.2], [500, 7], [600, 14.5], [700, 23], [800, 31], [900, 38.5]] },
              { label: "5 cm", color: "#555", points: [[400, 1.0], [500, 6.2], [600, 13.2], [700, 21.5], [800, 29], [900, 36.5]] },
              { label: "2 cm", color: "#7ca7d8", points: [[400, 0.8], [500, 5.2], [600, 11.5], [700, 19], [800, 26.5], [900, 33.5]] },
              { label: "1 cm", color: "#a8c4e0", points: [[400, 0.6], [500, 4.5], [600, 10.2], [700, 17.2], [800, 24.5], [900, 31.5]] },
              { label: "far-field", color: COL.ff, points: [[400, 0.4], [500, 3.8], [600, 9.2], [700, 15.8], [800, 22.5], [900, 29]] },
            ],
          },
        },
      ],
    },
    {
      figureLabel: "FIG. 4",
      page: 6,
      image: FIG("zt-fig4"),
      title: "Index matching, the 98% EQE record, and the self-sustaining regime",
      explanation:
        "Why the design generalizes and what it unlocks. (a) The radiation enhancement across emitter and spacer " +
        "indices: the hot corner needs BOTH high — matching the PV cell's n ≈ 3.8 — and low emitter extinction; " +
        "the reproduced map applies the paper's index-matching rule. (b) Spectral EQE: the zero-gap stack holds " +
        "≈98% across the whole above-gap band while the far-field device oscillates around 70% on interference " +
        "fringes. (c) That 98% tops every reported far-field TPV. (d) In the self-sustaining power map, net output " +
        "exists only at the top-right EQE corner — where this work sits and previous records don't.",
      hotspots: [
        { x: 0.3, y: 0.2, label: "the matching corner", note: "Enhancement peaks when emitter AND spacer indices reach the PV's 3.8 — and dies if the emitter is lossy (high k_e quadrants)." },
        { x: 0.75, y: 0.18, label: "98% across the band", note: "The zero-gap EQE (red/blue) is flat at ≈0.98 from the band edge up — no interference fringes because there are no index steps to reflect from." },
        { x: 0.8, y: 0.78, label: "self-sustainability lives here", note: "Panel (d): net power only exists in the top-right corner of the LED-EQE × PV-EQE plane. 'This work' sits inside it; Refs. 16–17 do not." },
      ],
      panels: [
        {
          subplotLabel: "a · Radiation enhancement vs emitter & spacer index (k_e → 0)",
          xLabel: "n_emitter", yLabel: "n_spacer",
          chartKind: "heatmap",
          digitized: {
            kind: "heatmap", badge: "paper's rule",
            source: "computed from the paper's index-matching rule (enhancement ≈ min(n_emitter, n_spacer, n_PV)², n_PV = 3.8) — the low-extinction quadrant of FIG. 4(a)",
            rows: [...N_AXIS].reverse().map((n) => n.toFixed(1)),
            cols: N_AXIS.map((n) => n.toFixed(1)),
            min: 0, max: 24, palette: JET, grid: ENH_GRID,
          },
        },
        {
          subplotLabel: "b · Spectral EQE — zero-gap ≈98% vs far-field ≈70%",
          xLabel: "photon energy (eV)", yLabel: "external quantum efficiency",
          chartKind: "line",
          digitized: {
            source: "traced off FIG. 4(b): zero-gap a-Si and GaAs spacers vs the gap-integrated far-field stack",
            series: [
              { label: "zero gap · a-Si", color: "#c0392b", points: [[0.75, 0.9], [0.78, 0.975], [0.85, 0.98], [0.95, 0.981], [1.05, 0.982], [1.15, 0.982], [1.3, 0.983]] },
              { label: "zero gap · GaAs", color: "#1f3a93", points: [[0.75, 0.88], [0.78, 0.968], [0.85, 0.972], [0.95, 0.975], [1.05, 0.976], [1.15, 0.977], [1.3, 0.978]] },
              { label: "far field", color: "#3d6b35", points: [[0.75, 0.42], [0.77, 0.75], [0.8, 0.68], [0.85, 0.63], [0.9, 0.72], [0.95, 0.69], [1.0, 0.7], [1.1, 0.69], [1.2, 0.7], [1.3, 0.71]] },
            ],
          },
        },
        {
          subplotLabel: "c · EQE vs reported far-field TPVs — the record",
          xLabel: "device", yLabel: "external quantum efficiency",
          chartKind: "bar",
          digitized: {
            kind: "groupedBar", badge: "paper's numbers",
            source: "FIG. 4(c) — comparison of the zTPV EQE with reported far-field values",
            colors: { "EQE": "#29abe2" },
            groups: [
              ["Ref. 15", 0.875], ["Ref. 46", 0.80], ["Ref. 4", 0.70], ["Ref. 3", 0.75], ["Ref. 47", 0.78],
              ["Ref. 48", 0.85], ["Ref. 1", 0.68], ["Ref. 49", 0.78], ["Ref. 6", 0.73], ["Present", 0.98],
            ].map(([name, v]) => ({ name, bars: [{ label: "EQE", value: v }] })),
          },
        },
      ],
    },
  ],
  explorables: [
    {
      title: "The n² dividend — pick your spacer",
      basis: "equation",
      story:
        "The cavity's photon gain is ≈min(n_emitter, n_spacer, n_PV)² — the spacer only helps up to the smallest " +
        "index in the chain. Slide a hypothetical spacer index across the paper's four candidates (glass 1.4, " +
        "ZnSe 2.5, GaAs 3.3, a-Si 3.5) and watch the gain — then remember the OTHER axis: high-index solids that " +
        "are also infrared-transparent are rare, which is why a-Si is the paper's winner.",
      source: "Sec. II.C index-matching analysis; FIG. 2(c)",
      demo: {
        kind: "chart", chartKind: "line", T: 1, dt: 1,
        xLabel: "spacer refractive index", yLabel: "flux enhancement (×, propagating modes)",
        caption: "sweep the spacer index — the gain saturates at the PV's n = 3.8",
        params: [
          { key: "ns", sym: "n_s", label: "Your spacer index", min: 1, max: 5, step: 0.05, def: 3.5, animate: true },
        ],
        computeJs: `
const x = [], gain = [], marks = [];
for (let n = 1; n <= 5.001; n += 0.05) {
  x.push(+n.toFixed(2));
  gain.push(+Math.pow(Math.min(n, 3.8), 2).toFixed(2));
  marks.push(+Math.pow(Math.min(params.ns, 3.8), 2).toFixed(2));
}
return { x, series: [
  { label: "enhancement ≈ min(n, 3.8)²", data: gain },
  { label: "your spacer", data: marks },
] };`,
        insightJs: `
const g = Math.pow(Math.min(params.ns, 3.8), 2);
const mat = params.ns < 1.9 ? "glass territory (n≈1.4 ⇒ ×2)" : params.ns < 2.9 ? "ZnSe territory (n≈2.5 ⇒ ×6)" : params.ns < 3.45 ? "GaAs territory (n≈3.3 ⇒ ×11)" : "a-Si territory (n≈3.5 ⇒ ×12)";
return "n = " + params.ns.toFixed(2) + " ⇒ ×" + g.toFixed(1) + " propagating-mode gain — " + mat +
  (params.ns > 3.8 ? ". Beyond the PV's 3.8 nothing more is gained: the cell itself becomes the bottleneck." : ".");`,
      },
    },
    {
      title: "Replace a furnace with a warm LED",
      basis: "reported",
      story:
        "Fig. 2(d)'s punchline as a dial: pick the far-field emitter temperature you'd otherwise need, and read " +
        "off the zTPX temperature that makes the SAME power with an a-Si spacer — the paper's traced curve. A " +
        "1100 K far-field furnace collapses to a 600 K zero-gap device; that's the difference between exotic " +
        "high-temperature LEDs and ones you can buy.",
      source: "FIG. 2(d), a-Si curve (traced)",
      demo: {
        kind: "chart", chartKind: "line", T: 1, dt: 1,
        xLabel: "far-field emitter temperature (K)", yLabel: "equivalent zTPX temperature (K)",
        caption: "sweep the far-field temperature you want to replace",
        params: [
          { key: "tf", sym: "T_ff", label: "Far-field temperature to match (K)", min: 500, max: 1100, step: 10, def: 1000, animate: true },
        ],
        computeJs: `
const A = [[500, 420], [600, 442], [700, 468], [800, 500], [900, 538], [1000, 568], [1100, 600]];
const x = [], z = [], same = [];
for (const [tf, tz] of A) { x.push(tf); z.push(tz); same.push(tf); }
return { x, series: [
  { label: "zTPX equivalent (a-Si, paper)", data: z },
  { label: "no advantage (y = x)", data: same },
] };`,
        insightJs: `
const A = [[500, 420], [600, 442], [700, 468], [800, 500], [900, 538], [1000, 568], [1100, 600]];
let best = A[0];
for (const p of A) if (Math.abs(p[0] - params.tf) < Math.abs(best[0] - params.tf)) best = p;
return "A far-field TPX at " + best[0] + " K is matched by a zero-gap device at only ≈" + best[1] +
  " K — " + (best[0] - best[1]) + " K cooler. Below ~800 K high-performance InGaAs LEDs are routine; above it they degrade fast.";`,
      },
    },
    {
      title: "Cross the self-sustaining line",
      basis: "equation",
      story:
        "The two-decade blocker, on one slider. In a self-sustaining circuit the PV must pay the LED's whole bill " +
        "through the loop efficiency EQE_LED × EQE_PV. Sweep the loop EQE and watch net power switch sign near " +
        "≈96% — then note where the reported far-field record (~96%) and this paper's zero-gap 98% sit. Two " +
        "percentage points of EQE are the difference between a curiosity and a generator.",
      source: "FIG. 4(d) — power density of self-sustaining zTPX vs EQE",
      demo: {
        kind: "chart", chartKind: "line", T: 1, dt: 1,
        xLabel: "loop EQE (%)", yLabel: "self-sustaining net power (a.u.)",
        caption: "sweep the loop EQE across the break-even cliff",
        params: [
          { key: "eqe", sym: "η", label: "Your loop EQE (%)", min: 88, max: 99.5, step: 0.1, def: 98, animate: true },
        ],
        computeJs: `
const thr = 95.8;
const x = [], p = [], zero = [], yours = [];
for (let e = 88; e <= 99.51; e += 0.1) {
  x.push(+e.toFixed(1));
  p.push(+ ((e - thr) * Math.exp(0.55 * Math.max(0, e - thr))).toFixed(2));
  zero.push(0);
  yours.push(+ ((params.eqe - thr) * Math.exp(0.55 * Math.max(0, params.eqe - thr))).toFixed(2));
}
return { x, series: [
  { label: "net power of the loop", data: p },
  { label: "break-even", data: zero },
  { label: "your EQE", data: yours },
] };`,
        insightJs: `
const thr = 95.8;
const d = params.eqe - thr;
return params.eqe < thr
  ? "At " + params.eqe.toFixed(1) + "% the loop consumes more than it makes (" + Math.abs(d).toFixed(1) + " points below break-even) — this is where every far-field device lived for 20 years."
  : "At " + params.eqe.toFixed(1) + "% the loop nets positive power, " + d.toFixed(1) + " points above break-even — the zTPX's 98% sits here WITH margin, which is why its self-sustaining circuit produces sizable output.";`,
      },
    },
  ],
};
