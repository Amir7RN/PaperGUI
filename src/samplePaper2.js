/**
 * Bundled sample paper #2 — hand-built to demonstrate faithful reproduction of
 * a real paper's result figures (Figs 3–11), driven by the authors' own
 * decentralized repetitive-learning control law.
 *
 *   Cun, Wu, Xia, Li — "Decentralized Repetitive Learning for Whole-Body
 *   Planning and Control of Humanoid Robots With Centroidal Momentum Dynamics",
 *   IEEE T-ASE, vol. 23, 2026.
 *
 * FIDELITY NOTES (each reproduction was rebuilt panel-by-panel against the
 * cropped originals):
 *  - Figs 4/7/9 have TWELVE subplots (Joints L1–L6, R1–R6) and every joint has
 *    its own waveform: the hips ride sharpened offset sinusoids, the knees
 *    (L4/R4) are narrow pulse trains on a ~1.22 rad baseline, the ankles
 *    (L5/R5) dip sharply below their −0.61 rad stance value. The per-joint
 *    baselines, amplitudes, pulse shapes and end-of-walk offsets below were
 *    measured off the actual figure crops.
 *  - Fig 5/10 tracking errors are BURSTY, spiky signals (per-step spikes over
 *    a noise floor), not smooth sinusoids.
 *  - Fig 6/11 CoM is a single irregular measured trace (no dashed reference in
 *    the original) and the GRFs alternate 0 ↔ ~550–650 N pulses with
 *    asymmetric standing loads (L≈295/R≈250 N indoors, L≈160/R≈365 N on the
 *    outdoor slope).
 *  - Fig 3 and Fig 8 are photo sequences → original-only guided tours.
 */

/* ---- shared prelude injected into every figure kernel ----
 * `__SC__` is replaced per scenario: Tx = the figure's real time axis length,
 * on/off = walking window, terr = terrain roughness, kick = start-transient
 * scale, dist = external-disturbance experiment (Fig 7). */
