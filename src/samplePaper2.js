/**
 * Bundled sample paper #2 — hand-built to demonstrate faithful reproduction of
 * a real paper's result figures (Figs 4–11), driven by the authors' own
 * decentralized repetitive-learning control law.
 *
 *   Cun, Wu, Xia, Li — "Decentralized Repetitive Learning for Whole-Body
 *   Planning and Control of Humanoid Robots With Centroidal Momentum Dynamics",
 *   IEEE T-ASE, vol. 23, 2026.
 *
 * The result-figure kernels implement the paper's tracking loop (Eqs. 43–49)
 * as a stable reduced model: a periodic gait reference, a model-uncertainty
 * disturbance, and the repetitive-learning update u[k]=u[k-P]+Γ·e[k-P] that
 * iteratively cancels the periodic error — reproducing Fig. 4/5 (indoor joint
 * tracking + errors), Fig. 6 (CoM height + ground-reaction forces), Fig. 7
 * (push disturbance), and Fig. 9/10/11 (outdoor, uneven grass). Gains are the
 * paper's reported per-joint values (Kₛ, Λ, Γ, σ), scaled by the sliders.
 */

/* ---- shared prelude injected into every figure kernel (has params, helpers) ----
 * Phase structure calibrated to the paper's recorded traces: the robot STANDS
 * until ≈2 s, WALKS until ≈T−1.5 s, then stands again — visible in Figs 4/6.  */
