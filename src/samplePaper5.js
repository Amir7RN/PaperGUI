/**
 * Fifth bundled sample — a NANOSCALE THERMAL PHYSICS experiment, in the same
 * PaperSpec format the analyzer produces.
 *
 * Paper: Yelishala, Zhu, Martinez, Chen, Habibi, Prampolini, Cuevas, Zhang,
 * Vilhena, Cui — "Phonon interference in single-molecule junctions",
 * Nature Materials 24, 1258–1264 (2025).
 *
 * The results are picowatt-level measurements on a custom scanning thermal
 * probe plus quantum-mechanically-derived MD simulations — nothing a browser
 * can honestly re-run, so archetype.pipelineFeasible is false. The paper ships
 * its per-figure Source Data, so every interactive panel below plots the
 * AUTHORS' OWN numbers (conductance traces, histograms, phonon DOS, spectral
 * heat currents, transmission kernels) extracted from those workbooks by
 * scripts/extract-source-data.mjs (see src/samplePaper5Data.js).
 */

import {
  F2A, F2B, F2C, F2D, F3META, F3PARA, F3D, F3E, F4B, F4C, F4C_INSET, F4D, F4E,
} from "./samplePaper5Data.js";

const BASE = (typeof import.meta !== "undefined" && import.meta.env) ? import.meta.env.BASE_URL : "/";
const FIG = (name) => `${BASE}figs/${name}.jpg`;

/* the original figures' own colors */
const COL = {
  elec: "#5b4bc4",      // Ge traces (blue-violet)
  therm: "#e34948",     // Gth traces (red)
  band: "#c9c2ea",      // ±1 s.d. bands
  bandT: "#f2b7b6",
  metaHist: "#7c5cbf",  // Fig 3d meta (purple)
  paraHist: "#2ab7c9",  // Fig 3d para (cyan)
  metaTherm: "#f08573", // Fig 3e meta (salmon)
  paraTherm: "#a33a3a", // Fig 3e para (dark red)
  meta4: "#e0532f",     // Fig 4 meta (orange-red)
  para4: "#14929c",     // Fig 4 para (teal)
};

const traceSeries = (d, useLogE) => ([
  { label: "thermal conductance (pW/K)", color: COL.therm, points: d.th },
  { label: "±1 s.d. band edge", color: COL.bandT, points: d.th.map((p, i) => [p[0], +(p[1] + (d.thErr[i]?.[1] || 0)).toFixed(2)]) },
  ...(useLogE
    ? [{ label: "electrical conductance log₁₀(G/G₀)", color: COL.elec, points: d.elLog }]
    : []),
]);