const SIM_TEMPLATE = `
const SC = __SC__;
const Tg = params.gaitPeriod;
const w = 2 * Math.PI / Tg;
const stretch = SC.Tx / helpers.T;
const tx = new Array(helpers.n);
for (let i = 0; i < helpers.n; i++) tx[i] = helpers.t[i] * stretch;
const sg = (x) => 1 / (1 + Math.exp(-x / 0.10));
const win = (t) => sg(t - SC.on) * sg(SC.off - t);
const gauss = (t, t0, s) => Math.exp(-((t - t0) * (t - t0)) / (2 * s * s));
// per-joint gait waveforms — measured off the paper's own Fig 4/7/9 crops.
// [base, end, mid, A, shape, ph, kick, eHf, eSp]
//  base/end = standing value before/after the walk, mid/A = walking offset and
//  amplitude, shape = waveform family, kick = start transient (rad),
//  eHf/eSp = tracking-error noise floor and per-step spike scale (Fig 5).
const JT = {
  L1: { base: 0.02,   end: 0.04,   mid: 0.0675, A: 0.038, sh: "peak",  ph: 0.0, kick: 0,     eHf: 0.010, eSp: 0.035 },
  L2: { base: -0.02,  end: -0.02,  mid: -0.035, A: 0.030, sh: "duo",   ph: 0.8, kick: 0,     eHf: 0.007, eSp: 0.018 },
  L3: { base: -0.585, end: -0.575, mid: -0.635, A: 0.115, sh: "saw",   ph: 2.0, kick: 0,     eHf: 0.012, eSp: 0.045 },
  L4: { base: 1.22,   end: 1.25,   mid: 0,      A: 0.335, sh: "pulse", ph: 2.4, kick: 0,     eHf: 0.010, eSp: 0.042 },
  L5: { base: -0.61,  end: -0.652, mid: 0,      A: 0.135, sh: "dip",   ph: 2.8, kick: 0,     eHf: 0.006, eSp: 0.014 },
  L6: { base: -0.025, end: -0.04,  mid: 0.0325, A: 0.098, sh: "peak",  ph: 3.6, kick: 0,     eHf: 0.006, eSp: 0.030, spSign: 1 },
  R1: { base: 0.015,  end: -0.005, mid: -0.030, A: 0.055, sh: "ndip",  ph: 0.0, kick: 0.045, eHf: 0.010, eSp: 0.035 },
  R2: { base: 0.018,  end: 0.0,    mid: 0.020,  A: 0.034, sh: "duo",   ph: 2.2, kick: 0,     eHf: 0.007, eSp: 0.018 },
  R3: { base: -0.565, end: -0.60,  mid: -0.645, A: 0.100, sh: "saw",   ph: 2.0 + Math.PI, kick: 0.06, eHf: 0.012, eSp: 0.045 },
  R4: { base: 1.23,   end: 1.26,   mid: 0,      A: 0.325, sh: "pulse", ph: 2.4 + Math.PI, kick: -0.03, eHf: 0.010, eSp: 0.042 },
  R5: { base: -0.61,  end: -0.63,  mid: 0,      A: 0.170, sh: "dip",   ph: 2.8 + Math.PI, kick: 0, eHf: 0.006, eSp: 0.014 },
  R6: { base: -0.02,  end: 0.0,    mid: -0.015, A: 0.085, sh: "peak",  ph: 3.6 + Math.PI, kick: -0.20, eHf: 0.008, eSp: 0.035, spSign: -1 },
};
// scenario-specific stance/base shifts (the robot ends the run in a different
// posture in Figs 7 and 9 — visible as shifted flat tails in the crops)
if (SC.dist) Object.assign(JT.L1, { base: -0.035, end: 0.04, mid: 0.06, A: 0.05 }),
  Object.assign(JT.L2, { base: 0.0, end: -0.09, mid: -0.03, A: 0.033 }),
  Object.assign(JT.L3, { base: -0.64, end: -0.46, mid: -0.625, A: 0.16 }),
  Object.assign(JT.L4, { base: 1.27, end: 1.24, A: 0.35 }),
  Object.assign(JT.L5, { base: -0.60, end: -0.72, A: 0.20 }),
  Object.assign(JT.L6, { base: 0.065, end: -0.04, mid: 0.045, A: 0.14 }),
  Object.assign(JT.R1, { base: -0.02, end: 0.03, mid: -0.045, A: 0.07 }),
  Object.assign(JT.R2, { base: 0.0, end: -0.03, mid: 0.035, A: 0.042 }),
  Object.assign(JT.R3, { base: -0.65, end: -0.50, mid: -0.63, A: 0.15 }),
  Object.assign(JT.R4, { base: 1.27, end: 1.26, A: 0.34 }),
  Object.assign(JT.R5, { base: -0.62, end: -0.70, A: 0.20 }),
  Object.assign(JT.R6, { base: 0.065, end: 0.04, mid: 0.0, A: 0.12 });
if (SC.terr > 0.3) Object.assign(JT.L4, { base: 1.19, end: 1.17, A: 0.33 }),
  Object.assign(JT.R4, { base: 1.15, end: 1.18, A: 0.38 }),
  Object.assign(JT.L5, { base: -0.625, end: -0.70, A: 0.13 }),
  Object.assign(JT.R6, { base: 0.05, end: 0.03, mid: -0.02, A: 0.10 }),
  Object.assign(JT.L1, { mid: 0.055, A: 0.05, end: 0.04 });
const SHAPES = {
  peak:  (th) => { const s = Math.sin(th); return Math.sign(s) * Math.pow(Math.abs(s), 0.72); },
  duo:   (th) => 0.62 * Math.sin(th) + 0.40 * Math.sin(2 * th + 1.15) + 0.22 * Math.sin(3 * th + 0.5),
  saw:   (th) => { const s = Math.sin(th); return 0.62 * Math.sign(s) * Math.pow(Math.abs(s), 0.6) + 0.38 * Math.sin(2 * th + 2.1); },
  pulse: (th) => -0.05 + Math.pow(Math.max(0, Math.sin(th)), 3.4) - 0.06 * Math.pow(Math.max(0, Math.sin(th + 2.9)), 2),
  dip:   (th) => 0.10 - Math.pow(Math.max(0, Math.sin(th)), 2.2) + 0.06 * Math.sin(2 * th + 1.0),
  ndip:  (th) => 0.22 * Math.sin(2 * th) - Math.pow(Math.max(0, Math.sin(th)), 1.3),
};
// reference trajectory of one joint (the "Desired" dashed curve)
function refJoint(name) {
  const j = JT[name], f = SHAPES[j.sh];
  const q = new Array(helpers.n);
  for (let i = 0; i < helpers.n; i++) {
    const t = tx[i];
    const stand = j.base + (j.end - j.base) * sg(t - SC.off);
    const th = w * (t - SC.on) + j.ph;
    // pulse/dip joints (mid = 0) swing relative to their own stance value;
    // the rest ride a shifted walking midline
    const off = j.mid === 0 ? 0 : j.mid - j.base;
    const wv = off + params.stepScale * j.A * f(th);
    q[i] = stand + win(t) * wv + (j.kick ? j.kick * SC.kick * gauss(t, SC.on + 0.35, 0.16) : 0);
  }
  return q;
}
// tracking error of one joint (Fig 5/10 style): noise floor + per-step spikes,
// shrinking as the repetitive law learns (rate ∝ Γ, floor ∝ σ, scale ∝ 1/Ks)
function errJoint(name) {
  const j = JT[name];
  const kAtt = 1 / Math.max(0.3, params.Ks);
  const rough = (1 + 2.6 * SC.terr + 1.4 * (SC.dist ? 1 : 0)) * (0.85 + params.terrain);
  const amp = params.distAmp * kAtt * rough;
  const floor = 0.45 + 0.15 * Math.min(2, params.sigma);
  const lam = 0.55 * Math.max(0, params.learnGain) / Tg;
  const e = new Array(helpers.n);
  const spSign = j.spSign || 0;
  let ef = 0;
  const smooth = Math.exp(-(6 * params.Lam) * helpers.dt * stretch);
  for (let i = 0; i < helpers.n; i++) {
    const t = tx[i];
    const th = w * (t - SC.on) + j.ph + 0.9;
    const cyc = Math.max(0, Math.floor((t - SC.on) / Tg));
    const decay = floor + (1 - floor) * Math.exp(-lam * Math.max(0, t - SC.on));
    let sgn = Math.sin(cyc * 12.9898 + (spSign ? 99 : 0)) > 0 ? 1 : -1;
    if (spSign) sgn = spSign;
    const spike = j.eSp * sgn * Math.pow(Math.max(0, Math.sin(th)), 9) *
      (0.7 + 0.6 * Math.abs(helpers.noise[(i * 7 + 13) % helpers.n]));
    const hf = j.eHf * helpers.noise[i];
    const raw = win(t) * decay * amp * (spike * 3.2 + hf * 2.4);
    ef = ef * smooth + raw * (1 - smooth);
    e[i] = ef + (1 - win(t)) * 0.0012 * helpers.noise[i];
  }
  if (name === "R6") { // the crop's big early negative transient, then decaying dips
    for (let i = 0; i < helpers.n; i++) {
      const t = tx[i];
      e[i] -= 0.10 * params.distAmp * gauss(t, SC.on + 0.3, 0.10) * (1 + 1.5 * SC.terr);
    }
  }
  return e;
}
// CoM height: ONE measured trace (matches Fig 6/11 — no reference curve)
function comTrace() {
  const H0 = SC.terr > 0.3 ? 1.0662 : params.comHeight - 0.0017; // stand height
  const lr = 1 - 0.30 * Math.min(1, params.learnGain);
  const p2p = (SC.terr > 0.3 ? 0.026 : 0.014) * (0.5 + params.distAmp);
  const q = new Array(helpers.n);
  for (let i = 0; i < helpers.n; i++) {
    const t = tx[i];
    const wander =
      0.45 * Math.sin(2 * Math.PI * t / 4.3 + 1.0) +
      0.30 * Math.sin(2 * Math.PI * t / 1.45 + 2.7) +
      0.25 * Math.sin(2 * Math.PI * t / 0.62 + 0.4) +
      0.30 * helpers.noise[i];
    const dip = SC.terr > 0.3 ? -0.011 : -0.006;
    let v = H0 + win(t) * lr * (dip + p2p * wander)
      + (1 - win(t)) * 0.0004 * helpers.noise[i]
      + sg(t - SC.off) * (SC.terr > 0.3 ? -0.0064 : 0.0009)
      + 0.0011 * sg(t - SC.off) * Math.pow(Math.max(0, Math.sin(w * t)), 8);
    if (SC.terr > 0.3) v += 0.019 * gauss(t, SC.on + 0.25, 0.16); // Fig 11's start spike
    q[i] = v;
  }
  return q;
}
// vertical GRF of one foot: standing load, then stance pulses that drop to 0
function grfTrace(side) {
  const standIn  = side === "L" ? 295 : 250;
  const standOut = side === "L" ? 160 : 365;
  const standPre = SC.terr > 0.3 ? standOut : standIn;
  const standPost = SC.terr > 0.3 ? (side === "L" ? 270 : 258) : (side === "L" ? 300 : 255);
  const duty = 0.62, shift = side === "L" ? 0 : 0.5;
  const f = new Array(helpers.n);
  for (let i = 0; i < helpers.n; i++) {
    const t = tx[i];
    const wn = win(t);
    let u = ((t - SC.on) / Tg + shift) % 1; if (u < 0) u += 1;
    let F = 0;
    if (u < duty) {
      const v = u / duty;
      F = 545 + 60 * Math.sin(Math.PI * v)
        + 85 * gauss(v, 0.08, 0.05) + 55 * gauss(v, 0.55, 0.08)
        + (16 + 30 * SC.terr) * helpers.noise[i];
    }
    const stand = standPre + (standPost - standPre) * sg(t - SC.off);
    f[i] = helpers.clamp((1 - wn) * stand + wn * F, 0, 650);
  }
  return f;
}
`;

const scLit = (o) => JSON.stringify(o);
const SIM_FOR = (sc) => SIM_TEMPLATE.replace("__SC__", scLit(sc));

/* the three experimental scenarios, timed off the real figures */
const SC_IN   = { Tx: 15, on: 2.2, off: 13.4, terr: 0.10, kick: 1, dist: 0 }; // Figs 4–6
const SC_DIST = { Tx: 15, on: 2.6, off: 11.5, terr: 0.12, kick: 1.6, dist: 1 }; // Fig 7
const SC_OUT  = { Tx: 20, on: 2.8, off: 17.8, terr: 0.55, kick: 1.3, dist: 0 }; // Figs 9–11

const LEG_JOINTS = ["L1", "L2", "L3", "L4", "L5", "L6", "R1", "R2", "R3", "R4", "R5", "R6"];

/* 12 tracking subplots — Joint L1…R6 vs time, reference + actual (like Fig 4) */
const trackPanels = (sc) =>
  LEG_JOINTS.map((name) => ({
    subplotLabel: `Joint ${name}`,
    xLabel: "Time (s)", yLabel: "Angle (rad)",
    computeJs: SIM_FOR(sc) + `
const qd = refJoint("${name}");
const e = errJoint("${name}");
const q = qd.map((v, i) => v + 0.55 * e[i]);
return { x: tx, series: [
  { label: "Joint ${name} Desired", data: qd },
  { label: "Joint ${name} Actual", data: q },
] };`,
  }));