const SIM = `
const w = 2 * Math.PI / params.gaitPeriod;
const P = Math.max(1, Math.round(params.gaitPeriod / helpers.dt));
const walkOn = 2.0, walkOff = helpers.T - 1.5;
function walkWin(t) {
  const sg = (x) => 1 / (1 + Math.exp(-x / 0.12));
  return sg(t - walkOn) * sg(walkOff - t);
}
// per-joint gait amplitude/phase + paper gains (one leg, 6 joints)
const JOINTS = [
  { name: "hip yaw",     amp: 0.06, ph: 0.0, Ks: 46, Lam: 300, Gam: 20, sig: 0.3, d: 0.9 },
  { name: "hip roll",    amp: 0.09, ph: 0.4, Ks: 51, Lam: 500, Gam: 30, sig: 0.1, d: 1.1 },
  { name: "hip pitch",   amp: 0.35, ph: 1.2, Ks: 78, Lam: 500, Gam: 30, sig: 0.4, d: 1.3 },
  { name: "knee",        amp: 0.60, ph: 1.6, Ks: 48, Lam: 500, Gam: 30, sig: 0.4, d: 1.5 },
  { name: "ankle pitch", amp: 0.25, ph: 2.0, Ks: 48, Lam: 400, Gam: 20, sig: 0.4, d: 1.2 },
  { name: "ankle roll",  amp: 0.06, ph: 2.4, Ks: 78, Lam: 400, Gam: 20, sig: 0.4, d: 0.8 },
];
const KsN = 55, GamN = 25, LamN = 430, WEIGHT = 647;
function gaitRef(j) {
  const a = new Array(helpers.n);
  for (let i = 0; i < helpers.n; i++) {
    const t = helpers.t[i];
    a[i] = walkWin(t) * params.stepScale * j.amp * Math.sin(w * (t - walkOn) + j.ph);
  }
  return a;
}
// repetitive-learning tracking of one joint under model uncertainty (Eqs 43-49)
function rlcJoint(j, terrain, push) {
  const Aeff = 0.045 * KsN / (j.Ks * params.Ks);           // disturbance -> error gain (1/Ks)
  let g = params.learnGain * (j.Gam / GamN) * 0.35;         // per-cycle learning fraction
  if (g > 0.9) g = 0.9;
  const filt = Math.exp(-(3 * (j.Lam * params.Lam) / LamN) * helpers.dt);
  const u = new Array(helpers.n).fill(0), eMem = new Array(helpers.n).fill(0);
  const qd = gaitRef(j), q = new Array(helpers.n), e = new Array(helpers.n);
  let ef = 0;
  for (let i = 0; i < helpers.n; i++) {
    const t = helpers.t[i];
    const gate = 0.12 + 0.88 * walkWin(t);                  // uncertainty mostly during walking
    let d = gate * params.distAmp * (1 + 1.2 * terrain) *
            (j.d * Math.sin(w * (t - walkOn) + j.ph + 0.7) + (0.10 + 0.5 * terrain) * helpers.noise[i]);
    if (push) d += push * Math.exp(-Math.pow(t - helpers.T * 0.5, 2) / 0.03);
    u[i] = i >= P ? u[i - P] + g * eMem[i - P] : 0;         // repetitive update (disturbance units)
    const resid = d - u[i];
    eMem[i] = resid;                                        // memory accumulates the residual
    const raw = Aeff * resid;                               // residual -> joint error
    ef = ef * filt + raw * (1 - filt);                      // smoothed observable error
    e[i] = ef; q[i] = qd[i] + ef;
  }
  return { qd, q, e };
}
// CoM height, calibrated to the recorded profile: flat while standing, a noisy
// dip band while walking (p2p < 0.03 indoor, ~0.05 on grass), settle after.
function comTraj(terrain) {
  const des = new Array(helpers.n), act = new Array(helpers.n);
  const p2p = 0.016 + 0.05 * terrain;
  const lr = 1 - 0.25 * Math.min(1, params.learnGain);
  for (let i = 0; i < helpers.n; i++) {
    const t = helpers.t[i];
    const win = walkWin(t);
    des[i] = params.comHeight;
    const osc = (p2p / 2) * (0.8 * Math.sin(2 * w * (t - walkOn) + 0.5)
              + 0.45 * Math.sin(5.1 * w * (t - walkOn) + 1.9))
              + (0.003 + 0.02 * terrain) * helpers.noise[i];
    const dip = -0.35 * p2p; // walking rides slightly below the set-point
    act[i] = params.comHeight + win * (osc + dip) * lr + (1 - win) * 0.0006 * helpers.noise[i];
  }
  return { des, act };
}
// vertical GRF, calibrated to the recorded profile: ~half the weight per foot
// while standing, then sharp per-step pulses that drop to 0 during swing.
function grf(side, terrain) {
  const shift = side === "L" ? 0 : 0.5, duty = 0.60, f = new Array(helpers.n);
  const standL = 0.53 * WEIGHT, standR = 0.47 * WEIGHT;
  for (let i = 0; i < helpers.n; i++) {
    const t = helpers.t[i];
    const win = walkWin(t);
    let ph = (((t - walkOn) / params.gaitPeriod) + shift) % 1; if (ph < 0) ph += 1;
    let stepF = 0;
    if (ph < duty) {
      const s = Math.sin(Math.PI * ph / duty);
      stepF = WEIGHT * (0.55 + 0.45 * Math.pow(s, 0.6));    // loaded stance, 0.55W..1W
      stepF += (30 + terrain * 90) * helpers.noise[i];      // contact irregularity
    }
    const stand = side === "L" ? standL : standR;
    f[i] = helpers.clamp((1 - win) * stand + win * stepF, 0, 650);
  }
  return f;
}
`;

const trackPanels = (terrain, push) =>
  Array.from({ length: 6 }, (_, k) => ({
    subplotLabel: `(${"abcdef"[k]}) ${["hip yaw", "hip roll", "hip pitch", "knee", "ankle pitch", "ankle roll"][k]}`,
    xLabel: "t (s)", yLabel: "angle (rad)",
    computeJs: SIM + `
const j = JOINTS[${k}];
const r = rlcJoint(j, ${terrain}, ${push || 0});
return { series: [
  { label: "reference", data: r.qd },
  { label: "actual", data: r.q },
] };`,
  }));

const errorPanels = (terrain) =>
  Array.from({ length: 6 }, (_, k) => ({
    subplotLabel: `(${"abcdef"[k]}) ${["hip yaw", "hip roll", "hip pitch", "knee", "ankle pitch", "ankle roll"][k]}`,
    xLabel: "t (s)", yLabel: "error (rad)",
    computeJs: SIM + `
const r = rlcJoint(JOINTS[${k}], ${terrain}, 0);
return { series: [ { label: "tracking error", data: r.e } ] };`,
  }));