export const SAMPLE_SPEC_5 = {
  meta: {
    title: "Phonon interference in single-molecule junctions",
    authors: "S. C. Yelishala, Y. Zhu, P. M. Martinez, H. Chen, M. Habibi, G. Prampolini, J. C. Cuevas, W. Zhang, J. G. Vilhena, L. Cui",
    venue: "Nature Materials, Vol. 24, 1258–1264 (August 2025)",
    abstract:
      "Wave interference gives coherent control over electrons and photons, but interference of phonons — the heat " +
      "carriers of every electrical insulator — had never been cleanly observed at the molecular scale. Using " +
      "custom twin-tip scanning thermal probes able to resolve picowatt heat flows through ONE molecule at room " +
      "temperature, the authors compare two isomers of the same molecule (OPE3): connect its centre ring in the " +
      "para configuration and heat flows freely; connect it meta and destructive phonon interference cuts the " +
      "thermal conductance by ≈50% (≈17 vs ≈28 pW/K). Quantum-mechanically accurate molecular-dynamics " +
      "simulations trace the difference to antiresonances in the phonon transmission through the molecular " +
      "backbone — proof that phase-coherent heat transport survives at 300 K.",
  },
  archetype: {
    kind: "empirical-physics",
    pipelineFeasible: false,
    reproductionAdvice:
      "The results are picowatt calorimetry on custom probes plus QM-derived MD simulation — not browser-computable. " +
      "But the paper publishes its full Source Data, so every panel here replots the authors' OWN traces, histograms " +
      "and spectra. The honestly-simulatable pieces — probe thermometry, break-junction statistics, two-path wave " +
      "interference, the Wiedemann–Franz check — are the interactive foundations and explorables.",
  },
  story: {
    problem:
      "Heat in insulators travels as phonons — vibration waves. Waves can interfere: two paths can cancel each other " +
      "exactly. That cancellation is routine to observe for electrons and light, but for heat it was never cleanly " +
      "seen in a molecule, because measuring the ~30 picowatts flowing through ONE molecule at room temperature is " +
      "brutally hard: thermal drift, contact variation and radiation all swamp the signal.",
    gap:
      "Previous single-molecule thermal experiments could only average hundreds of junction traces, blurring " +
      "junction-to-junction variation — and 'static' quantum-transport theory predicted interference features that " +
      "nobody could verify at room temperature, where contact dynamics might wash them out entirely.",
    contribution: [
      {
        headline: "A thermometer for one molecule",
        detail:
          "A twin-tip niobium-nitride scanning thermal probe: two geometrically identical beams, one touching the " +
          "molecule and one tracking drift, read differentially through a Wheatstone bridge. High stiffness AND " +
          "~0.7×10⁶ K/W thermal resistance — sensitive enough to resolve single-junction ruptures in real time.",
      },
      {
        headline: "Isomers as an interference switch",
        detail:
          "Two OPE3 molecules identical except for the centre-ring connection: para (straight through) vs meta " +
          "(offset). Electrically the meta junction conducts ~10× less (a known electron-interference effect); " +
          "thermally it conducts ≈50% less — the phonon version of the same destructive interference.",
      },
      {
        headline: "Room-temperature theory that includes the mess",
        detail:
          "Quantum-mechanically derived force fields feed non-equilibrium MD that keeps anharmonicity, contact " +
          "dynamics and finite temperature. The computed transmission kernels show antiresonances at ~60 and " +
          "~80 cm⁻¹ that survive in meta-OPE3 but are quenched by contact dynamics in para-OPE3.",
      },
    ],
    whyItMatters:
      "If phonons interfere at room temperature, heat can be engineered wave-by-wave: molecular heat rectifiers, " +
      "thermal transistors, and coatings that block heat without blocking electricity all become design problems " +
      "instead of dreams.",
  },
  mindmap: {
    nodes: [
      { id: "paper", label: "Phonon interference, one molecule", kind: "paper",
        detail: "First clean observation of destructive phonon interference in single-molecule junctions at room temperature: meta-OPE3 conducts ≈50% less heat than para-OPE3." },
      { id: "prob", label: "Picowatt heat, one molecule", kind: "problem",
        detail: "A single molecular junction passes ~30 pW. Resolving that at 300 K against drift, radiation and contact noise defeated previous probes." },
      { id: "prior1", label: "Electron quantum interference", kind: "prior",
        detail: "Meta- vs para-connected rings are a classic electron-interference switch (~10× conductance ratio) — this paper asks whether phonons do the same." },
      { id: "prior2", label: "Static phonon-transport theory", kind: "prior",
        detail: "NEGF-style calculations predicted antiresonances in molecular phonon transmission, but assumed frozen geometries — untested at room temperature." },
      { id: "m1", label: "Twin-tip NbN SThM probe", kind: "method",
        detail: "Two identical beams (measure + drift reference) with NbN thermometers in a Wheatstone bridge; R_th ≈ 0.7×10⁶ K/W turns picowatts into readable micro-kelvins." },
      { id: "m2", label: "Break-junction histograms", kind: "method",
        detail: "Thousands of make-and-break cycles; the conductance step at each rupture is one molecule's signature, and histograms of ~50 traces give the most-probable value." },
      { id: "m3", label: "QMD-FF simulations", kind: "method",
        detail: "Force fields fitted to quantum-mechanical Hessians drive non-equilibrium MD with anharmonicity, contact dynamics and 300 K broadening included." },
      { id: "c1", label: "50% thermal switch by geometry", kind: "contribution",
        detail: "Same atoms, different wiring: meta ≈17 pW/K vs para ≈28 pW/K — heat flow controlled by wave interference, not by mass or bonding strength." },
      { id: "res1", label: "Antiresonances at 60/80 cm⁻¹", kind: "result",
        detail: "The computed transmission kernels show destructive-interference dips that persist in meta-OPE3 across the MD trajectory — and are quenched by contact dynamics in para." },
      { id: "res2", label: "Coherence survives 300 K", kind: "result",
        detail: "Phase-coherent phonon transport is measurable at room temperature — opening molecular-scale thermal devices (rectifiers, transistors) to experiment." },
    ],
    edges: [
      { from: "prob", to: "paper", label: "motivates" },
      { from: "prior1", to: "paper", label: "inspires" },
      { from: "prior2", to: "paper", label: "tested by" },
      { from: "paper", to: "m1", label: "builds" },
      { from: "paper", to: "m2", label: "measures via" },
      { from: "paper", to: "m3", label: "explains via" },
      { from: "m2", to: "c1", label: "yields" },
      { from: "m3", to: "res1", label: "reveals" },
      { from: "c1", to: "res2", label: "implies" },
    ],
  },
  conclusion:
    "Custom twin-tip scanning thermal probes resolved the heat flow through single Au–BDA–Au (~31 pW/K) and " +
    "OPE3 junctions one molecule at a time. Meta-OPE3 conducts ≈50% less heat than para-OPE3 (≈17 vs ≈28 pW/K) " +
    "while its electrical conductance drops ~10× — and QMD-FF simulations trace both to destructive interference, " +
    "with phonon antiresonances at ~60 and ~80 cm⁻¹ that survive room-temperature contact dynamics in the meta " +
    "isomer. Phase-coherent heat transport is real, measurable, and switchable by molecular geometry at 300 K.",
  references: [
    "Yelishala, S. C. et al. Phonon interference in single-molecule junctions. Nat. Mater. 24, 1258–1264 (2025).",
    "Maldovan, M. Phonon wave interference and thermal bandgap materials. Nat. Mater. 14, 667–674 (2015).",
    "Cui, L. et al. Study of radiative heat transfer in Ångström- and nanometre-sized gaps. Nat. Commun. 8, 14479 (2017).",
    "Zen, N. et al. Engineering thermal conductance using a two-dimensional phononic crystal. Nat. Commun. 5, 3435 (2014).",
    "Kim, K. et al. Radiative heat transfer in the extreme near field. Nature 528, 387–391 (2015).",
    "Cuevas, J. C. & Scheer, E. Molecular Electronics: An Introduction to Theory and Experiment (World Scientific, 2017).",
  ],
  conceptFigures: [
    {
      title: "Fig. 1 — The twin-tip probe that reads one molecule's heat",
      image: FIG("ph-fig1"),
      explanation:
        "The instrument that makes the experiment possible. (a,b) SEM images of the twin-tip probe: two " +
        "geometrically identical silicon-oxide beams carrying niobium-nitride (NbN) resistive thermometers with " +
        "gold electrode lines; the tips are offset 20 μm in height so only the longer 'measurement' tip touches " +
        "molecules while the 'matching' tip tracks thermal drift. (c) The scheme: the heated probe (~340 K) " +
        "contacts a molecule on a room-temperature gold substrate; heat flowing through the single-molecule " +
        "junction cools the measurement tip by micro-kelvins, read differentially through a full Wheatstone " +
        "bridge. The thermal-resistance network shows why it works: the probe's R_th ≈ 0.7×10⁶ K/W converts " +
        "~30 pW into a readable temperature signal.",
    },
    {
      title: "Fig. 2 — Watching ONE molecule carry heat, live",
      image: FIG("ph-fig2"),
      explanation:
        "What a single measurement actually looks like — the paper's second core idea: no averaging. (a) A " +
        "simultaneous trace: as the piezo withdraws, the electrical conductance (blue, log scale — each " +
        "gridline is 10×) drops in molecular steps, and at the moment the LAST molecule ruptures, the thermal " +
        "trace (red) steps down too. That step height IS one molecule's thermal conductance, read in real time. " +
        "The thermal step lags the electrical one by ~10 ms — not physics, just the probe's thermal time " +
        "constant (τ ≈ 11 ms), like a thermometer catching up. (b,c) Hundreds of such traces stack into " +
        "histograms whose peaks give the reported values. Previous techniques needed to average hundreds of " +
        "low-resolution traces to see anything; the twin-tip probe's ~3 pW K⁻¹ Hz⁻¹ᐟ² noise floor resolves the " +
        "step in EVERY trace — which is what lets the paper report junction-to-junction statistics honestly.",
    },
    {
      title: "Fig. 4 — The interference fingerprint: antiresonances in transmission",
      image: FIG("ph-fig4"),
      explanation:
        "Why the effect happens, in the theory's own language. The computed phonon transmission τ(ω) through " +
        "each isomer (log scale) is the probability that a vibration at frequency ω crosses the molecule. " +
        "Meta-OPE3's curve is carved by sharp dips — antiresonances near 60 and 80 cm⁻¹ — frequencies at which " +
        "the two vibrational paths through the offset ring arrive exactly out of phase and cancel: destructive " +
        "phonon interference. Para-OPE3's paths stay in phase, so its transmission stays smooth and higher. " +
        "Integrate τ(ω) over the thermally occupied spectrum at 300 K and the missing transmission in meta " +
        "becomes the measured ≈50% conductance deficit (17 vs 28 pW/K). The key theoretical result: these " +
        "antiresonances SURVIVE room-temperature contact dynamics in meta — the interference is not washed out " +
        "by the mess of a real junction.",
    },
  ],
  /* The paper's methodology exactly as its Methods section describes it —
   * instruments, software, force fields and the governing transport formula. */
  model: {
    approach: "hybrid",
    summary:
      "A hard experiment backed by quantum-mechanically-derived simulation. Experimentally: custom-nanofabricated " +
      "twin-tip scanning thermal probes measure electrical AND thermal conductance of one molecule at a time, at " +
      "room temperature, in real time. Computationally: non-equilibrium molecular dynamics with force fields " +
      "derived from quantum chemistry reproduces the measured conductances and explains WHY — phonon " +
      "antiresonances — via a Landauer transmission analysis. Neither half stands alone: the experiment can't " +
      "see frequencies, the simulation can't be trusted without the measured 50% deficit to hit.",
    toolchain: [
      { name: "Twin-tip NbN SThM probe", role: "Custom-nanofabricated (500-µm Si wafer, 5-µm SiO₂ beams, 25-nm sputtered NbN thermometers, Cr/Au lines, deep reactive-ion etched); measurement + drift-matching tips in a full Wheatstone bridge, gain-1000 instrumentation amplifier." },
      { name: "3ω calibration", role: "Probe thermal conductance G_th,probe ≈ 1.5 µW/K and time constant τ ≈ 11 ms measured by the 3-omega method in a Janis ST-100 cryostat; NbN TCR calibrated 295–420 K with Keithley 6221 source + lock-in (Signal Recovery 7280)." },
      { name: "FEMTO DLCPA-200", role: "Variable-gain transimpedance amplifier reading the junction's tunnelling current — the electrical half of every simultaneous trace (10–50 µs rise time)." },
      { name: "LAMMPS", role: "Equilibrium MD + non-equilibrium MD (NEMD): 11,200 atoms, 0.25-fs Verlet steps, Langevin thermostats holding the gold contacts at 290 K and 330 K; heat flux tallied from thermostat energies over 40-ns runs." },
      { name: "Joyce QM-FF", role: "Quantum-mechanically derived force fields for the OPE3 isomers (DFT-parametrized via the Joyce methodology); gold via Sheng's embedded-atom model, Au–S bond via a Morse potential, INTERFACE FF for the rest." },
      { name: "SCUFF-EM", role: "Boundary-element fluctuational-electrodynamics solver used to compute the near-field radiation background between tip and substrate (~200 pW/K at 1–2 nm) and confirm it stays constant during a trace — so it subtracts out." },
    ],
    equations: [
      {
        name: "Landauer heat current",
        eq: "G_th·ΔT = (ΔT/2π) ∫ dω · ℏω · τ(ω) · dn(ω)/dT",
        source: "Methods, 'Landauer phonon transmission function'",
        plain:
          "The phonon analogue of Landauer's conduction formula: the heat current is every vibration frequency's " +
          "energy ℏω, times the probability τ(ω) that it crosses the molecule, times how strongly that mode's " +
          "thermal population responds to the temperature difference. All the molecule-specific physics — " +
          "including interference — lives inside τ(ω).",
        terms: [
          { sym: "τ(ω)", meaning: "phonon transmission function — probability a phonon at frequency ω crosses the junction; antiresonances are its zeros" },
          { sym: "n(ω)", meaning: "Bose–Einstein phonon occupation of the contacts; dn/dT weights which frequencies matter at 300 K" },
          { sym: "ΔT", meaning: "temperature bias across the junction (40 K in the NEMD: 330 K vs 290 K)" },
        ],
      },
      {
        name: "Transmission kernel",
        eq: "τ(ω) ∝ (ℏω)² k_l² k_r² ρ_L(ω) ρ_R(ω) |d_lr(ω)|²,   d_lr(ω) = Σ_j C_l^j·C_r^j / [(ℏω+iη)² − ℏω_j²]",
        source: "Methods, following Klöckner–Cuevas–Pauly",
        plain:
          "τ(ω) factorizes into leads × molecule. The molecular part |d_lr|² — the Green's function between the two " +
          "sulfur anchor atoms — is a sum over the molecule's normal modes j. Modes can contribute with opposite " +
          "signs: when two terms cancel at some ω, transmission drops to (nearly) zero. That cancellation is the " +
          "phonon antiresonance, and whether it happens depends on the mode shapes C — which is exactly what the " +
          "meta vs para wiring changes.",
        terms: [
          { sym: "d_lr(ω)", meaning: "bare molecular phonon Green's function between left/right anchor (sulfur) atoms — the interference happens in this sum" },
          { sym: "C_l^j", meaning: "amplitude of normal mode j at the left anchor atom, from the QM-FF Hessian's eigenvectors" },
          { sym: "ρ_L,R(ω)", meaning: "phonon density of states of the gold leads at the contact atoms" },
          { sym: "η", meaning: "small imaginary broadening keeping the Green's function finite at resonance" },
        ],
      },
      {
        name: "Probe signal chain",
        eq: "ΔT_tip = Q·R_th ≈ 21 µK at 30 pW;   noise ≈ 3 pW K⁻¹ Hz⁻¹ᐟ²",
        source: "Methods, probe characterization (Extended Data Figs. 2–3)",
        plain:
          "The sensitivity budget of the experiment: one molecule's ~30 pW crossing a probe of thermal resistance " +
          "R_th ≈ 0.7×10⁶ K/W shifts the tip by ~21 µK, read as an NbN resistance change through the Wheatstone " +
          "bridge. The twin-tip differential scheme cancels environmental drift ~4×, bringing the noise floor to " +
          "~3 pW K⁻¹ Hz⁻¹ᐟ² — below one molecule's signal, which is the whole game.",
        terms: [
          { sym: "R_th", meaning: "probe thermal resistance to its base, ≈0.7×10⁶ K/W — measured by the 3ω method" },
          { sym: "TCR α", meaning: "NbN thermometer's temperature coefficient of resistance, α = dR/(R₀dT), calibrated 295–420 K" },
        ],
      },
    ],
    assumptions: [
      "Trace selection: only junctions with drift <100 pW K⁻¹ nm⁻¹, a clean final electrical step, and stable trapped-state signals enter the histograms (three explicit criteria in Methods).",
      "The near-field radiation background (~200 pW/K) is constant while the piezo holds still, so the rupture step isolates the molecular contribution.",
      "NEMD force fields are classical once parametrized — quantum statistics enter only through the QM-derived Hessian; contacts are ideal Au(111) blocks under 0.35 nN strain.",
      "The Landauer analysis is harmonic (elastic transport); anharmonic effects appear only in the full NEMD, which is why both are computed and compared.",
    ],
    validation:
      "Measured vs simulated thermal conductances agree for BOTH isomers (≈17 vs ≈28 pW/K), the electrical " +
      "10× meta/para ratio matches known charge-interference results, the near-field background matches the " +
      "SCUFF-EM prediction quantitatively (~100 pW/K change per 10 nm), and the no-tip noise floor matches the " +
      "Johnson-noise estimate — four independent cross-checks.",
  },
  foundations: [
    {
      title: "Turning picowatts into micro-kelvins",
      source: "Probe design (Fig. 1c; Methods)",
      concept:
        "You can't measure 30 pW directly — you convert it to temperature. Heat flowing through the junction into " +
        "the probe shifts the tip temperature by ΔT = Q·R_th, where R_th is the probe's thermal resistance to its " +
        "base. A probe that leaks heat easily (small R_th) barely warms; a thermally isolated one (large R_th) " +
        "amplifies the same picowatts into a much larger, readable ΔT. The catch: high R_th usually means a long, " +
        "floppy beam — this paper's step-tapered design keeps stiffness >10³ N/m while reaching R_th ≈ 0.7×10⁶ K/W.",
      equation: "ΔT = Q · R_th",
      whyItMatters:
        "It's the sensitivity budget of the whole experiment: at R_th = 0.7×10⁶ K/W, a 30 pW single-molecule heat " +
        "flow becomes ≈21 μK — resolvable by the NbN bridge, but only just.",
      demo: {
        kind: "chart", chartKind: "line", T: 1, dt: 1,
        xLabel: "heat flow through the junction Q (pW)", yLabel: "tip temperature signal ΔT (μK)",
        caption: "sweep the probe's thermal resistance — better isolation turns the same picowatts into more signal",
        params: [
          { key: "rth", sym: "R_th", label: "Probe thermal resistance (×10⁶ K/W)", min: 0.05, max: 2, step: 0.05, def: 0.7, animate: true },
        ],
        computeJs: `
const x = [], dT = [], floor = [];
for (let q = 0; q <= 60; q += 1) {
  x.push(q);
  dT.push(+(q * params.rth).toFixed(2));      // pW × 1e6 K/W = μK
  floor.push(6);                               // ≈ bridge noise floor (μK-scale)
}
return { x, series: [
  { label: "signal ΔT (μK)", data: dT },
  { label: "≈ detection floor", data: floor },
] };`,
        insightJs: `
const sig = 30 * params.rth;
return "At R_th = " + params.rth.toFixed(2) + "×10⁶ K/W, one molecule's ≈30 pW gives ΔT ≈ " + sig.toFixed(1) +
  " μK — " + (sig > 6 ? "comfortably above" : "BELOW") + " the bridge's noise floor. The paper's probe (0.7) sits at ≈21 μK: enough, with nothing to spare.";`,
      },
    },
    {
      title: "Why histograms, not single traces",
      source: "Break-junction statistics (Figs. 2–3; Methods)",
      concept:
        "Every make-and-break cycle produces a slightly different junction: atoms rearrange, the molecule tilts, " +
        "contacts strain. So one trace proves little — the field's standard is to repeat the rupture hundreds of " +
        "times and histogram the conductance steps. Real molecular signatures pile up into a peak at the " +
        "most-probable value; random contact noise spreads flat. The peak's position is the number you report, and " +
        "its width honestly displays junction-to-junction variation.",
      equation: "G_most-probable = argmax of the histogram of rupture steps",
      whyItMatters:
        "Both headline numbers of this paper — 17 vs 28 pW/K — are histogram peaks over ~50 junctions each, which " +
        "is what makes a 50% difference credible despite single-trace scatter.",
      demo: {
        kind: "chart", chartKind: "line", T: 1, dt: 1,
        xLabel: "thermal conductance (pW/K)", yLabel: "counts",
        caption: "sweep the number of measured junctions — the peak sharpens out of the noise",
        params: [
          { key: "n", sym: "N", label: "Junctions measured", min: 5, max: 300, step: 5, def: 50, animate: true },
          { key: "spread", sym: "σ", label: "Junction-to-junction spread (pW/K)", min: 2, max: 15, step: 0.5, def: 7 },
        ],
        computeJs: `
const bins = 46, lo = 5, hi = 55;
const counts = new Array(bins).fill(0);
const rnd = (s) => { const t = Math.sin(s * 12.9898) * 43758.5453; return t - Math.floor(t); };
const N = Math.round(params.n);
for (let k = 0; k < N; k++) {
  // Box–Muller from two deterministic uniforms → reproducible "measurements"
  const u1 = Math.max(1e-9, rnd(k * 3.7 + 1)), u2 = rnd(k * 7.1 + 2);
  const g = 31 + params.spread * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  const b = Math.floor(((g - lo) / (hi - lo)) * bins);
  if (b >= 0 && b < bins) counts[b]++;
}
const x = Array.from({ length: bins }, (_, i) => +(lo + (i + 0.5) * (hi - lo) / bins).toFixed(1));
return { x, series: [ { label: "histogram of rupture steps", data: counts } ] };`,
        insightJs: `
const sem = params.spread / Math.sqrt(Math.round(params.n));
return "With N = " + Math.round(params.n) + " junctions and ±" + params.spread.toFixed(1) +
  " pW/K junction-to-junction spread, the peak position is known to ≈ ±" + sem.toFixed(1) +
  " pW/K. The paper's ~50-trace histograms pin 17 vs 28 pW/K far beyond doubt.";`,
      },
    },
    {
      title: "Two paths, one wave — interference in 60 seconds",
      source: "Wave mechanics background for meta vs para",
      concept:
        "Send a wave through a ring with two arms. If both arms delay the wave equally, the halves recombine in " +
        "phase and everything transmits. If one arm is longer, the halves arrive shifted; at half a wavelength of " +
        "mismatch they cancel exactly — an antiresonance. Para-OPE3 wires the centre ring so the phonon paths stay " +
        "in phase; meta wiring offsets them, and the heat-carrying vibrations around 60–80 cm⁻¹ hit close to the " +
        "cancellation condition.",
      equation: "T(φ) = |1 + e^{iφ}|²/4 = cos²(φ/2)",
      whyItMatters:
        "This toy is the entire physics of the paper's headline: meta vs para is nothing but choosing φ near π " +
        "instead of 0 for the dominant heat-carrying phonons.",
      demo: {
        kind: "chart", chartKind: "line", T: 1, dt: 1,
        xLabel: "frequency (arb. — sets the phase mismatch)", yLabel: "transmission",
        caption: "sweep the path mismatch: 0 = para-like (in phase), 1 = meta-like (antiresonance in band)",
        params: [
          { key: "mis", sym: "Δ", label: "Path-length mismatch", min: 0, max: 1, step: 0.02, def: 0.65, animate: true },
        ],
        computeJs: `
const x = [], t2 = [], band = [];
for (let f = 0; f <= 2.001; f += 0.02) {
  x.push(+f.toFixed(2));
  const phi = Math.PI * params.mis * f;
  t2.push(+Math.pow(Math.cos(phi / 2), 2).toFixed(4));
  band.push(f >= 0.6 && f <= 1.1 ? 1 : 0); // the "heat-carrying band"
}
return { x, series: [
  { label: "two-path transmission", data: t2 },
  { label: "heat-carrying band (60–80 cm⁻¹ analogue)", data: band },
] };`,
        insightJs: `
const phiBand = Math.PI * params.mis * 0.85;
const tBand = Math.pow(Math.cos(phiBand / 2), 2);
return "At mismatch Δ = " + params.mis.toFixed(2) + ", the heat-carrying band transmits " + Math.round(tBand * 100) +
  "% — " + (tBand < 0.5 ? "destructive interference is choking the heat path, the meta situation." : "the paths still add up, the para situation.");`,
      },
    },
    {
      title: "Wiedemann–Franz: ruling out the electrons",
      source: "Methods — separating electron from phonon heat",
      concept:
        "Both electrons and phonons carry heat, and the probe measures their sum. The Wiedemann–Franz law bounds " +
        "the electronic part: G_th,el ≈ L₀·T·G_e, with L₀ = 2.44×10⁻⁸ WΩK⁻². Measure the electrical conductance " +
        "G_e simultaneously (the probe does) and you can compute the largest heat flow electrons could account " +
        "for. For OPE3 junctions G_e is ~10⁻⁴–10⁻⁵ G₀, so electrons carry <0.1 pW/K — meaning the measured 17 vs " +
        "28 pW/K difference can ONLY be phononic.",
      equation: "G_th,el = L₀ · T · G_e",
      whyItMatters:
        "It closes the loophole: without this check, a skeptic could blame the 50% thermal difference on the 10× " +
        "electrical difference. The numbers say electrons are irrelevant here.",
      demo: {
        kind: "chart", chartKind: "line", T: 1, dt: 1,
        xLabel: "electrical conductance log₁₀(G/G₀)", yLabel: "conductance (pW/K, log₁₀)",
        caption: "sweep the junction's electrical conductance — electrons only matter far above the OPE3 regime",
        params: [
          { key: "logg", sym: "G_e", label: "Your junction's log₁₀(G/G₀)", min: -6, max: 0, step: 0.1, def: -4.5, animate: true },
        ],
        computeJs: `
const L0 = 2.44e-8, T = 300, G0 = 7.748e-5; // Siemens
const x = [], el = [], meas = [];
for (let lg = -6; lg <= 0.001; lg += 0.1) {
  x.push(+lg.toFixed(1));
  const gth = L0 * T * G0 * Math.pow(10, lg) * 1e12; // pW/K
  el.push(+Math.log10(gth).toFixed(2));
  meas.push(+Math.log10(25).toFixed(2)); // ≈ measured single-molecule G_th
}
return { x, series: [
  { label: "electronic heat (Wiedemann–Franz bound)", data: el },
  { label: "measured G_th ≈ 25 pW/K", data: meas },
] };`,
        insightJs: `
const gth = 2.44e-8 * 300 * 7.748e-5 * Math.pow(10, params.logg) * 1e12;
return "At G_e = 10^" + params.logg.toFixed(1) + " G₀ electrons carry ≤ " +
  (gth < 0.01 ? gth.toExponential(1) : gth.toFixed(2)) + " pW/K. OPE3 junctions sit near 10⁻⁴·⁵ G₀ ⇒ <0.1 pW/K of the ≈17–28 pW/K measured — the interference is in the phonons.";`,
      },
    },
  ],
  explorables: [
    {
      title: "Tune the antiresonance — what contact dynamics does",
      basis: "equation",
      story:
        "The theory's key finding, on two sliders. A transmission antiresonance is a sharp dip where two vibration " +
        "paths cancel. In meta-OPE3 the simulations show it SURVIVES thermal contact dynamics; in para-OPE3 the " +
        "moving contacts smear it away ('quenching'). Slide the dephasing up and watch the dip fill in — that's what " +
        "Fig. 4e shows with the authors' own kernels: meta keeps its dips, para's are gone.",
      source: "Fig. 4d–e — transmission kernels with and without contact-dynamics quenching",
      demo: {
        kind: "chart", chartKind: "line", T: 1, dt: 1,
        xLabel: "frequency (cm⁻¹)", yLabel: "transmission kernel (normalized)",
        caption: "sweep the contact-dynamics dephasing — the antiresonance at 80 cm⁻¹ fills in",
        params: [
          { key: "deph", sym: "γ", label: "Contact-dynamics dephasing", min: 0, max: 1, step: 0.02, def: 0.15, animate: true },
          { key: "w0", sym: "ω₀", label: "Antiresonance frequency (cm⁻¹)", min: 40, max: 140, step: 2, def: 80 },
        ],
        computeJs: `
const x = [], t = [], quenched = [];
for (let wcm = 0; wcm <= 200; wcm += 2) {
  x.push(wcm);
  const bg = 0.75 + 0.2 * Math.sin(wcm / 34);
  const dip = (g) => {
    const width = 6 + 60 * g;
    const depth = Math.max(0.02, 1 - 0.98 * Math.exp(-3.2 * g));
    const lor = 1 - (1 - depth) * 0 - (1 - depth); // depth at center
    const shape = 1 - (1 - depth) * (width * width) / ((wcm - params.w0) * (wcm - params.w0) + width * width);
    return bg * Math.max(0.001, shape);
  };
  t.push(+dip(params.deph).toFixed(4));
  quenched.push(+dip(1).toFixed(4));
}
return { x, series: [
  { label: "your junction", data: t },
  { label: "fully quenched (para-like)", data: quenched },
] };`,
        insightJs: `
const depth = Math.max(0.02, 1 - 0.98 * Math.exp(-3.2 * params.deph));
return "At dephasing γ = " + params.deph.toFixed(2) + " the antiresonance at " + params.w0 +
  " cm⁻¹ still blocks " + Math.round((1 - depth) * 100) + "% of transmission at its centre. " +
  (params.deph < 0.4 ? "This is the meta-OPE3 situation — interference survives 300 K." :
   "This is what happens in para-OPE3: contact motion averages the phase away and the dip disappears.");`,
      },
    },
    {
      title: "Where the heat actually flows — the authors' own cumulative curve",
      basis: "reported",
      story:
        "Integrate the spectral heat current from zero up to a cutoff and you get the running total of thermal " +
        "conductance — the inset of Fig. 4c, plotted here from the authors' own simulation data. Slide the cutoff: " +
        "by ~100 cm⁻¹ the running totals have already split meta below para, and beyond ~125 cm⁻¹ almost nothing is " +
        "added (gold's Debye cutoff is ≈161 cm⁻¹). The 40–95 cm⁻¹ window is where the interference does its damage.",
      source: "Fig. 4c inset — cumulative thermal conductance (Source Data, 'Figure 4' sheet)",
      demo: {
        kind: "chart", chartKind: "line", T: 1, dt: 1,
        xLabel: "cutoff frequency (cm⁻¹)", yLabel: "cumulative thermal conductance (pW/K)",
        caption: "sweep the cutoff — the vertical gap between the curves is the interference deficit",
        params: [
          { key: "cut", sym: "ω_c", label: "Your cutoff (cm⁻¹)", min: 10, max: 200, step: 2, def: 95, animate: true },
        ],
        computeJs: `
const M = ${JSON.stringify(F4C_INSET.meta.filter((_, i) => i % 2 === 0))};
const P = ${JSON.stringify(F4C_INSET.para.filter((_, i) => i % 2 === 0))};
const x = [], meta = [], para = [], marker = [];
for (let i = 0; i < M.length; i++) {
  x.push(M[i][0]);
  meta.push(M[i][1]);
  para.push(P[i] ? P[i][1] : null);
  marker.push(M[i][0] <= params.cut ? M[i][1] : null);
}
return { x, series: [
  { label: "meta-OPE3 (authors' data)", data: meta },
  { label: "para-OPE3 (authors' data)", data: para.map((v) => v === null ? 0 : v) },
] };`,
        insightJs: `
const M = ${JSON.stringify(F4C_INSET.meta.filter((_, i) => i % 4 === 0))};
const P = ${JSON.stringify(F4C_INSET.para.filter((_, i) => i % 4 === 0))};
const at = (arr) => { let best = arr[0]; for (const p of arr) if (Math.abs(p[0] - params.cut) < Math.abs(best[0] - params.cut)) best = p; return best[1]; };
const m = at(M), p = at(P);
return "Up to " + params.cut + " cm⁻¹: meta has accumulated " + m.toFixed(1) + " pW/K vs para's " + p.toFixed(1) +
  " pW/K — " + (p > 0 ? Math.round((1 - m / p) * 100) : 0) + "% deficit. That gap opens almost entirely inside the 40–95 cm⁻¹ interference window.";`,
      },
    },
    {
      title: "One molecule's heat, in human units",
      basis: "reported",
      story:
        "The junction sits between a ~340 K probe and a ~295 K sample — a 45 K drive. With the paper's measured " +
        "conductances, how much heat actually crosses one molecule? Slide the temperature difference and compare " +
        "the para and meta channels; the readout converts to picowatts and to 'phonon packets' (ℏω at 80 cm⁻¹) per " +
        "second, to feel how microscopic this experiment is.",
      source: "measured G_th: para ≈ 28 pW/K, meta ≈ 17 pW/K; ΔT ≈ 45 K in the experiment",
      demo: {
        kind: "chart", chartKind: "line", T: 1, dt: 1,
        xLabel: "temperature difference ΔT (K)", yLabel: "heat flow through one molecule (pW)",
        caption: "sweep ΔT — the experiment ran at ≈45 K",
        params: [
          { key: "dT", sym: "ΔT", label: "Probe–sample ΔT (K)", min: 5, max: 60, step: 1, def: 45, animate: true },
        ],
        computeJs: `
const x = [], para = [], meta = [], yours = [];
for (let d = 0; d <= 60; d += 1) {
  x.push(d);
  para.push(+(28e-3 * d).toFixed(2)); // pW
  meta.push(+(17e-3 * d).toFixed(2));
}
return { x, series: [
  { label: "para-OPE3 (28 pW/K)", data: para },
  { label: "meta-OPE3 (17 pW/K)", data: meta },
] };`,
        insightJs: `
const qP = 28e-3 * params.dT, qM = 17e-3 * params.dT;
const hbarw = 6.626e-34 * 2.9979e10 * 80; // J per 80 cm⁻¹ phonon
const packets = (qP - qM) * 1e-12 / hbarw;
return "At ΔT = " + params.dT + " K: para passes " + qP.toFixed(1) + " pW, meta " + qM.toFixed(1) +
  " pW. The interference withholds " + (qP - qM).toFixed(1) + " pW ≈ " + packets.toExponential(1) +
  " eighty-cm⁻¹ phonons every second — an astronomically fast traffic that the twin-tip probe reads as micro-kelvins.";`,
      },
    },
  ],

  protocol: { T: 1, dt: 1, description: "" },
  blocks: [],

  resultFigures: [
    {
      figureLabel: "Fig. 2",
      page: 4,
      image: FIG("ph-fig2"),
      title: "Thermal and electrical measurements of single Au–BDA–Au junctions",
      explanation:
        "The technique proven on a benchmark molecule (benzenediamine). (a) One junction, live: the electrical " +
        "conductance (top) drops the instant the junction ruptures at t = 0; the thermal signal (bottom) follows " +
        "after its slower response time — the step between the before/after plateaus IS one molecule's thermal " +
        "conductance. (b) ≈50 traces averaged, mean ± 1 s.d. (c,d) The histograms those traces build: most-probable " +
        "electrical conductance ≈10⁻³ G₀ and thermal conductance ≈31 pW/K for a single Au–BDA–Au junction. Every " +
        "panel plots the authors' own Source Data.",
      hotspots: [
        { x: 0.25, y: 0.13, label: "the rupture step", note: "At t = 0 the molecule lets go: electrical conductance collapses within a millisecond. That clean step is the single-molecule signature." },
        { x: 0.25, y: 0.33, label: "thermal lag t₂", note: "The thermal signal takes ~0.2 s to settle — the probe's thermal time constant. The paper reads the difference between the settled plateaus, not the transient." },
        { x: 0.8, y: 0.75, label: "≈31 pW/K", note: "The thermal histogram's peak: the heat conductance of ONE molecule, pinned by hundreds of rupture events." },
      ],
      panels: [
        {
          subplotLabel: "a · One junction — electrical trace (10⁻³ G₀)",
          xLabel: "time (s)", yLabel: "Gₑ (10⁻³ G₀)",
          chartKind: "line",
          digitized: {
            badge: "paper's data",
            source: "Source Data Fig. 2a — a single junction's electrical conductance through its rupture",
            series: [ { label: "single Gₑ trace", color: COL.elec, points: F2A.el } ],
          },
        },
        {
          subplotLabel: "a · The same junction — thermal trace (pW/K)",
          xLabel: "time (s)", yLabel: "G_th (pW/K)",
          chartKind: "line",
          digitized: {
            badge: "paper's data",
            source: "Source Data Fig. 2a — the simultaneous thermal conductance; the plateau step is the molecule",
            series: [ { label: "single G_th trace", color: COL.therm, points: F2A.th } ],
          },
        },
        {
          subplotLabel: "b · ≈50 traces consolidated — electrical (mean ± s.d.)",
          xLabel: "time (s)", yLabel: "Gₑ (10⁻³ G₀)",
          chartKind: "line",
          digitized: {
            badge: "paper's data",
            source: "Source Data Fig. 2b — averaged electrical conductance and its ±1 s.d. band edge",
            series: [
              { label: "mean Gₑ", color: COL.elec, points: F2B.el },
              { label: "+1 s.d.", color: COL.band, points: F2B.el.map((p, i) => [p[0], +(p[1] + (F2B.elErr[i]?.[1] || 0)).toFixed(3)]) },
            ],
          },
        },
        {
          subplotLabel: "b · Consolidated — thermal (mean ± s.d.)",
          xLabel: "time (s)", yLabel: "G_th (pW/K)",
          chartKind: "line",
          digitized: {
            badge: "paper's data",
            source: "Source Data Fig. 2b — averaged thermal conductance and its ±1 s.d. band edge",
            series: [
              { label: "mean G_th", color: COL.therm, points: F2B.th },
              { label: "+1 s.d.", color: COL.bandT, points: F2B.th.map((p, i) => [p[0], +(p[1] + (F2B.thErr[i]?.[1] || 0)).toFixed(2)]) },
            ],
          },
        },
        {
          subplotLabel: "c · Electrical histogram — peak ≈ 10⁻³ G₀",
          xLabel: "log₁₀ Gₑ (G₀)", yLabel: "counts (a.u.)",
          chartKind: "line",
          digitized: {
            badge: "paper's data",
            source: "Source Data Fig. 2c — histogram of electrical rupture steps",
            series: [ { label: "counts", color: "#3f8fd2", points: F2C } ],
          },
        },
        {
          subplotLabel: "d · Thermal histogram — peak ≈ 31 pW/K",
          xLabel: "G_th (pW/K)", yLabel: "counts (a.u.)",
          chartKind: "line",
          digitized: {
            badge: "paper's data",
            source: "Source Data Fig. 2d — histogram of thermal rupture steps",
            series: [ { label: "counts", color: COL.therm, points: F2D } ],
          },
        },
      ],
    },
    {
      figureLabel: "Fig. 3",
      page: 5,
      image: FIG("ph-fig3"),
      title: "The interference switch: meta- vs para-OPE3",
      explanation:
        "The headline experiment. (a) The two isomers: identical atoms, but the centre ring is wired meta (offset) " +
        "or para (straight through). (b,c) Consolidated conductance traces (~50 junctions each): the rupture steps " +
        "give each isomer's electrical and thermal signature. (d) Electrically, meta conducts ~10× less " +
        "(3.3×10⁻⁵ vs 1.7×10⁻⁴ G₀) — destructive ELECTRON interference, known before. (e) Thermally — the new " +
        "result — meta carries ≈50% less heat: ≈17 vs ≈28 pW/K. Same molecule, same contacts; only the wave paths " +
        "changed. All curves are the authors' own Source Data.",
      hotspots: [
        { x: 0.3, y: 0.1, label: "the only difference", note: "Meta vs para: where the second arm attaches to the centre ring. That's the entire experimental knob — geometry, not chemistry." },
        { x: 0.78, y: 0.25, label: "10× electrical gap", note: "The electrical histograms sit a decade apart — the electron-interference effect that validates the junctions are what they should be." },
        { x: 0.78, y: 0.72, label: "the 50% phonon cut", note: "Meta's thermal histogram peaks near 17 pW/K, para's near 28 pW/K. This gap is the first clean observation of destructive phonon interference in a single molecule." },
      ],
      panels: [
        {
          subplotLabel: "b · meta-OPE3 — consolidated thermal trace",
          xLabel: "time (s)", yLabel: "G_th (pW/K)",
          chartKind: "line",
          digitized: {
            badge: "paper's data",
            source: "Source Data Fig. 3b — meta-OPE3 averaged thermal conductance (±1 s.d. edge)",
            series: traceSeries(F3META, false),
          },
        },
        {
          subplotLabel: "c · para-OPE3 — consolidated thermal trace",
          xLabel: "time (s)", yLabel: "G_th (pW/K)",
          chartKind: "line",
          digitized: {
            badge: "paper's data",
            source: "Source Data Fig. 3c — para-OPE3 averaged thermal conductance (±1 s.d. edge)",
            series: traceSeries(F3PARA, false),
          },
        },
        {
          subplotLabel: "b,c · Electrical traces — the 10× electron-interference gap",
          xLabel: "time (s)", yLabel: "log₁₀ Gₑ (G₀)",
          chartKind: "line",
          digitized: {
            badge: "paper's data",
            source: "Source Data Fig. 3b,c — averaged electrical conductance of both isomers (log scale)",
            series: [
              { label: "meta-OPE3", color: COL.metaHist, points: F3META.elLog },
              { label: "para-OPE3", color: COL.paraHist, points: F3PARA.elLog },
            ],
          },
        },
        {
          subplotLabel: "d · Electrical histograms — a decade apart",
          xLabel: "log₁₀ Gₑ (G₀)", yLabel: "counts (a.u.)",
          chartKind: "line",
          digitized: {
            badge: "paper's data",
            source: "Source Data Fig. 3d — electrical histograms; meta ≈ 3.3×10⁻⁵ G₀, para ≈ 1.7×10⁻⁴ G₀",
            series: [
              { label: "meta-OPE3", color: COL.metaHist, points: F3D.meta },
              { label: "para-OPE3", color: COL.paraHist, points: F3D.para },
            ],
          },
        },
        {
          subplotLabel: "e · Thermal histograms — the 50% phonon-interference cut",
          xLabel: "G_th (pW/K)", yLabel: "counts (a.u.)",
          chartKind: "line",
          digitized: {
            badge: "paper's data",
            source: "Source Data Fig. 3e — thermal histograms; meta ≈ 17 pW/K, para ≈ 28 pW/K",
            series: [
              { label: "meta-OPE3", color: COL.metaTherm, points: F3E.meta },
              { label: "para-OPE3", color: COL.paraTherm, points: F3E.para },
            ],
          },
        },
      ],
    },
    {
      figureLabel: "Fig. 4",
      page: 6,
      image: FIG("ph-fig4"),
      title: "NEMD simulations: where the interference lives in the spectrum",
      explanation:
        "Why meta loses half its heat. (b) The phonon densities of states of the two junctions are nearly identical " +
        "— composition can't explain the gap. (c) The spectral heat current shows meta's deficit concentrated in the " +
        "40–95 cm⁻¹ window (dashed lines in the original); the cumulative-conductance inset integrates to " +
        "⟨G⟩ ≈ 37 (meta) vs 42 (para) pW/K. (d) The transmission kernel of a meta geometry: summing just two normal " +
        "modes (centre-of-mass + 3-antinode) already reproduces the sharp antiresonance near 80 cm⁻¹. (e) Kernels " +
        "averaged along the MD trajectory: meta's antiresonances persist at room temperature while para's are " +
        "quenched by contact dynamics. Every curve is the authors' simulation output from the Source Data.",
      hotspots: [
        { x: 0.62, y: 0.1, label: "same DOS, different heat", note: "Meta and para have almost identical vibrational spectra — whatever blocks the heat is not missing modes, it's interference between them." },
        { x: 0.62, y: 0.35, label: "the 40–95 cm⁻¹ deficit", note: "The spectral heat current: meta (red) runs below para (teal) precisely inside the dashed interference window." },
        { x: 0.15, y: 0.75, label: "two modes make the dip", note: "Panel d: keeping only the COM and 3-antinode modes reproduces the 80 cm⁻¹ antiresonance — a textbook two-path cancellation inside one molecule." },
      ],
      panels: [
        {
          subplotLabel: "b · Phonon density of states — nearly identical isomers",
          xLabel: "ω (cm⁻¹)", yLabel: "phonon DOS (a.u.)",
          chartKind: "line",
          digitized: {
            badge: "paper's data",
            source: "Source Data Fig. 4 panel b — phonon DOS from the cMD trajectories",
            series: [
              { label: "meta-OPE3", color: COL.meta4, points: F4B.meta },
              { label: "para-OPE3", color: COL.para4, points: F4B.para },
            ],
          },
        },
        {
          subplotLabel: "c · Spectral heat current — meta's 40–95 cm⁻¹ deficit",
          xLabel: "ω (cm⁻¹)", yLabel: "q(ω) (eV)",
          chartKind: "line",
          digitized: {
            badge: "paper's data",
            source: "Source Data Fig. 4 panel c — averaged spectral heat current over three independent simulations",
            series: [
              { label: "meta-OPE3", color: COL.meta4, points: F4C.meta },
              { label: "para-OPE3", color: COL.para4, points: F4C.para },
            ],
          },
        },
        {
          subplotLabel: "c inset · Cumulative thermal conductance",
          xLabel: "ω (cm⁻¹)", yLabel: "G_th cumulative (pW/K)",
          chartKind: "line",
          digitized: {
            badge: "paper's data",
            source: "Source Data Fig. 4 panel c inset — integrating the spectral conductance; the gap opens inside the interference window",
            series: [
              { label: "meta-OPE3", color: COL.meta4, points: F4C_INSET.meta },
              { label: "para-OPE3", color: COL.para4, points: F4C_INSET.para },
            ],
          },
        },
        {
          subplotLabel: "d · Transmission kernel (meta) — the 80 cm⁻¹ antiresonance (log₁₀)",
          xLabel: "ω (cm⁻¹)", yLabel: "log₁₀ |d_lr(ω)|²",
          chartKind: "line",
          digitized: {
            badge: "paper's data",
            source: "Source Data Fig. 4 panel d — kernel with all modes vs only the COM + 3-antinode pair (log scale)",
            series: [
              { label: "all normal modes", color: "#334155", points: F4D.full.map(([x, y]) => [x, +Math.log10(Math.max(1e-12, y)).toFixed(2)]) },
              { label: "COM + 3-antinode only", color: COL.meta4, points: F4D.isolated.map(([x, y]) => [x, +Math.log10(Math.max(1e-12, y)).toFixed(2)]) },
            ],
          },
        },
        {
          subplotLabel: "e · Trajectory-averaged kernels — meta keeps its dips (log₁₀)",
          xLabel: "ω (cm⁻¹)", yLabel: "log₁₀ |d_lr(ω)|²",
          chartKind: "line",
          digitized: {
            badge: "paper's data",
            source: "Source Data Fig. 4 panel e — kernels averaged over cMD-sampled geometries: meta's antiresonances persist, para's are quenched",
            series: [
              { label: "meta-OPE3", color: COL.meta4, points: F4E.meta.map(([x, y]) => [x, +Math.log10(Math.max(1e-12, y)).toFixed(2)]) },
              { label: "para-OPE3", color: COL.para4, points: F4E.para.map(([x, y]) => [x, +Math.log10(Math.max(1e-12, y)).toFixed(2)]) },
            ],
          },
        },
      ],
    },
  ],
};