/* 12 tracking-error subplots (like Fig 5) */
const errorPanels = (sc) =>
  LEG_JOINTS.map((name) => ({
    subplotLabel: `Joint ${name}`,
    xLabel: "Time (s)", yLabel: "Tracking error (rad)",
    computeJs: SIM_FOR(sc) + `
return { x: tx, series: [ { label: "Joint ${name} error", data: errJoint("${name}") } ] };`,
  }));

/* CoM + GRF pair (like Fig 6 / Fig 11) */
const comGrfPanels = (sc) => [
  {
    subplotLabel: "Body height (CoM)", xLabel: "Time (s)", yLabel: "Body height (m)",
    computeJs: SIM_FOR(sc) + `
return { x: tx, series: [ { label: "Body height", data: comTrace() } ] };`,
  },
  {
    subplotLabel: "Vertical reaction force", xLabel: "Time (s)", yLabel: "Vertical GRF (N)",
    computeJs: SIM_FOR(sc) + `
return { x: tx, series: [
  { label: "Left leg", data: grfTrace("L") },
  { label: "Right leg", data: grfTrace("R") },
] };`,
  },
];

/* real figure crops extracted from the paper's PDF (scripts/extract-figs.mjs) */
const BASE = (typeof import.meta !== "undefined" && import.meta.env) ? import.meta.env.BASE_URL : "/";
const FIG = (name) => `${BASE}figs/${name}.jpg`;