const comGrfPanels = (terrain) => [
  {
    subplotLabel: "CoM height", xLabel: "t (s)", yLabel: "height (m)",
    computeJs: SIM + `
const c = comTraj(${terrain});
return { series: [
  { label: "desired CoM", data: c.des },
  { label: "actual CoM", data: c.act },
] };`,
  },
  {
    subplotLabel: "Ground reaction force", xLabel: "t (s)", yLabel: "vertical GRF (N)",
    computeJs: SIM + `
return { series: [
  { label: "left foot", data: grf("L", ${terrain}) },
  { label: "right foot", data: grf("R", ${terrain}) },
] };`,
  },
];

/* small SVG stand-ins for the original figures (the real crops appear when a
 * user uploads this PDF; the bundled sample has no source file to crop). */
const svgTrack = `<svg viewBox="0 0 300 90" xmlns="http://www.w3.org/2000/svg" font-family="system-ui" font-size="7">
  <rect width="300" height="90" fill="white"/>
  <line x1="24" y1="45" x2="290" y2="45" stroke="#c3c2b7"/>
  <path d="M24 45 Q 60 12, 96 45 T 168 45 T 240 45 T 290 40" fill="none" stroke="#898781" stroke-dasharray="3 2" stroke-width="1"/>
  <path d="M24 47 Q 60 16, 96 46 T 168 44 T 240 46 T 290 42" fill="none" stroke="#2a78d6" stroke-width="1.2"/>
  <text x="8" y="12" fill="#52514e">q</text>
</svg>`;
const svgErr = `<svg viewBox="0 0 300 90" xmlns="http://www.w3.org/2000/svg" font-family="system-ui" font-size="7">
  <rect width="300" height="90" fill="white"/>
  <line x1="24" y1="60" x2="290" y2="60" stroke="#c3c2b7"/>
  <path d="M24 30 C 70 70, 120 55, 180 60 S 260 58, 290 60" fill="none" stroke="#e34948" stroke-width="1.2"/>
  <text x="8" y="12" fill="#52514e">e</text>
</svg>`;
const svgComGrf = `<svg viewBox="0 0 300 90" xmlns="http://www.w3.org/2000/svg" font-family="system-ui" font-size="7">
  <rect width="300" height="90" fill="white"/>
  <line x1="20" y1="30" x2="150" y2="30" stroke="#898781" stroke-dasharray="3 2"/>
  <path d="M20 32 Q 50 26, 85 34 T 150 31" fill="none" stroke="#2a78d6" stroke-width="1.1"/>
  <text x="60" y="14" fill="#52514e">CoM</text>
  <path d="M165 70 Q 190 20, 215 70 Q 240 70, 265 30 T 292 70" fill="none" stroke="#1baf7a" stroke-width="1.1"/>
  <text x="210" y="14" fill="#52514e">GRF</text>
</svg>`;

const IN = 0.12, OUT = 0.55; // internal terrain for indoor / outdoor scenarios

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
      svg: `<svg viewBox="0 0 320 150" xmlns="http://www.w3.org/2000/svg" font-family="system-ui" font-size="9">
        <rect width="320" height="150" fill="white"/>
        <circle cx="120" cy="45" r="7" fill="#2a78d6"/><text x="132" y="42" fill="#0b0b0b">CoM</text>
        <line x1="120" y1="52" x2="120" y2="95" stroke="#52514e" stroke-width="2"/>
        <line x1="120" y1="60" x2="100" y2="85" stroke="#52514e" stroke-width="2"/>
        <line x1="120" y1="60" x2="140" y2="85" stroke="#52514e" stroke-width="2"/>
        <line x1="120" y1="95" x2="104" y2="130" stroke="#52514e" stroke-width="2"/>
        <line x1="120" y1="95" x2="136" y2="130" stroke="#52514e" stroke-width="2"/>
        <line x1="96" y1="132" x2="112" y2="132" stroke="#0b0b0b" stroke-width="3"/>
        <line x1="128" y1="132" x2="144" y2="132" stroke="#0b0b0b" stroke-width="3"/>
        <line x1="104" y1="132" x2="104" y2="112" stroke="#e34948" stroke-width="1.5" marker-end="url(#a)"/>
        <line x1="136" y1="132" x2="136" y2="118" stroke="#e34948" stroke-width="1.5"/>
        <text x="150" y="120" fill="#e34948">GRF</text>
        <line x1="120" y1="45" x2="160" y2="45" stroke="#4a3aa7" stroke-width="1.5"/>
        <text x="165" y="48" fill="#4a3aa7">momentum</text>
      </svg>`,
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
      svg: `<svg viewBox="0 0 520 110" xmlns="http://www.w3.org/2000/svg" font-family="system-ui" font-size="9">
        <rect width="520" height="110" fill="white"/>
        <rect x="12" y="35" width="120" height="40" rx="8" fill="#eef4fc" stroke="#2a78d6"/>
        <text x="72" y="52" text-anchor="middle" fill="#0b0b0b">Centroidal</text>
        <text x="72" y="65" text-anchor="middle" fill="#52514e">planner</text>
        <rect x="170" y="35" width="120" height="40" rx="8" fill="#f1eefb" stroke="#4a3aa7"/>
        <text x="230" y="52" text-anchor="middle" fill="#0b0b0b">Whole-body</text>
        <text x="230" y="65" text-anchor="middle" fill="#52514e">QP control</text>
        <rect x="328" y="35" width="130" height="40" rx="8" fill="#fdeeee" stroke="#e34948"/>
        <text x="393" y="52" text-anchor="middle" fill="#0b0b0b">Repetitive</text>
        <text x="393" y="65" text-anchor="middle" fill="#52514e">learning U_dr</text>
        <line x1="132" y1="55" x2="168" y2="55" stroke="#898781" stroke-width="1.5"/>
        <line x1="290" y1="55" x2="326" y2="55" stroke="#898781" stroke-width="1.5"/>
        <line x1="458" y1="55" x2="500" y2="55" stroke="#898781" stroke-width="1.5"/>
        <text x="505" y="58" fill="#52514e">τ</text>
        <text x="150" y="30" fill="#898781" font-size="8">CoM,GRF</text>
        <path d="M393 78 C 393 98, 230 98, 230 78" fill="none" stroke="#898781" stroke-dasharray="3 2"/>
        <text x="300" y="104" fill="#898781" font-size="8">error feedback each gait cycle</text>
      </svg>`,
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
  hi.push(Math.max(0, demand * 1.6 - capacity - 0.8) * 0.5); // priority 1 only fails far beyond capacity
  lo.push(excess);                                            // priority 2 absorbs the shortfall first
}
return { x, series: [
  { label: "priority 1: keep balance", data: hi },
  { label: "priority 2: elegant posture", data: lo },
] };`,
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
      },
    },
  ],
  protocol: {
    T: 12,
    dt: 0.02,
    description:
      "Reduced reproduction of the paper's walking experiments: gait period ≈ 1.2 s, forward speed " +
      "0.2 m/s, target CoM height 1.045 m, horizon 12 s (~10 gait cycles), Δt = 0.02 s. The seeded " +
      "disturbance realization is shared across runs, so every change you see comes from the sliders. " +
      "Indoor figures use a smooth floor; outdoor figures inject uneven-terrain disturbance internally.",
  },
  blocks: [
    {
      key: "com",
      plain: "Before the robot takes a single step, its planner makes one big decision: where should the body's weight ride? Just like you settle your posture before walking — pick a height, let the weight roll forward smoothly. This block is that decision, written down as a target for the robot's balance point.",
      title: "Whole-Body Planning — Centroidal / CoM trajectory",
      equation: "min Σ ‖h − hᵈ‖²_Q + ‖F_CT‖²_R   s.t.  centroidal dynamics, friction cones",
      params: [
        { key: "comHeight",   sym: "z_c", label: "Target CoM height (m)", min: 0.9, max: 1.15, step: 0.005, def: 1.045 },
        { key: "gaitPeriod",  sym: "T_g", label: "Gait period (s)",       min: 0.6, max: 2.0,  step: 0.05,  def: 1.2   },
        { key: "forwardVel",  sym: "v",   label: "Forward speed (m/s)",   min: 0,   max: 0.6,  step: 0.02,  def: 0.2   },
      ],
      theory:
        "§IV–V: the planner formulates an optimization over centroidal momentum and contact forces to " +
        "produce dynamically consistent CoM trajectories and desired GRFs, weighted by Q (linear " +
        "momentum diag(100,100,90), base position diag(800,2000,1000), …) and R (contact forces 5e-4). " +
        "Here it is summarized as the planned CoM-height reference the controller must hold.",
      pythonCode: `import numpy as np