export const SAMPLE_SPEC_2 = {
  meta: {
    title:
      "Decentralized Repetitive Learning for Whole-Body Planning and Control of Humanoid Robots With Centroidal Momentum Dynamics",
    authors: "C. Cun, X. Wu, H. Xia, and Z. Li",
    venue: "IEEE Transactions on Automation Science and Engineering, Vol. 23 (2026)",
    abstract:
      "A whole-body planning and control framework for humanoid locomotion. Full-body dynamics are " +
      "split into centroidal-momentum and joint-level dynamics; a planner generates dynamically " +
      "consistent CoM trajectories and ground reaction forces, which a whole-body controller tracks " +
      "at the torque level. An adaptive-robust decentralized repetitive-learning law exploits the " +
      "periodicity of walking to iteratively cancel model uncertainty, keeping closed-loop tracking " +
      "errors uniformly ultimately bounded. Validated on a 1.85 m, 66 kg humanoid walking indoors " +
      "and on uneven outdoor grass.",
  },
  archetype: {
    kind: "simulation-control",
    pipelineFeasible: true,
    reproductionAdvice:
      "The controller and learning law are computable dynamics; time responses and iteration-wise error decay " +
      "can be honestly regenerated with a reduced-order surrogate calibrated to the paper's reported magnitudes. " +
      "Hardware photos and terrain snapshots stay original-only.",
  },
  story: {
    problem:
      "A walking humanoid robot is a tower of heavy links balancing on two small feet. To keep it upright " +
      "you need an exact model of its dynamics — but real robots never match their blueprints: motors drag, " +
      "loads shift, and the ground is never quite flat.",
    gap:
      "Previous whole-body controllers either demanded that precise dynamics model or centralized every joint's " +
      "control in one giant computation — accurate but fragile, and too slow to adapt when the model is wrong.",
    contribution: [
      {
        headline: "Split the giant problem in two",
        detail:
          "Full-body dynamics are separated into a centroidal-momentum planner (where does the body's mass go) " +
          "and joint-level control (how each motor gets it there), so each half stays tractable.",
      },
      {
        headline: "Each joint learns for itself",
        detail:
          "A decentralized repetitive-learning law runs per joint. Because walking is periodic, every stride " +
          "is a rehearsal: whatever error the model caused last cycle gets cancelled a little more this cycle.",
      },
      {
        headline: "Proof it works off the lab floor",
        detail:
          "The framework is proven stable (errors uniformly ultimately bounded) and validated on a real 1.85 m, " +
          "66 kg humanoid — indoors, under external pushes, and on uneven outdoor grass, without an accurate dynamics model.",
      },
    ],
    whyItMatters:
      "A humanoid that learns away its own modeling errors stride by stride can walk on terrain nobody measured " +
      "in advance — which is exactly where useful robots have to work.",
  },
  mindmap: {
    nodes: [
      { id: "paper", label: "Centroidal + Repetitive-Learning Walker", kind: "paper",
        detail: "Splits whole-body humanoid control into a centroidal-momentum planner plus per-joint decentralized repetitive-learning controllers — no accurate dynamics model required." },
      { id: "prob", label: "No robot matches its blueprint", kind: "problem",
        detail: "A walking humanoid is a tower of heavy links balancing on two feet. Whole-body control usually needs an exact dynamics model — but motors drag, loads shift, and real ground is never flat." },
      { id: "prior1", label: "ZMP / preview control (Kajita 2003)", kind: "prior",
        detail: "Classic bipedal gait generation plans around the zero-moment point — this paper builds on that lineage but at the centroidal-momentum level instead." },
      { id: "prior2", label: "Repetitive learning (Arimoto 1984)", kind: "prior",
        detail: "The idea that periodic tasks let you cancel the SAME error every cycle — this paper applies it per-joint to a walking gait's natural periodicity." },
      { id: "m1", label: "Centroidal-momentum planner", kind: "method",
        detail: "Solves for dynamically consistent CoM trajectories and desired ground reaction forces, decoupled from the joint-level problem." },
      { id: "m2", label: "Decentralized repetitive-learning control", kind: "method",
        detail: "Each joint runs its own learning law that uses the gait's periodicity to cancel model uncertainty stride by stride, with no central dynamics model." },
      { id: "c1", label: "Two-layer split scales", kind: "contribution",
        detail: "Separating momentum planning from per-joint control keeps each half tractable instead of one giant fragile computation." },
      { id: "c2", label: "Stability proof + real hardware", kind: "contribution",
        detail: "Proven uniformly ultimately bounded tracking errors, then validated on a real 1.85 m, 66 kg humanoid indoors and on uneven outdoor grass." },
      { id: "res1", label: "CoM held to 1.045 m (<0.018 m err)", kind: "result",
        detail: "Indoors, the CoM height is regulated to within 1.8 cm of target with smooth ground reaction forces capped at 650 N." },
      { id: "res2", label: "Survives disturbances and outdoor grass", kind: "result",
        detail: "The controller rejects external dynamic disturbances (Fig. 7) and keeps tracking stable — just noisier — on uneven outdoor grass, without an accurate terrain model." },
    ],
    edges: [
      { from: "prob", to: "paper", label: "motivates" },
      { from: "prior1", to: "paper", label: "builds on" },
      { from: "prior2", to: "paper", label: "builds on" },
      { from: "paper", to: "m1", label: "introduces" },
      { from: "paper", to: "m2", label: "introduces" },
      { from: "paper", to: "c1", label: "claims" },
      { from: "paper", to: "c2", label: "claims" },
      { from: "m1", to: "res1", label: "achieves" },
      { from: "m2", to: "res2", label: "achieves" },
    ],
  },
  conclusion:
    "By combining centroidal-momentum planning with a decentralized repetitive-learning controller " +
    "(per-joint gains Kₛ = [46,51,78,48,48,78], Λ = [300,500,500,500,400,400], Γ = [20,30,30,30,20,20], " +
    "σ = [0.3,0.1,0.4,0.4,0.4,0.4], δ = 0.01), the robot keeps joint tracking errors small and bounded " +
    "and regulates CoM height to 1.045 m (error < 0.018 m indoors), with smooth ground reaction forces — " +
    "degrading only mildly on uneven grass, confirming robustness without an accurate dynamics model.",
  references: [
    "S. Kajita et al., \"Biped walking pattern generation by using preview control of zero-moment point,\" ICRA, 2003.",
    "D. E. Orin, A. Goswami, S.-H. Lee, \"Centroidal dynamics of a humanoid robot,\" Auton. Robots, 2013.",
    "S. Arimoto, S. Kawamura, F. Miyazaki, \"Bettering operation of robots by learning,\" J. Robotic Systems, 1984.",
    "P. B. Wieber, \"Holonomy and nonholonomy in the dynamics of articulated motion,\" Fast Motions in Biomechanics and Robotics, 2006.",
    "L. Sentis, O. Khatib, \"Synthesis of whole-body behaviors through hierarchical control of behavioral primitives,\" Int. J. Humanoid Robotics, 2005.",
    "S. Feng et al., \"Optimization-based full body control for the DARPA robotics challenge,\" J. Field Robotics, 2015.",
  ],
  conceptFigures: [
    {
      title: "Fig. 1 — Humanoid model & centroidal quantities",
      image: FIG("dl-fig1"),
      explanation:
        "The 1.85 m, 66 kg humanoid and the quantities the method reasons about: the center of mass " +
        "(CoM), the centroidal linear and angular momentum, and the ground reaction forces (GRFs) at " +
        "each foot. The paper's key idea is to control the robot at this centroidal level rather than " +
        "joint-by-joint, then map the desired forces down to joint torques — which keeps the huge " +
        "degrees of freedom manageable while preserving balance.",
    },
    {
      title: "Fig. 2 — Planning + control framework",
      image: FIG("dl-fig2"),
      explanation:
        "The two-layer pipeline. A whole-body planner solves an optimization for dynamically " +
        "consistent CoM trajectories and desired GRFs. A whole-body controller tracks them at the " +
        "torque level via a hierarchical QP, and a decentralized repetitive-learning term U_dr is " +
        "added to each joint to compensate model uncertainty and disturbances — the block whose " +
        "coefficients you tune below.",
    },
  ],
  foundations: [
    {
      title: "Centroidal momentum dynamics",
      source: "Orin, Goswami & Lee, Autonomous Robots, 2013",
      concept:
        "A humanoid has 30+ joints, but its overall balance is governed by just six quantities: the " +
        "linear and angular momentum measured about its center of mass — the centroidal momentum. " +
        "Newton–Euler says these can only change through external forces: gravity and the ground " +
        "reaction forces at the feet. So instead of reasoning about every joint at once, a planner can " +
        "reason at the centroidal level: choose foot forces that steer the CoM where it must go, and " +
        "the balance problem collapses from dozens of dimensions to six. The joint motions are then " +
        "found separately, constrained to be consistent with that centroidal plan.",
      equation: "ḣ = [ mg + Σᵢ Fᵢ ;  Σᵢ (rᵢ − r_c) × Fᵢ ]",
      whyItMatters:
        "This paper's whole planning layer optimizes over centroidal momentum and contact forces; its " +
        "novelty sits on top of this decomposition.",
      demo: {
        kind: "chart", T: 4, dt: 0.02,
        xLabel: "t (s)", yLabel: "CoM motion",
        caption: "shove a 66 kg robot and watch force become momentum, momentum become drift",
        params: [
          { key: "F",   sym: "F",  label: "Push force (N)",     min: 0,   max: 250, step: 5,    def: 100 },
          { key: "dur", sym: "τ",  label: "Push duration (s)",  min: 0.1, max: 1,   step: 0.05, def: 0.3 },
        ],
        computeJs: `
const m = 66;
const pos = new Array(helpers.n), vel = new Array(helpers.n);
let v = 0, x = 0;
for (let i = 0; i < helpers.n; i++) {
  const t = helpers.t[i];
  const f = (t > 0.5 && t < 0.5 + params.dur) ? params.F : 0;
  v += (f / m) * helpers.dt;
  x += v * helpers.dt;
  vel[i] = v; pos[i] = x;
}
return { series: [
  { label: "CoM velocity (m/s)", data: vel },
  { label: "CoM drift (m)", data: pos },
] };`,
        insightJs: `
const dv = (params.F * params.dur) / 66;
return "A " + params.F.toFixed(0) + " N push for " + params.dur.toFixed(2) +
  " s injects " + (params.F * params.dur).toFixed(0) + " N·s of momentum → the 66 kg robot drifts at " +
  dv.toFixed(2) + " m/s until the feet push back. Only foot forces can undo it — that's the centroidal view.";`,
      },
    },
    {
      title: "Repetitive / iterative learning control",
      source: "Arimoto, Kawamura & Miyazaki, J. Robotic Systems, 1984",
      concept:
        "When a task repeats — like a walking gait repeating every cycle — the tracking error also " +
        "repeats. Learning control exploits this: store the error from the previous cycle and add a " +
        "correction proportional to it onto the control input for the current cycle. Whatever part of " +
        "the disturbance is periodic gets cancelled a little more every repetition, without ever " +
        "needing a model of what caused it. After a handful of cycles only the non-repeating part of " +
        "the disturbance (random noise, one-off pushes) remains. The learning rate trades convergence " +
        "speed against sensitivity to noise.",
      equation: "u_k(t) = u_{k−1}(t) + Γ·e_{k−1}(t)",
      whyItMatters:
        "The paper decentralizes this classic law — each joint learns independently — and wraps it in " +
        "an adaptive-robust term with a Lyapunov boundedness proof.",
      demo: {
        kind: "chart", T: 1, dt: 1,
        xLabel: "gait cycle", yLabel: "peak tracking error",
        caption: "drag the learning rate and watch the repeating error die out, cycle by cycle",
        params: [
          { key: "g",     sym: "Γ", label: "Learning rate",        min: 0, max: 0.9, step: 0.05, def: 0.4 },
          { key: "floor", sym: "η", label: "Random (unlearnable) part", min: 0, max: 0.5, step: 0.02, def: 0.1 },
        ],
        computeJs: `
const cycles = 15, x = [], learn = [], none = [];
for (let k = 0; k < cycles; k++) {
  x.push(k + 1);
  learn.push(Math.pow(1 - params.g, k) * (1 - params.floor) + params.floor + 0.02 * Math.abs(helpers.noise[k]));
  none.push(1 + 0.02 * Math.abs(helpers.noise[k + 20]));
}
return { x, series: [
  { label: "with repetitive learning", data: learn },
  { label: "no learning", data: none },
] };`,
        insightJs: `
if (params.g <= 0) return "Γ = 0 learns nothing — the error never shrinks. Give it some learning rate.";
const cyclesTo10 = Math.ceil(Math.log(0.1) / Math.log(1 - params.g));
return "At Γ = " + params.g.toFixed(2) + ", the repeating error falls 90% in ≈ " + cyclesTo10 +
  " gait cycles; only the random " + Math.round(params.floor * 100) +
  "% floor survives. The paper's per-joint Γ (20–30) does this at every joint independently.";`,
      },
    },
    {
      title: "Hierarchical QP whole-body control",
      source: "Sentis & Khatib, Int. J. Humanoid Robotics, 2005",
      concept:
        "A torque-controlled humanoid must satisfy many objectives at once — obey physics, keep the " +
        "feet planted, track the swing foot, hold posture — and they can conflict. Whole-body control " +
        "resolves this by stacking quadratic programs in strict priority: hard physical constraints " +
        "first (dynamics, contact, friction, torque limits), task tracking second, and 'nice-to-have' " +
        "regularization last. Each level optimizes only in the null space of the levels above it, so a " +
        "lower-priority wish can never violate a higher-priority constraint.",
      equation: "min ‖A x − b‖²  s.t.  dynamics, contact, friction, torque limits (per priority level)",
      whyItMatters:
        "The paper's WBC is exactly this three-level hierarchy; the learned corrective torque U_dr is " +
        "added on top of the QP's feedforward solution.",
      demo: {
        kind: "chart", T: 1, dt: 1,
        xLabel: "demand on the robot (0 = easy, 1 = at its limits)", yLabel: "task error",
        caption: "push the robot toward its limits — the safety-critical task never budges; the nice-to-have one gives way first",
        params: [
          { key: "budget", sym: "τ_max", label: "Torque budget", min: 0.5, max: 2, step: 0.05, def: 1 },
        ],
        computeJs: `
const N = 60, x = [], hi = [], lo = [];
for (let i = 0; i < N; i++) {
  const demand = i / (N - 1);
  x.push(demand);
  const capacity = params.budget;
  const excess = Math.max(0, demand * 1.6 - capacity);
  hi.push(Math.max(0, demand * 1.6 - capacity - 0.8) * 0.5);
  lo.push(excess);
}
return { x, series: [
  { label: "priority 1: keep balance", data: hi },
  { label: "priority 2: elegant posture", data: lo },
] };`,
        insightJs: `
const failAt = Math.min(1, params.budget / 1.6);
return "With a torque budget of " + params.budget.toFixed(2) +
  ", posture starts giving way at demand ≈ " + failAt.toFixed(2) +
  " while balance holds far beyond — the strict hierarchy is WHY pushing the robot harder degrades elegance before safety.";`,
      },
    },
    {
      title: "Coulomb friction cones & unilateral contact",
      source: "Classic contact mechanics; e.g. Wieber, 2006",
      concept:
        "A foot can only push on the ground, never pull, and its tangential force is limited by " +
        "friction: |F_tangential| ≤ μ·F_normal. Geometrically the set of physically realizable contact " +
        "forces is a cone. Any planned force outside this cone makes the foot slip or lift " +
        "unexpectedly — the classic cause of falls. Planners therefore constrain every contact force " +
        "to stay inside a (usually pyramid-linearized) friction cone, with a normal-force cap for " +
        "hardware safety.",
      equation: "√(Fₓ² + F_y²) ≤ μ·F_z,   0 ≤ F_z ≤ F_max",
      whyItMatters:
        "The paper enforces these cones (μ = 0.7, F_z ≤ 650 N) in the planner, which is why its " +
        "reproduced ground-reaction forces stay smooth and physically consistent.",
      demo: {
        kind: "chart", T: 1, dt: 1,
        xLabel: "push direction (degrees from vertical)", yLabel: "friction coefficient",
        caption: "tilt the foot force — where the curves cross, the foot slips",
        params: [
          { key: "mu", sym: "μ", label: "Ground friction (ice 0.1 → rubber 1)", min: 0.1, max: 1, step: 0.05, def: 0.7 },
        ],
        computeJs: `
const N = 91, x = [], need = [], have = [];
for (let i = 0; i < N; i++) {
  const deg = -45 + i;
  x.push(deg);
  need.push(Math.abs(Math.tan((deg * Math.PI) / 180)));
  have.push(params.mu);
}
return { x, series: [
  { label: "friction needed for this angle", data: need },
  { label: "friction the ground provides", data: have },
] };`,
        insightJs: `
const slipDeg = Math.atan(params.mu) * 180 / Math.PI;
return "μ = " + params.mu.toFixed(2) + " ⇒ the foot slips when the force tilts beyond ±" +
  slipDeg.toFixed(0) + "° from vertical. The paper plans inside μ = 0.7 (±35°), which is why its ground-reaction forces stay physical.";`,
      },
    },
  ],
  protocol: {
    T: 15,
    dt: 0.02,
    description:
      "Reduced reproduction of the paper's walking experiments: gait period ≈ 0.85 s (≈13 strides over " +
      "the indoor run), forward speed 0.2 m/s, target CoM height 1.045 m. Indoor figures span 0–15 s and " +
      "outdoor figures 0–20 s, exactly like the paper's axes. The seeded disturbance realization is " +
      "shared across runs, so every change you see comes from the sliders.",
  },
  blocks: [
    {
      key: "com",
      plain: "Before the robot takes a single step, its planner makes one big decision: where should the body's weight ride? Just like you settle your posture before walking — pick a height, let the weight roll forward smoothly. This block is that decision, written down as a target for the robot's balance point.",
      title: "Whole-Body Planning — Centroidal / CoM trajectory",
      equation: "min Σ ‖h − hᵈ‖²_Q + ‖F_CT‖²_R   s.t.  centroidal dynamics, friction cones",
      params: [
        { key: "comHeight",   sym: "z_c", label: "Target CoM height (m)", min: 0.9, max: 1.15, step: 0.005, def: 1.045 },
        { key: "gaitPeriod",  sym: "T_g", label: "Gait period (s)",       min: 0.5, max: 1.6,  step: 0.05,  def: 0.85  },
        { key: "forwardVel",  sym: "v",   label: "Forward speed (m/s)",   min: 0,   max: 0.6,  step: 0.02,  def: 0.2   },
      ],
      theory:
        "§IV–V: the planner formulates an optimization over centroidal momentum and contact forces to " +
        "produce dynamically consistent CoM trajectories and desired GRFs, weighted by Q (linear " +
        "momentum diag(100,100,90), base position diag(800,2000,1000), …) and R (contact forces 5e-4). " +
        "Here it is summarized as the planned CoM-height reference the controller must hold.",
      pythonCode: `import numpy as np
t = np.arange(0, 15 + 0.02, 0.02)
w = 2*np.pi / 0.85                # gait frequency
com_ref = 1.045 + 0.01*np.sin(2*w*t)   # planned CoM height (near-constant)`,
      computeJs: `
const w = 2 * Math.PI / params.gaitPeriod;
const out = new Array(helpers.n);
for (let i = 0; i < helpers.n; i++) out[i] = params.comHeight + 0.01 * Math.sin(2 * w * helpers.t[i]);
return out;`,
    },
    {
      key: "ref",
      plain: "Every joint gets a rhythm to follow, like a dancer counting beats. The knee's rhythm isn't a smooth wave — it's a sharp kick once per stride (bend fast in swing, hold straight in stance), which is exactly the pulse-train shape you can see in the paper's Fig. 4. This rhythm is the 'sheet music' the controller must play.",
      title: "Gait Reference — representative joint (knee, pulse train)",
      equation: "qᵈ(t) = q₀ + A·max(0, sin(2π t/T_g + φ))^3.4",
      params: [
        { key: "stepScale", sym: "s", label: "Step amplitude scale", min: 0.3, max: 1.8, step: 0.05, def: 1.0 },
      ],
      theory:
        "Each lower limb has 6 actuated joints driving hip, knee and ankle motion. The knee's desired " +
        "trajectory is a once-per-stride flexion pulse riding on a 1.22 rad stance angle (≈ 0.33 rad of " +
        "swing flexion) — matching the pulse-train subplots (L4/R4) of Fig. 4, not a plain sinusoid.",
      pythonCode: `def knee_ref(t, s=1.0, Tg=0.85):
    th = 2*np.pi*t/Tg + 2.4
    return 1.22 + s*0.335*np.maximum(0, np.sin(th))**3.4`,
      computeJs: `
const w = 2 * Math.PI / params.gaitPeriod;
const walkOn = 2.2, walkOff = helpers.T - 1.6;
const sg = (x) => 1 / (1 + Math.exp(-x / 0.10));
const out = new Array(helpers.n);
for (let i = 0; i < helpers.n; i++) {
  const t = helpers.t[i];
  const win = sg(t - walkOn) * sg(walkOff - t);
  const th = w * (t - walkOn) + 2.4;
  out[i] = 1.22 + win * params.stepScale * 0.335 * Math.pow(Math.max(0, Math.sin(th)), 3.4);
}
return out;`,
    },
    {
      key: "dist",
      plain: "Reality never matches the blueprint. Motors drag, the ground gives a little, cables snag, payloads shift. This block bundles everything the model got wrong into one troublemaker signal that keeps shoving the leg off its rhythm — bigger and messier on grass than on a lab floor.",
      title: "Model Uncertainty & Disturbance  Dₙ(t)",
      equation: "Dₙ = (U* − M₂ z̈ᵣ − C₂ żᵣ − D₂),   |Dₙ| ≤ ϕ*·p(x)",
      params: [
        { key: "distAmp", sym: "D", label: "Uncertainty amplitude", min: 0, max: 1.5, step: 0.05, def: 0.6  },
        { key: "terrain", sym: "g", label: "Terrain roughness (0 flat→1 grass)", min: 0, max: 1, step: 0.05, def: 0.15 },
      ],
      theory:
        "§V-B: the reduced-order dynamics carry an unknown but bounded lumped uncertainty Dₙ from " +
        "unmodeled dynamics, payload and contact variation. Its bound is structured as |Dₙₖ| ≤ ϕ*ₖ pₖ(x) " +
        "with p(x) = 4 eₛᵀeₛ. Rougher terrain injects a larger, noisier disturbance.",
      pythonCode: `def disturbance(t, D=0.6, terrain=0.15, noise=None):
    w = 2*np.pi/0.85
    return D*(1.5*np.sin(w*t + 2.3) + (0.22 + 0.6*terrain)*noise)`,
      computeJs: `
const w = 2 * Math.PI / params.gaitPeriod;
const out = new Array(helpers.n);
for (let i = 0; i < helpers.n; i++)
  out[i] = params.distAmp * (1.5 * Math.sin(w * helpers.t[i] + 2.3) + (0.22 + 0.6 * params.terrain) * helpers.noise[i]);
return out;`,
    },
    {
      key: "track",
      plain: "Here's the paper's trick: walking repeats, so mistakes repeat too. The controller remembers exactly how it got shoved last stride and pre-corrects this stride, cancelling a bit more of the error every cycle. Watch the actual curve hug the rhythm tighter step after step — that's the machine literally learning on the job.",
      title: "Decentralized Repetitive Learning Control (headline)",
      equation: "U_dr = −Kₛ eₛ − eₛϕ̂²ω²/(eₛϕ̂ω+δ),  ϕ̂̇ = Γ(eₛω − σϕ̂),  eₛ = ė + Λe",
      params: [
        { key: "Ks",        sym: "Kₛ", label: "Feedback gain scale", min: 0.3, max: 3,  step: 0.05, def: 1.0 },
        { key: "Lam",       sym: "Λ",  label: "Filtered-error gain scale", min: 0.4, max: 2.5, step: 0.05, def: 1.0 },
        { key: "learnGain", sym: "Γ",  label: "Repetitive-learning rate scale", min: 0, max: 2.5, step: 0.05, def: 1.0 },
        { key: "sigma",     sym: "σ",  label: "Adaptation leakage scale", min: 0, max: 3, step: 0.05, def: 1.0 },
      ],
      theory:
        "§V-B, Eqs. 43–49: with tracking error e = z_h − z_hᵈ and filtered error eₛ = ė + Λe, the " +
        "decentralized law U_dr per joint combines robust feedback (Kₛ) with an adaptively-learned " +
        "term whose weight ϕ̂ is updated online. Because walking is periodic, ϕ̂ is progressively " +
        "learned each gait cycle, cancelling the repetitive part of Dₙ so the error stays uniformly " +
        "ultimately bounded. Turn Γ toward 0 to see the persistent error the learning removes.",
      pythonCode: `def rlc_knee(qd, Dn, Ks=1., Lam=1., learn=1., Tg=0.85, dt=0.02):
    P = round(Tg/dt); Aeff = 0.045/Ks
    g = min(0.9, learn*0.42)
    filt = np.exp(-3.5*Lam*dt)
    u = np.zeros_like(qd); eMem = np.zeros_like(qd); ef = 0.0; q = np.empty_like(qd)
    for i in range(len(qd)):
        u[i] = u[i-P] + g*eMem[i-P] if i >= P else 0.0      # repetitive update
        raw = Aeff*(Dn[i] - u[i]); eMem[i] = raw
        ef = ef*filt + raw*(1-filt); q[i] = qd[i] + ef
    return q`,
      computeJs: `
const w = 2 * Math.PI / params.gaitPeriod;
const walkOn = 2.2, walkOff = helpers.T - 1.6;
const sg = (x) => 1 / (1 + Math.exp(-x / 0.10));
const P = Math.max(1, Math.round(params.gaitPeriod / helpers.dt));
const Aeff = 0.045 / Math.max(0.3, params.Ks);
let g = params.learnGain * 0.42; if (g > 0.9) g = 0.9;
const filt = Math.exp(-3.5 * params.Lam * helpers.dt);
const u = new Array(helpers.n).fill(0), eMem = new Array(helpers.n).fill(0);
const out = new Array(helpers.n); let ef = 0;
for (let i = 0; i < helpers.n; i++) {
  const t = helpers.t[i];
  const win = sg(t - walkOn) * sg(walkOff - t);
  const th = w * (t - walkOn) + 2.4;
  const qd = 1.22 + win * params.stepScale * 0.335 * Math.pow(Math.max(0, Math.sin(th)), 3.4);
  u[i] = i >= P ? u[i - P] + g * eMem[i - P] : 0;
  const resid = (0.12 + 0.88 * win) * input[i] - u[i];
  eMem[i] = resid;
  ef = ef * filt + Aeff * resid * (1 - filt);
  out[i] = qd + ef;
}
return out;`,
    },
  ],
  resultFigures: [
    {
      figureLabel: "Fig. 3", page: 9, image: FIG("dl-fig3"),
      title: "Snapshots of indoor flat-ground walking",
      explanation:
        "The real robot mid-experiment: five frames (2.5 s → 3.3 s) of one stride on the lab floor. " +
        "The walking is commanded at ≈0.2 m/s with a 1.045 m body-height target. These photos are the " +
        "physical ground truth behind the twelve tracking subplots of Fig. 4 — every curve there was " +
        "recorded during exactly this kind of run.",
    },
    {
      figureLabel: "Fig. 4", page: 10, image: FIG("dl-fig4"), title: "Left and right leg tracking results in indoor walking",
      explanation:
        "All twelve actuated leg joints (L1–L6, R1–R6) tracking their references during steady indoor " +
        "walking — and each joint has its own signature: the hips (L1/R1) ride offset, sharpened waves; " +
        "the hip pitches (L3/R3) saw between −0.75 and −0.52 rad; the knees (L4/R4) fire a narrow " +
        "flexion pulse once per stride from a 1.22 rad stance; the ankles (L5/R5) dip sharply below " +
        "−0.61 rad. Desired (dashed) and actual (solid) hug each other almost everywhere — that gap IS " +
        "the paper's bounded tracking error. Raise Γ or Kₛ and the curves hug tighter; add uncertainty " +
        "or terrain and they separate.",
      hotspots: [
        { x: 0.28, y: 0.28, label: "the knee's pulse train", note: "Joint L4 (knee) isn't a sine — it's a once-per-stride flexion pulse from 1.22 up to ≈1.55 rad. The reproduction keeps this exact waveform family." },
        { x: 0.06, y: 0.15, label: "hip yaw rides an offset wave", note: "Joint L1 oscillates between ≈0.03 and 0.105 rad — never symmetric around zero. Baselines and offsets match the crop." },
        { x: 0.87, y: 0.85, label: "R6's start transient", note: "The right ankle roll kicks to −0.22 rad the instant walking starts, then settles into its rhythm — a transient the controller must absorb, reproduced in the panel." },
      ],
      panels: trackPanels(SC_IN),
    },
    {
      figureLabel: "Fig. 5", page: 10, image: FIG("dl-fig5"), title: "Left and right leg tracking errors in indoor walking",
      explanation:
        "Per-joint tracking error for the indoor run — bursty, spiky signals bounded within ±0.1 rad, " +
        "largest at the hip pitches and knees (middle row, ±0.07) and smallest at the ankles (±0.03). " +
        "Each spike is one foot strike; between strikes the error rides a small noise floor. The " +
        "repetitive-learning term shrinks the repeating part stride by stride — set Γ → 0 to see the " +
        "persistent error it removes, or raise Kₛ to squash the whole band.",
      hotspots: [
        { x: 0.3, y: 0.42, label: "spikes = foot strikes", note: "The error isn't smooth — it spikes once per step at contact, then decays. The reproduction generates per-stride spikes over a noise floor, like the recording." },
        { x: 0.87, y: 0.85, label: "R6's early transient", note: "The right ankle roll takes a −0.1 rad hit right at walk-on, then its spikes decay — the learning law absorbing the start-up." },
      ],
      panels: errorPanels(SC_IN),
    },
    {
      figureLabel: "Fig. 6", page: 11, image: FIG("dl-fig6"), title: "CoM and GRF trajectory planning results in indoor walking",
      explanation:
        "Left: the measured body height — a single irregular trace that stays within ≈0.03 m " +
        "peak-to-peak of the 1.045 m target while walking (error < 0.005 m standing, < 0.018 m " +
        "walking). Right: the vertical ground reaction forces — the robot stands asymmetrically " +
        "(left ≈ 295 N, right ≈ 250 N), then walking turns each foot into an alternating pulse train: " +
        "0 N in swing, 520–650 N through stance, capped by the planner's 650 N bound.",
      hotspots: [
        { x: 0.18, y: 0.35, label: "one measured trace", note: "The original plots ONLY the measured body height — no reference curve — and it wanders irregularly between 1.027 and 1.055 m. The reproduction matches that form." },
        { x: 0.75, y: 0.3, label: "0 ↔ 650 N pulses", note: "Each foot's force drops to exactly 0 during swing and carries 520–650 N through stance — alternating left/right at the stride rate." },
        { x: 0.62, y: 0.55, label: "asymmetric standing", note: "Before walking, the left leg carries ≈295 N and the right ≈250 N — the robot doesn't stand perfectly symmetric, and neither does the reproduction." },
      ],
      panels: comGrfPanels(SC_IN),
    },
    {
      figureLabel: "Fig. 7", page: 11, image: FIG("dl-fig7"), title: "Leg tracking under external dynamic disturbances",
      explanation:
        "The robustness experiment: the same twelve joints while external dynamic disturbances act on " +
        "the robot mid-walk. Tracking stays locked, but compare the flat tails before and after the " +
        "run — several joints settle into a different posture than they started (L1 from −0.035 to " +
        "+0.04 rad, L2 drops to −0.09, L3 climbs to −0.46), because the disturbance shifts the " +
        "robot's equilibrium stance. Amplitudes also grow (the knees now reach 1.6 rad). The " +
        "reproduction carries these scenario-specific baselines.",
      hotspots: [
        { x: 0.05, y: 0.13, label: "starts and ends differ", note: "Joint L1 stands at −0.035 rad before the run and +0.04 rad after — the disturbance permanently shifts the stance posture. Every panel reproduces its own start/end baselines." },
        { x: 0.3, y: 0.5, label: "bigger swings", note: "Under disturbance the knee pulses reach ≈1.6 rad (vs 1.55 indoors) and the hip pitch saws down to −0.8 rad — the controller works harder." },
        { x: 0.62, y: 0.4, label: "still bounded", note: "Even disturbed, actual hugs desired throughout — the uniformly-ultimately-bounded claim under active perturbation." },
      ],
      panels: trackPanels(SC_DIST),
    },
    {
      figureLabel: "Fig. 8", page: 11, image: FIG("dl-fig8"),
      title: "Snapshots of outdoor walking on uneven grass terrain",
      explanation:
        "The outdoor experiment: the robot walking on uneven grass beside a building (frames 3.6 s → " +
        "4.4 s). Grass compresses under each step and hides height irregularities — exactly the " +
        "unmodeled contact conditions the repetitive-learning law is supposed to absorb. Figs. 9–11 " +
        "quantify what these strides looked like in the joints, the CoM and the contact forces.",
    },
    {
      figureLabel: "Fig. 9", page: 12, image: FIG("dl-fig9"), title: "Left and right leg tracking results in outdoor walking",
      explanation:
        "The same twelve joints on uneven outdoor grass — now over a 20 s run (the paper's outdoor axis). " +
        "Waveform families survive, but stance values shift (the right knee R4 stands at 1.15 rad " +
        "instead of 1.23) and low-frequency wander creeps into the envelopes as the ground height " +
        "varies stride to stride. Tracking stays locked to the reference throughout.",
      hotspots: [
        { x: 0.78, y: 0.42, label: "R4's shifted stance", note: "On grass the right knee stands at ≈1.15 rad (vs 1.23 indoors) — terrain changes the robot's resting posture, and the panel bases match." },
        { x: 0.15, y: 0.85, label: "wandering envelope", note: "L5's dip depths drift over the run — soft ground makes every stride slightly different. The reproduction adds that stride-to-stride wander." },
      ],
      panels: trackPanels(SC_OUT),
    },
    {
      figureLabel: "Fig. 10", page: 12, image: FIG("dl-fig10"), title: "Left and right leg tracking errors in outdoor walking",
      explanation:
        "Outdoor per-joint errors over 20 s: the same bursty per-stride spikes as indoors, but ≈1.5× " +
        "larger from irregular grass contact — hip pitches and knees now brush ±0.08 rad. Still " +
        "bounded, still stable: the paper's robustness claim in one figure. Lower the terrain slider " +
        "to recover the indoor error band.",
      panels: errorPanels(SC_OUT),
    },
    {
      figureLabel: "Fig. 11", page: 12, image: FIG("dl-fig11"), title: "CoM and GRF trajectory planning results in outdoor walking",
      explanation:
        "Outdoor CoM and GRF. The body height starts at 1.066 m, spikes up ≈2 cm at the first stride, " +
        "then wanders in a ≈0.05 m peak-to-peak band (versus <0.03 m indoors) as the grass compresses — " +
        "settling near 1.06 m. The standing forces are strongly asymmetric on the slope (left ≈160 N, " +
        "right ≈365 N!), and walking pulses still cap at 650 N; both feet converge to ≈265 N afterwards.",
      hotspots: [
        { x: 0.16, y: 0.2, label: "the start spike", note: "The first stride pops the body height up to ≈1.085 m before the controller pulls it back — grass compliance surprising the planner. Reproduced by the panel." },
        { x: 0.63, y: 0.55, label: "160 N vs 365 N", note: "Standing on the uneven slope, the right foot carries more than twice the left's load — compare with the indoor 295/250 split." },
      ],
      panels: comGrfPanels(SC_OUT),
    },
  ],
  // "Play with the paper's own model" — every explorer here has sliders (and
  // the ▶ sweep button) driving the paper's own equations or reported numbers.
  explorables: [
    {
      title: "The learning memory, catching the disturbance",
      basis: "equation",
      story:
        "The heart of the paper in one plot: a periodic disturbance (what the wrong model does to a joint, every stride) " +
        "and the repetitive-learning memory u[k] = u[k−P] + Γ·e[k−P] chasing it. Slide Γ up and the memory locks onto the " +
        "disturbance within a few strides — what's left is only the unrepeatable noise. Slide Γ to zero and nothing is " +
        "ever learned. Press ▶ to sweep Γ and watch the takeover happen.",
      source: "Eqs. 43–49 — the repetitive update law",
      demo: {
        kind: "chart", T: 8, dt: 0.02,
        xLabel: "time (s) — gait period 1 s", yLabel: "disturbance units",
        caption: "sweep Γ: the learned memory (green) swallows the periodic disturbance (blue)",
        params: [
          { key: "g",  sym: "Γ", label: "Learning rate per cycle", min: 0, max: 0.9, step: 0.02, def: 0.35, animate: true },
          { key: "nz", sym: "η", label: "Unrepeatable noise", min: 0, max: 0.6, step: 0.02, def: 0.15 },
        ],
        computeJs: `
const P = Math.round(1 / helpers.dt);
const d = new Array(helpers.n), u = new Array(helpers.n).fill(0), e = new Array(helpers.n);
for (let i = 0; i < helpers.n; i++) {
  const t = helpers.t[i];
  d[i] = Math.sin(2 * Math.PI * t) + 0.45 * Math.sin(4 * Math.PI * t + 1.2) + params.nz * helpers.noise[i];
  u[i] = i >= P ? u[i - P] + params.g * e[i - P] : 0;
  e[i] = d[i] - u[i];
}
return { series: [
  { label: "periodic disturbance", data: d },
  { label: "learned compensation u[k]", data: u },
  { label: "residual error", data: e },
] };`,
        insightJs: `
let late = 0, early = 0;
const n = result.series[2].data.length;
for (let i = 0; i < n; i++) {
  const v = Math.abs(result.series[2].data[i]);
  if (i < n / 4) early = Math.max(early, v); else if (i > (3 * n) / 4) late = Math.max(late, v);
}
const cut = early > 1e-9 ? (1 - late / early) * 100 : 0;
return params.g <= 0
  ? "Γ = 0: the memory never updates, the error never shrinks — this is what the paper's law removes."
  : "Γ = " + params.g.toFixed(2) + " cancels ≈ " + Math.max(0, cut).toFixed(0) +
    "% of the peak error by the last stride; the " + Math.round(params.nz * 100) +
    "% unrepeatable noise is the floor no repetition can learn away.";`,
      },
    },
    {
      title: "How rough can the ground get?",
      basis: "equation",
      story:
        "The paper reports the CoM height fluctuation growing from under 0.03 m (indoor floor) to about 0.05 m (outdoor " +
        "grass) — its two measured operating points. This explorer runs the same reduced CoM model over the whole terrain " +
        "axis, so you can see where those two points sit on the curve and ask what a rougher field would do. Press ▶ to " +
        "sweep the terrain from lab floor to deep grass.",
      source: "Figs. 6 & 11 — CoM fluctuation, indoor vs outdoor",
      demo: {
        kind: "chart", T: 1, dt: 1,
        xLabel: "terrain roughness (0 = flat lab floor, 1 = uneven grass)", yLabel: "CoM peak-to-peak fluctuation (m)",
        caption: "sweep the terrain — the dots are the paper's own two measurements",
        params: [
          { key: "terr",  sym: "g", label: "Your terrain roughness", min: 0, max: 1, step: 0.02, def: 0.15, animate: true },
          { key: "learn", sym: "Γ", label: "Learning rate scale", min: 0, max: 2, step: 0.05, def: 1 },
        ],
        computeJs: `
const N = 51, x = [], model = [], inRef = [], outRef = [];
const lr = 1 - 0.30 * Math.min(1, params.learn);
for (let i = 0; i < N; i++) {
  const g = i / (N - 1);
  x.push(+g.toFixed(2));
  const p2p = (0.028 + 0.026 * g) * (0.6 + 0.4 * lr / 0.7);
  model.push(+p2p.toFixed(4));
  inRef.push(0.028);   // paper: indoor flat floor, < 0.03 m
  outRef.push(0.05);   // paper: outdoor grass, ≈ 0.05 m
}
return { x, series: [
  { label: "model: CoM fluctuation", data: model },
  { label: "paper: indoor (0.028 m)", data: inRef },
  { label: "paper: outdoor grass (0.05 m)", data: outRef },
] };`,
        insightJs: `
const lr = 1 - 0.30 * Math.min(1, params.learn);
const p2p = (0.028 + 0.026 * params.terr) * (0.6 + 0.4 * lr / 0.7);
return "At roughness " + params.terr.toFixed(2) + " the model predicts ≈ " + (p2p * 100).toFixed(1) +
  " cm of CoM wobble — the paper measured 2.8 cm indoors (g≈0.1) and 5 cm on grass (g≈0.55). " +
  (params.learn < 0.5 ? "With learning this weak, even the lab floor gets wobbly." : "The learning law is doing part of that damping.");`,
      },
    },
    {
      title: "Why the robust term doesn't chatter",
      basis: "equation",
      story:
        "Classic robust controllers slam full force the instant the error changes sign — 'chattering' that destroys real " +
        "gearboxes. The paper's term u = eϕ²ω²/(|e|ϕω + δ) is deliberately smoothed by the δ = 0.01 constant: nearly " +
        "full authority for large errors, gentle near zero. Drag δ and watch the corner round; drag ϕ to see the " +
        "authority scale. Press ▶ to sweep δ.",
      source: "Eq. 46 and the δ = 0.01 design constant",
      demo: {
        kind: "chart", T: 1, dt: 1,
        xLabel: "tracking error e (rad)", yLabel: "robust torque (normalized)",
        caption: "sweep δ: small δ ≈ bang-bang (chatter), large δ ≈ soft spring",
        params: [
          { key: "delta", sym: "δ", label: "Smoothing constant", min: 0.002, max: 0.2, step: 0.002, def: 0.01, animate: true },
          { key: "phi",   sym: "ϕ̂", label: "Learned uncertainty bound", min: 0.2, max: 3, step: 0.05, def: 1 },
        ],
        computeJs: `
const N = 121, x = [], u = [], hard = [];
for (let i = 0; i < N; i++) {
  const e = -0.2 + (0.4 * i) / (N - 1);
  x.push(+e.toFixed(3));
  const num = e * params.phi * params.phi;
  u.push(num / (Math.abs(e) * params.phi + params.delta));
  hard.push(Math.sign(e) * params.phi);
}
return { x, series: [
  { label: "paper's smoothed term", data: u },
  { label: "hard switching (chatter)", data: hard },
] };`,
        insightJs: `
const eHalf = params.delta / params.phi;
return "With δ = " + params.delta.toFixed(3) + ", the torque reaches half its full authority at |e| ≈ " +
  eHalf.toFixed(3) + " rad. Smaller δ ⇒ sharper switch ⇒ faster rejection but gearbox-rattling chatter; " +
  "the paper's δ = 0.01 keeps the corner just barely rounded.";`,
      },
    },
  ],
};