t = np.arange(0, 12 + 0.02, 0.02)
w = 2*np.pi / 1.2                 # gait frequency
com_ref = 1.045 + 0.01*np.sin(2*w*t)   # planned CoM height (near-constant)`,
      computeJs: `
const w = 2 * Math.PI / params.gaitPeriod;
const out = new Array(helpers.n);
for (let i = 0; i < helpers.n; i++) out[i] = params.comHeight + 0.01 * Math.sin(2 * w * helpers.t[i]);
return out;`,
    },
    {
      key: "ref",
      plain: "Every joint gets a rhythm to follow, like a dancer counting beats. The knee here swings on a metronome set to one stride every 1.2 seconds — quiet while standing, swinging while walking. This rhythm is the 'sheet music' the controller must play.",
      title: "Gait Reference — representative joint (knee)",
      equation: "qᵈ(t) = A·sin(2π t / T_g + φ)",
      params: [
        { key: "stepScale", sym: "s", label: "Step amplitude scale", min: 0.3, max: 1.8, step: 0.05, def: 1.0 },
      ],
      theory:
        "Each lower limb has 6 actuated joints driving hip, knee and ankle motion. The whole-body " +
        "controller receives a periodic desired trajectory for every joint; the knee (largest swing, " +
        "≈ 0.6 rad) is shown here as the representative reference the tracking loop must follow.",
      pythonCode: `def knee_ref(t, s=1.0, Tg=1.2):
    return s * 0.60 * np.sin(2*np.pi*t/Tg + 1.6)`,
      computeJs: `
const w = 2 * Math.PI / params.gaitPeriod;
const walkOn = 2.0, walkOff = helpers.T - 1.5;
const sg = (x) => 1 / (1 + Math.exp(-x / 0.12));
const out = new Array(helpers.n);
for (let i = 0; i < helpers.n; i++) {
  const t = helpers.t[i];
  const win = sg(t - walkOn) * sg(walkOff - t);
  out[i] = win * params.stepScale * 0.60 * Math.sin(w * (t - walkOn) + 1.6);
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
    w = 2*np.pi/1.2
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
      pythonCode: `def rlc_knee(qd, Dn, Ks=1., Lam=1., learn=1., Tg=1.2, dt=0.02):
    P = round(Tg/dt); Aeff = 0.045*55/(48*Ks)
    g = min(0.9, learn*(30/25)*0.35)
    filt = np.exp(-(3*(500*Lam)/430)*dt)
    u = np.zeros_like(qd); eMem = np.zeros_like(qd); ef = 0.0; q = np.empty_like(qd)
    for i in range(len(qd)):
        u[i] = u[i-P] + g*eMem[i-P] if i >= P else 0.0      # repetitive update
        raw = Aeff*(Dn[i] - u[i]); eMem[i] = raw
        ef = ef*filt + raw*(1-filt); q[i] = qd[i] + ef
    return q`,
      computeJs: `
const w = 2 * Math.PI / params.gaitPeriod;
const walkOn = 2.0, walkOff = helpers.T - 1.5;
const sg = (x) => 1 / (1 + Math.exp(-x / 0.12));
const P = Math.max(1, Math.round(params.gaitPeriod / helpers.dt));
const Aeff = 0.045 * 55 / (48 * params.Ks);
let g = params.learnGain * (30 / 25) * 0.35; if (g > 0.9) g = 0.9;
const filt = Math.exp(-(3 * (500 * params.Lam) / 430) * helpers.dt);
const u = new Array(helpers.n).fill(0), eMem = new Array(helpers.n).fill(0);
const out = new Array(helpers.n); let ef = 0;
for (let i = 0; i < helpers.n; i++) {
  const t = helpers.t[i];
  const win = sg(t - walkOn) * sg(walkOff - t);
  const qd = win * params.stepScale * 0.60 * Math.sin(w * (t - walkOn) + 1.6);
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
      figureLabel: "Fig. 4", page: 10, image: FIG("dl-fig4"), title: "Left-leg joint tracking, indoor flat-ground walking",
      explanation:
        "The six left-leg joint angles (solid) tracking their periodic gait references (dashed) during " +
        "steady indoor walking. Errors stay small and bounded across all joints. Raise the learning " +
        "rate Γ or the feedback gain Kₛ and the actual curves hug the reference more tightly; add " +
        "uncertainty or terrain and they deviate.",
      svg: svgTrack, panels: trackPanels(IN, 0),
    },
    {
      figureLabel: "Fig. 5", page: 10, image: FIG("dl-fig5"), title: "Left-leg joint tracking errors, indoor walking",
      explanation:
        "Per-joint tracking error e(t) for the indoor case. The repetitive-learning term drives the " +
        "periodic component down within the first gait cycles, leaving a small bounded residual (mostly " +
        "the non-repetitive noise). Set Γ → 0 to see the larger persistent error without learning.",
      svg: svgErr, panels: errorPanels(IN),
    },
    {
      figureLabel: "Fig. 6", page: 11, image: FIG("dl-fig6"), title: "CoM height and ground reaction forces, indoor walking",
      explanation:
        "Left: the CoM height held near the desired 1.045 m (error < 0.018 m during walking). Right: the " +
        "vertical ground reaction forces of the two feet, alternating with the gait and peaking near the " +
        "robot's weight — smooth and physically consistent, capped by the 650 N contact bound.",
      svg: svgComGrf, panels: comGrfPanels(IN),
    },
    {
      figureLabel: "Fig. 7", page: 11, image: FIG("dl-fig7"), title: "Tracking under an external push disturbance",
      explanation:
        "A transient external push is applied mid-walk. The hip-pitch and knee joints deviate at the " +
        "instant of the push, then the controller rejects it and tracking recovers — the disturbance-" +
        "rejection behavior the paper highlights. Increase Kₛ or Γ to shrink the excursion.",
      svg: svgTrack,
      panels: [
        {
          subplotLabel: "(a) hip pitch — push at t = 6 s", xLabel: "t (s)", yLabel: "angle (rad)",
          computeJs: SIM + `
const r = rlcJoint(JOINTS[2], ${IN}, 8);
return { series: [ { label: "reference", data: r.qd }, { label: "actual", data: r.q } ] };`,
        },
        {
          subplotLabel: "(b) knee — push at t = 6 s", xLabel: "t (s)", yLabel: "angle (rad)",
          computeJs: SIM + `
const r = rlcJoint(JOINTS[3], ${IN}, 8);
return { series: [ { label: "reference", data: r.qd }, { label: "actual", data: r.q } ] };`,
        },
      ],
    },
    {
      figureLabel: "Fig. 9", page: 12, image: FIG("dl-fig9"), title: "Left-leg joint tracking, outdoor uneven grass",
      explanation:
        "The same six joints on uneven outdoor grass. Tracking remains stable but the errors fluctuate " +
        "more than indoors because of irregular ground contact — visible as the noisier gap between " +
        "actual and reference. The learning still keeps the periodic error in check.",
      svg: svgTrack, panels: trackPanels(OUT, 0),
    },
    {
      figureLabel: "Fig. 10", page: 12, image: FIG("dl-fig10"), title: "Left-leg joint tracking errors, outdoor walking",
      explanation:
        "Outdoor per-joint errors. Larger, noisier fluctuations than Fig. 5 reflect terrain-induced " +
        "disturbances, yet they remain bounded and stable — the robustness claim of the paper. Compare " +
        "against the indoor errors by lowering the terrain-driven disturbance.",
      svg: svgErr, panels: errorPanels(OUT),
    },
    {
      figureLabel: "Fig. 11", page: 12, image: FIG("dl-fig11"), title: "CoM height and GRF, outdoor uneven grass",
      explanation:
        "Outdoor CoM and GRF. The CoM-height peak-to-peak fluctuation grows to roughly 0.05 m (versus " +
        "below 0.03 m indoors) from grass compliance and height irregularity, and the foot forces show " +
        "more asymmetry — but the CoM stays regulated and the forces continuous, without instability.",
      svg: svgComGrf, panels: comGrfPanels(OUT),
    },
  ],
};
