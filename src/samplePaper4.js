/**
 * Fourth bundled sample — a ROBOTICS / REINFORCEMENT-LEARNING systems paper,
 * in the same PaperSpec format the analyzer produces.
 *
 * Paper: Kang, Park, Song, Kim, Hong, Park — "Agile perceptive multiskill
 * locomotion for quadrupedal robots in the wild", Science Robotics 11,
 * eadz7397 (2026).
 *
 * The results are REAL-ROBOT measurements plus massive GPU-based RL training
 * runs — nothing a browser can honestly re-run, so archetype.pipelineFeasible
 * is false. What makes this sample special: the paper ships its per-figure
 * source data (adz7397_data_file_s1), so every interactive panel below plots
 * the AUTHORS' OWN numbers — PCA/t-SNE point clouds, torque decompositions,
 * learning curves, gait fractions, ablation bars — extracted from that file
 * (see src/samplePaper4Data.js), never eyeballed off a plot.
 */

import {
  FIG3C, FIG3A_SPEED, FIG4, FIG5A, FIG5B, FIG5C, FIG6B, FIG6C, FIG7C, FIG7E, FIG8,
} from "./samplePaper4Data.js";

const BASE = (typeof import.meta !== "undefined" && import.meta.env) ? import.meta.env.BASE_URL : "/";
const FIG = (name) => `${BASE}figs/${name}.jpg`;

/* ---- The APT-RL pipeline (paper's Fig. 2), rebuilt as an animated SVG ----
 * Scoped styles (#aptP prefix), reduced-motion safe. */
const PIPELINE_SVG = `
<svg id="aptP" viewBox="0 0 720 320" xmlns="http://www.w3.org/2000/svg"
  font-family="system-ui,-apple-system,Segoe UI,sans-serif" role="img"
  aria-label="APT-RL training pipeline">
  <defs>
    <marker id="aptA" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M0 0 L10 5 L0 10 z" fill="#94a3b8"/>
    </marker>
  </defs>
  <style>
    #aptP .ttl{fill:#334155;font-size:11px;font-weight:700}
    #aptP .nd{fill:#0f172a;font-size:10.5px;font-weight:600}
    #aptP .sub{fill:#64748b;font-size:8.5px}
    #aptP .cap{fill:#94a3b8;font-size:9px;font-style:italic}
    #aptP .shape{opacity:0;animation:aptIn .5s ease forwards}
    #aptP .g1{animation-delay:.05s}#aptP .g2{animation-delay:.25s}#aptP .g3{animation-delay:.45s}
    #aptP .g4{animation-delay:.65s}#aptP .g5{animation-delay:.85s}
    #aptP .flow{fill:none;stroke:#94a3b8;stroke-width:1.6;stroke-dasharray:5 5;animation:aptDash .9s linear infinite}
    #aptP .best{animation:aptIn .5s ease 1.05s forwards,aptPulse 2.6s ease-in-out 1.8s infinite}
    #aptP .gaitT{animation:aptTrot 1.4s ease-in-out infinite alternate}
    #aptP .gaitB{animation:aptBound 1.4s ease-in-out infinite alternate}
    @keyframes aptIn{to{opacity:1}}
    @keyframes aptDash{to{stroke-dashoffset:-20}}
    @keyframes aptPulse{0%,100%{filter:drop-shadow(0 0 0 rgba(22,163,74,0))}50%{filter:drop-shadow(0 0 6px rgba(22,163,74,.6))}}
    @keyframes aptTrot{from{transform:translateY(0)}to{transform:translateY(-3px)}}
    @keyframes aptBound{from{transform:translateY(0)}to{transform:translateY(-7px)}}
    @media (prefers-reduced-motion:reduce){#aptP .shape,#aptP .best{opacity:1;animation:none}#aptP .flow,#aptP .gaitT,#aptP .gaitB{animation:none}}
  </style>

  <!-- 1 · data factory -->
  <text class="ttl" x="26" y="18">1 · Motion-data factory (2D TO)</text>
  <g class="shape g1">
    <rect x="26" y="30" width="180" height="58" rx="9" fill="#eef2ff" stroke="#6366f1" stroke-width="1.5"/>
    <text class="nd" x="116" y="48" text-anchor="middle">Trajectory optimization</text>
    <text class="sub" x="116" y="61" text-anchor="middle">single-rigid-body model, 2D</text>
    <text class="sub" x="116" y="74" text-anchor="middle">180,000 trajectories · 15.5 h in 8 min</text>
  </g>
  <g class="shape g1">
    <g class="gaitT"><circle cx="52" cy="112" r="5" fill="#2a78d6"/></g>
    <text class="sub" x="66" y="116">trot</text>
    <g class="gaitB"><circle cx="108" cy="112" r="5" fill="#e34948"/></g>
    <text class="sub" x="122" y="116">bound</text>
    <text class="sub" x="160" y="116">+ torques</text>
  </g>
  <path class="flow" d="M206 60 H238" marker-end="url(#aptA)"/>

  <!-- 2 · TVAE -->
  <text class="ttl" x="246" y="18">2 · Learn the skill space</text>
  <g class="shape g2">
    <rect x="246" y="30" width="190" height="42" rx="9" fill="#fdf2f8" stroke="#db2777" stroke-width="1.5"/>
    <text class="nd" x="341" y="47" text-anchor="middle">Transformer VAE</text>
    <text class="sub" x="341" y="61" text-anchor="middle">one latent space for every gait</text>
  </g>
  <path class="flow" d="M341 72 V92" marker-end="url(#aptA)"/>
  <g class="shape g3">
    <rect x="246" y="92" width="190" height="42" rx="9" fill="#fff7ed" stroke="#f59e0b" stroke-width="1.5"/>
    <text class="nd" x="341" y="109" text-anchor="middle">Frozen torque decoders</text>
    <text class="sub" x="341" y="123" text-anchor="middle">latent action → joint torques</text>
  </g>
  <path class="flow" d="M436 82 H468" marker-end="url(#aptA)"/>

  <!-- 3 · RL -->
  <text class="ttl" x="476" y="18">3 · RL on top of the priors</text>
  <g class="shape g4">
    <rect x="476" y="30" width="218" height="42" rx="9" fill="#eff6ff" stroke="#3b82f6" stroke-width="1.5"/>
    <text class="nd" x="585" y="47" text-anchor="middle">Policy picks latent + auxiliary action</text>
    <text class="sub" x="585" y="61" text-anchor="middle">gait selection · stairs, gaps, hurdles…</text>
  </g>
  <path class="flow" d="M585 72 V92" marker-end="url(#aptA)"/>
  <g class="shape g4">
    <rect x="476" y="92" width="218" height="42" rx="9" fill="#f0fdfa" stroke="#14b8a6" stroke-width="1.5"/>
    <text class="nd" x="585" y="109" text-anchor="middle">Distill perception</text>
    <text class="sub" x="585" y="123" text-anchor="middle">depth camera + 2D LIDAR replace the height map</text>
  </g>

  <!-- 4 · deployment -->
  <path class="flow" d="M585 134 V166" marker-end="url(#aptA)"/>
  <g class="best">
    <rect x="392" y="168" width="302" height="52" rx="10" fill="#dcfce7" stroke="#16a34a" stroke-width="1.8"/>
    <text class="nd" x="543" y="188" text-anchor="middle">One onboard policy, deployed in the wild</text>
    <text class="sub" x="543" y="203" text-anchor="middle">6 m/s peak · Froude 7.69 · stairs, logs, gaps, stepping stones</text>
  </g>
  <text class="cap" x="26" y="196">every arrow = data, no hand-tuned gait</text>
  <text class="cap" x="26" y="210">schedules anywhere in the loop</text>

  <!-- terrain strip -->
  <g class="shape g5">
    <rect x="26" y="238" width="668" height="52" rx="9" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.2"/>
    <text class="sub" x="40" y="258">simulation terrains:</text>
    <text class="nd" x="40" y="276">stairs · stepping stones · rough · hurdle · discrete · high step · gap</text>
    <text class="sub" x="560" y="267">→ zero-shot to the real robot</text>
  </g>
</svg>`;

/* Original figure colors, reused so panels read like the paper. */
const GAIT_COLORS = { Trot: "#2a78d6", Bound: "#e34948", Pace: "#1baf7a", Gallop: "#8b5cf6", Pronk: "#eda100" };
const SENSOR_COLORS = { "Depth+LiDAR": "#4fa3a5", "LiDAR-only": "#ddc76a", "Depth-only": "#e0995e" };
const CTRL_COLORS = { "Trot only": "#2a78d6", "Bound only": "#e8703d", "Auto (ours)": "#2bb5a0" };

/* Fig 4 radial panels: groups = gaits, bars = terrain × speed (hatch = low). */
const TERRAIN_SHORT = { "Rough+Discrete": "A", "Stair": "B", "High Step": "C", "Stepping Stone": "D" };
const fig4Radial = (metric, errKey) => ({
  kind: "radialBar",
  badge: "paper's data",
  source: "the paper's published source-data file (data S1, 'Figure 4' sheet) — 9 trials × 300 agents per bar",
  unit: "",
  colors: GAIT_COLORS,
  groups: ["Bound", "Trot", "Pace", "Gallop", "Pronk"].map((gait) => ({
    name: gait,
    bars: FIG4.filter((r) => r.gait === gait).map((r) => ({
      label: `${TERRAIN_SHORT[r.terrain] || r.terrain} · ${r.speed.toLowerCase()} speed (${r.terrain})`,
      value: r[metric], err: r[errKey], hatch: r.speed === "Low",
    })),
  })),
});

export const SAMPLE_SPEC_4 = {
  meta: {
    title: "Agile perceptive multiskill locomotion for quadrupedal robots in the wild",
    authors: "J.-G. Kang, J. Park, T.-G. Song, J.-H. Kim, S. Hong, H.-W. Park",
    venue: "Science Robotics, Vol. 11, eadz7397 (2026)",
    abstract:
      "APT-RL (action pretrained transformer–based reinforcement learning) lets a quadruped robot pick and blend " +
      "locomotion skills — trot, bound, jumps, drop-downs — at high speed using only onboard sensing. The trick: " +
      "generate a huge 2D motion dataset by trajectory optimization with a simplified dynamics model (180,000 " +
      "trajectories, 15.5 hours of motion, computed in 8 minutes), compress it into one latent skill space with a " +
      "transformer VAE, then let RL drive the frozen torque decoders while an auxiliary action fills the gaps. " +
      "Deployed zero-shot on the KAIST HOUND robot, one policy traversed a 1.1-km urban course and a 0.34-km forest " +
      "trail, hit an instantaneous 6 m/s jumping down a three-step staircase (Froude 7.69), and cleared stairs, " +
      "hurdles, stepping stones, gaps and fallen branches — autonomously choosing gaits as terrain and speed demand.",
  },
  archetype: {
    kind: "empirical-robotics",
    pipelineFeasible: false,
    reproductionAdvice:
      "The results are measurements of a physical robot plus GPU-scale RL training — nothing a browser can honestly " +
      "re-run. But this paper publishes its per-figure source data, so every interactive panel here plots the authors' " +
      "OWN numbers (latent-space embeddings, torque decompositions, learning curves, gait fractions, ablations) read " +
      "from that file. The honestly-simulatable pieces — Froude scaling, the variational-autoencoder tradeoff, " +
      "exploration decay, PD torque control — are the interactive foundations.",
  },
  story: {
    problem:
      "Legged robots that only trot politely stay slow, and robots tuned for one obstacle type fail on the next. " +
      "Crossing real terrain — stairs, logs, gaps, stepping stones — at speed needs MANY motor skills plus the judgment " +
      "to switch between them mid-run, using only what the robot itself can see and compute.",
    gap:
      "RL policies for rough terrain existed, but they were single-gait, capped near 1 m/s around obstacles, needed " +
      "external motion capture, or required animal motion-capture data that's costly to collect across terrains. " +
      "Hierarchical skill-selectors could not transition smoothly, and latent-skill methods needed an extra RL stage " +
      "or a whole-body controller that breaks down at high speed.",
    contribution: [
      {
        headline: "A motion-data factory instead of animal data",
        detail:
          "Trajectory optimization with a single-rigid-body model generates torque-annotated 2D gait data at scale — " +
          "180,000 trajectories (15.5 hours of motion) in 8 minutes — no motion capture, no hand animation.",
      },
      {
        headline: "One latent space, many skills (APT)",
        detail:
          "A transformer VAE compresses all gaits into one structured latent space and learns frozen torque decoders. " +
          "RL then just picks latent actions — the decoder already knows how to turn them into joint torques.",
      },
      {
        headline: "Auxiliary action fills what 2D data lacks",
        detail:
          "A jointly-learned auxiliary torque corrects the decoder for full-3D reality: it powers jumps not in the " +
          "dataset, compensates a broken leg, and drives the hip-abduction motors the 2D data never covered.",
      },
      {
        headline: "Record-setting field results",
        detail:
          "Zero-shot on the KAIST HOUND: 1.1-km urban + 0.34-km forest traversals, autonomous trot↔bound switching, " +
          "instantaneous 6 m/s during a staircase drop-down — Froude 7.69, a previously undocumented benchmark for " +
          "perceptive quadruped locomotion.",
      },
    ],
    whyItMatters:
      "Search-and-rescue, inspection and delivery robots must cross whatever terrain shows up, fast. APT-RL shows a " +
      "recipe — optimize motions cheaply in 2D, compress to a reusable skill space, let RL compose the skills — that " +
      "scales to real hardware without animal data, external sensors, or per-obstacle engineering.",
  },
  mindmap: {
    nodes: [
      { id: "paper", label: "APT-RL multiskill locomotion", kind: "paper",
        detail: "One onboard policy that picks and blends gaits/skills at high speed over wild terrain — built from trajectory-optimized motion data, a transformer VAE skill space, and RL with an auxiliary action." },
      { id: "prob", label: "Fast + many skills + onboard", kind: "problem",
        detail: "Prior controllers were fast OR obstacle-capable OR self-contained — never all three. Obstacle navigation was stuck near 1 m/s." },
      { id: "prior1", label: "Model-based control & MPC", kind: "prior",
        detail: "Physically grounded and dynamic, but limited by how well contact and friction can be modeled — brittle off the lab floor." },
      { id: "prior2", label: "RL + motion priors (AMP, latents)", kind: "prior",
        detail: "Adversarial motion priors and latent-skill spaces produce natural gaits but need animal data, extra RL tracking stages, or whole-body controllers that fail at speed." },
      { id: "m1", label: "2D TO data factory", kind: "method",
        detail: "Single-rigid-body trajectory optimization mass-produces torque-annotated gait data: 180k trajectories / 15.5 h of motion in 8 minutes." },
      { id: "m2", label: "TVAE skill space + frozen decoders", kind: "method",
        detail: "A transformer VAE learns one latent space across gaits; supervised learning attaches torque decoders that RL later reuses frozen." },
      { id: "m3", label: "RL + auxiliary action", kind: "method",
        detail: "The policy outputs a latent action (decoded to torques), a gait-selection logit, and an auxiliary PD action that adds what the 2D dataset lacks." },
      { id: "m4", label: "Perception distillation", kind: "method",
        detail: "A student encoder using depth camera + 2D LIDAR mimics a teacher trained on privileged height maps — onboard perception at 40 Hz." },
      { id: "c1", label: "Skills transfer & recombine", kind: "contribution",
        detail: "Latent actions learned from flat 2D data drive jumps, drop-downs and broken-leg recovery in full 3D — the priors are genuinely reusable." },
      { id: "res1", label: "6 m/s drop-down (Froude 7.69)", kind: "result",
        detail: "Instantaneous 6 m/s jumping down a 3-step staircase; 4.25 m/s over a 60-cm step (Froude 3.85). A new benchmark for perceptive quadrupeds." },
      { id: "res2", label: "Auto gait beats fixed gaits", kind: "result",
        detail: "Across 7 terrains × 3 speed ranges, the automatic policy wins 44% of cases (vs 24%/32%) with 5% average regret and by far the best worst case." },
    ],
    edges: [
      { from: "prob", to: "paper", label: "motivates" },
      { from: "prior1", to: "paper", label: "limits of" },
      { from: "prior2", to: "paper", label: "builds on" },
      { from: "paper", to: "m1", label: "phase 1" },
      { from: "m1", to: "m2", label: "trains" },
      { from: "m2", to: "m3", label: "reused by" },
      { from: "m3", to: "m4", label: "deployed via" },
      { from: "m3", to: "c1", label: "enables" },
      { from: "c1", to: "res1", label: "shown by" },
      { from: "paper", to: "res2", label: "shown by" },
    ],
  },
  conclusion:
    "APT-RL turns cheap 2D trajectory-optimized motion data into a reusable latent skill space, then lets RL compose " +
    "those skills — with an auxiliary action covering what the data lacks — into one onboard policy. On the KAIST " +
    "HOUND, that single policy autonomously switched between trot and bound across urban, forest and indoor courses, " +
    "cleared stairs, hurdles, gaps, stepping stones and fallen branches, and hit an instantaneous 6 m/s (Froude 7.69) " +
    "during a staircase drop-down — while automatic gait selection beat both fixed-gait baselines on best-performance " +
    "rate, average regret, and worst-case score.",
  references: [
    "Kang, J.-G.; Park, J.; Song, T.-G.; Kim, J.-H.; Hong, S.; Park, H.-W. Agile perceptive multiskill locomotion for quadrupedal robots in the wild. Sci. Robot. 11, eadz7397 (2026).",
    "Peng, X.B. et al. AMP: Adversarial motion priors for stylized physics-based character control. ACM Trans. Graph. (2021).",
    "Hoeller, D. et al. ANYmal Parkour: Learning agile navigation for quadrupedal robots. Sci. Robot. (2024).",
    "Yang, C. et al. Multi-expert learning of adaptive legged locomotion (MELA). Sci. Robot. (2020).",
    "Shin, Y.-H. et al. Design of KAIST HOUND: a quadruped robot with fast joint actuation. (2022).",
    "Kingma, D.P.; Welling, M. Auto-encoding variational Bayes. ICLR (2014).",
  ],

  conceptFigures: [
    {
      title: "APT-RL at a glance — from cheap 2D data to one wild-terrain policy",
      svg: PIPELINE_SVG,
      explanation:
        "The whole method in one flow. (1) A trajectory-optimization 'factory' with simplified single-rigid-body " +
        "dynamics mass-produces 2D gait data WITH the torques that produce it — 180,000 trajectories totalling 15.5 " +
        "hours of motion, computed in 8 minutes. (2) A transformer VAE compresses every gait into one structured " +
        "latent space and learns torque decoders, which are then frozen. (3) Reinforcement learning drives those " +
        "decoders by choosing latent actions, adds an auxiliary action for everything the 2D data can't express, and " +
        "picks the gait; a student encoder distills privileged height-map perception into onboard depth-camera + " +
        "LIDAR sensing. The result: one policy, deployed zero-shot, that trots, bounds, jumps and drops its way " +
        "through terrain it has never seen.",
    },
    {
      title: "Figure 2 — the paper's own training-pipeline diagram",
      image: FIG("sr-fig2"),
      explanation:
        "The authors' original schematic. (A) Overview: data generation (left), representation + reinforcement " +
        "learning in simulation (middle), and real-hardware deployment with onboard perception (right). (B) The " +
        "details: (i) the TVAE learns a shared state encoder with per-gait torque decoders (the KL block is the " +
        "variational regularizer); (ii) the policy re-uses the frozen decoders — its action is a latent vector, a " +
        "gait-selection logit and an auxiliary joint action mixed into the final torque command; (iii) the " +
        "exteroceptive distillation swaps privileged elevation maps for a depth camera + 2D LIDAR; (iv) the " +
        "simulation terrains: gaps, stepping stones, rough ground, high steps, stairs, discrete blocks and hurdles.",
    },
    {
      title: "Figure 1 — what the robot actually did",
      image: FIG("sr-fig1"),
      explanation:
        "(A) Two indoor traversals: leaping a 60-cm step at 4.25 m/s, and a stair sequence where the robot trots below " +
        "2 m/s (blue tag) then switches to bounding above 2 m/s (red tag) before jumping off a 90-cm drop. (B) The same " +
        "single policy outdoors: forest floors with broken trees, campus stairs, grass, lakeside paths — frame " +
        "sequences 0.000 s → 2.633 s show one continuous drop-down maneuver in the wild.",
    },
  ],

  foundations: [
    {
      title: "Froude number — how 'fast' is fast for legs?",
      source: "Dynamic similarity (background for the 6 m/s claim)",
      concept:
        "Raw speed is unfair to small robots: longer legs cover ground more easily. The Froude number Fr = v²/(g·L) " +
        "divides speed² by gravity × leg length, giving a size-free measure of how dynamic a gait is. Animals trot " +
        "around Fr ≈ 1 and gallop near Fr ≈ 2–3; anything above ~5 is ballistic, flight-phase-dominated motion. This " +
        "paper's drop-down hits Fr = 7.69 — computed exactly like this chart.",
      whyItMatters:
        "It's the paper's headline benchmark: 6 m/s on a ~0.48-m leg is Froude 7.69, which the authors report as a " +
        "previously undocumented regime for perceptive quadruped locomotion.",
      demo: {
        kind: "chart", chartKind: "line", T: 1, dt: 1,
        xLabel: "speed (m/s)", yLabel: "Froude number",
        caption: "drag the leg length — see what 6 m/s means for different-sized runners",
        params: [
          { key: "L", sym: "L", label: "leg length (m)", min: 0.2, max: 1.2, step: 0.02, def: 0.48 },
        ],
        computeJs: `
const x = [], fr = [], trot = [], gallop = [];
for (let v = 0; v <= 7; v += 0.1) {
  x.push(v);
  fr.push(v * v / (9.81 * params.L));
  trot.push(1); gallop.push(2.5);
}
return { x, series: [
  { label: "Froude number", data: fr },
  { label: "animal trot ≈ 1", data: trot },
  { label: "animal gallop ≈ 2.5", data: gallop },
] };`,
        insightJs: `
const fr6 = 36 / (9.81 * params.L);
return "At 6 m/s with " + params.L.toFixed(2) + " m legs, Fr = " + fr6.toFixed(2) +
  (fr6 > 5 ? " — deep in the ballistic regime (the paper's robot: Fr 7.69)." :
   " — below the ballistic regime; longer legs make the same speed less extreme.");`,
      },
    },
    {
      title: "Why a simplified model can feed a data factory",
      source: "Trajectory optimization with SRBD (§Methods)",
      concept:
        "Trajectory optimization searches for motions AND the torques that produce them by solving the physics as a " +
        "constrained optimization. Its cost explodes with model detail: a full quadruped has ~36 states and contact " +
        "forces everywhere, while a single-rigid-body model (SRBD) keeps only the trunk's 2D pose + momentum and treats " +
        "legs as massless force vectors. That collapse in dimensionality is what turns 15.5 hours of motion into an " +
        "8-minute compute job — and the fidelity loss is exactly what the auxiliary action later repairs.",
      whyItMatters:
        "The paper's entire premise — 'skip animal data, optimize your own dataset' — is only affordable because the " +
        "generator uses simplified dynamics. Slide the model size and watch feasibility die.",
      demo: {
        kind: "chart", chartKind: "bar", T: 1, dt: 1,
        xLabel: "dynamics model", yLabel: "time to generate the paper's dataset",
        caption: "cost of generating 180,000 trajectories, relative to the paper's 8-minute SRBD run",
        params: [
          { key: "scale", sym: "α", label: "cost growth with model detail (exponent)", min: 1.5, max: 3, step: 0.1, def: 2.2 },
        ],
        computeJs: `
// solver cost ~ states^α (α from the slider); SRBD-2D = 7 states, full 3D robot = 37
const models = [ ["SRBD 2D", 7], ["SRBD 3D", 13], ["centroidal+joints", 25], ["full whole-body", 37] ];
const base = Math.pow(7, params.scale);
return { categories: models.map((m) => m[0]),
  series: [ { label: "minutes (log-ish scale)", data: models.map((m) => 8 * Math.pow(m[1], params.scale) / base) } ] };`,
        insightJs: `
const full = 8 * Math.pow(37 / 7, params.scale);
const days = full / 60 / 24;
return "If solve cost grows like states^" + params.scale.toFixed(1) +
  ", the same dataset with full whole-body dynamics would take ≈ " +
  (full > 2880 ? days.toFixed(1) + " days" : (full / 60).toFixed(1) + " hours") +
  " instead of 8 minutes — that's why the 2D shortcut plus a learned correction wins.";`,
      },
    },
    {
      title: "The VAE bargain: reconstruction vs. an organized latent space",
      source: "Variational autoencoders / TVAE (§Methods)",
      concept:
        "An autoencoder squeezes data through a low-dimensional bottleneck. The VARIATIONAL kind adds a KL penalty " +
        "pulling the latent codes toward a smooth Gaussian cloud. Weight it too little and the space memorizes — " +
        "perfect reconstruction, but similar motions land far apart. Weight it too much and everything blurs together. " +
        "In between, the space becomes ORGANIZED: nearby points decode to similar motions, and directions mean " +
        "something. That organization is why one latent action space can host trot AND bound, and why RL can explore " +
        "it efficiently.",
      whyItMatters:
        "The paper's Fig. 5 shows exactly this structure: real-robot latent actions cluster by gait and terrain, and " +
        "the policy finds NEW regions for skills that weren't in the dataset — only possible in a well-regularized space.",
      demo: {
        kind: "chart", chartKind: "line", T: 1, dt: 1,
        xLabel: "KL weight β (log scale position)", yLabel: "quality (arbitrary units)",
        caption: "trade reconstruction against latent organization; the sweet spot is where they cross",
        params: [
          { key: "cap", sym: "c", label: "model capacity", min: 0.5, max: 2, step: 0.05, def: 1.0 },
        ],
        computeJs: `
const x = [], recon = [], organ = [], use = [];
for (let i = 0; i <= 60; i++) {
  const b = i / 30 - 1; // -1..1 ~ log beta
  x.push(b);
  recon.push(params.cap * (1 - 1 / (1 + Math.exp(-3.5 * b))));      // falls as beta grows
  organ.push(1 / (1 + Math.exp(-3.5 * (b + 0.15))) * Math.min(1, params.cap)); // rises as beta grows
  use.push(Math.min(params.cap * (1 - 1 / (1 + Math.exp(-3.5 * b))), 1 / (1 + Math.exp(-3.5 * (b + 0.15))) * Math.min(1, params.cap)));
}
return { x, series: [
  { label: "reconstruction quality", data: recon },
  { label: "latent-space organization", data: organ },
  { label: "usable skill space (min of both)", data: use },
] };`,
        insightJs: `
const best = result.series[2].data.reduce((a, v, i) => (v > a.v ? { v, i } : a), { v: -1, i: 0 });
const beta = (best.i / 30 - 1).toFixed(2);
return "The usable skill space peaks near β ≈ " + beta +
  " (on this log axis): decode well enough to act, organized enough that RL can search it. The TVAE lives at that balance.";`,
      },
    },
    {
      title: "Exploration that fades into exploitation",
      source: "RL training schedule (§Results, Fig. 7C)",
      concept:
        "Early in training the policy must EXPLORE the latent skill space, so an exploration bonus rewards visiting " +
        "novel latent actions. That bonus decays toward zero on a schedule, and the policy shifts to EXPLOITING what " +
        "it found. The paper's learning curves are literally annotated with these two phases — exploration first, " +
        "then exploitation, with the reward climbing fastest right after the switch.",
      whyItMatters:
        "It explains the SHAPE of Fig. 7C: our-method curves keep climbing after the bonus fades because the skills " +
        "found during exploration are still there to exploit, while the HRL baseline plateaus.",
      demo: {
        kind: "chart", chartKind: "line", T: 1, dt: 1,
        xLabel: "training progress (%)", yLabel: "reward",
        caption: "decay the exploration bonus faster or slower and watch the total reward shape change",
        params: [
          { key: "half", sym: "t½", label: "bonus half-life (% of training)", min: 5, max: 50, step: 1, def: 20 },
        ],
        computeJs: `
const x = [], bonus = [], task = [], total = [];
for (let p = 0; p <= 100; p += 1) {
  x.push(p);
  const b = 0.35 * Math.pow(0.5, p / params.half);
  const coverage = 1 - Math.pow(0.5, p / (params.half * 1.2)); // skills discovered while bonus was alive
  const t = (0.25 + 0.75 * coverage) * (1 - Math.exp(-p / 25));
  bonus.push(b); task.push(t); total.push(b + t);
}
return { x, series: [
  { label: "task reward", data: task },
  { label: "exploration bonus", data: bonus },
  { label: "total reward", data: total },
] };`,
        insightJs: `
const final = result.series[0].data[100].toFixed(2);
return "With a " + params.half + "% half-life, the bonus is gone by mid-training and the task reward settles at " +
  final + ". Decay too fast and the space is under-explored; too slow and training chases novelty instead of the task.";`,
      },
    },
    {
      title: "PD control — the layer under every learned action",
      source: "Joint control (§Methods, Fig. 2B ii-a)",
      concept:
        "Each joint runs a proportional-derivative loop: torque = Kp·(target − angle) − Kd·velocity. Stiff gains track " +
        "sharply but amplify impacts; soft gains are compliant but lag. The policy's AUXILIARY action is a target fed " +
        "into exactly this loop, and its output torque is added to the decoder's torque — so the learned correction " +
        "inherits PD's stability while the decoder supplies the gait.",
      whyItMatters:
        "Fig. 5's torque decompositions only make sense knowing this plumbing: 'auxiliary torque' is a PD loop chasing " +
        "a learned target, which is how the policy can safely invent jumps and broken-leg recoveries.",
      demo: {
        kind: "chart", chartKind: "line", T: 2, dt: 1 / 120,
        xLabel: "time (s)", yLabel: "joint angle (rad)",
        caption: "step-command a joint and tune the PD gains",
        params: [
          { key: "kp", sym: "Kp", label: "stiffness Kp", min: 5, max: 120, step: 1, def: 40 },
          { key: "kd", sym: "Kd", label: "damping Kd", min: 0.2, max: 8, step: 0.1, def: 2 },
        ],
        computeJs: `
const N = helpers.n, x = [], target = [], angle = [];
let q = 0, qd = 0;
const I = 0.05; // link inertia
for (let i = 0; i < N; i++) {
  const t = helpers.t[i];
  const ref = t > 0.2 ? 1 : 0;
  const tau = params.kp * (ref - q) - params.kd * qd;
  qd += (tau / I) * helpers.dt * 0.05;
  q += qd * helpers.dt;
  x.push(t); target.push(ref); angle.push(q);
}
return { x, series: [ { label: "commanded target", data: target }, { label: "joint angle", data: angle } ] };`,
        insightJs: `
const a = result.series[1].data;
let peak = 0; for (const v of a) peak = Math.max(peak, v);
const over = Math.max(0, (peak - 1) * 100);
return over > 25 ? "Overshoot ≈ " + over.toFixed(0) + "% — stiff and springy; on a real leg this is a hard impact. Raise Kd or drop Kp." :
  over > 2 ? "Overshoot ≈ " + over.toFixed(0) + "% — close to how legged robots tune joints: fast but controlled." :
  "No overshoot — compliant and safe, but slow; the auxiliary action would lag behind the gait.";`,
      },
    },
  ],

  explorables: [
    {
      title: "The record maneuvers, in Froude terms",
      basis: "reported",
      story:
        "The paper's two headline maneuvers: 4.25 m/s clearing a 60-cm step and an instantaneous 6 m/s during a " +
        "three-step-staircase drop-down. In size-free Froude terms those are 3.85 and 7.69 — the second being a regime " +
        "no perceptive quadruped had documented before. For scale: animals typically gallop around Fr 2–3.",
      source: "§Results — peak speeds and Froude numbers",
      demo: {
        kind: "chart", chartKind: "bar", T: 1, dt: 1,
        xLabel: "maneuver", yLabel: "Froude number",
        caption: "hover for exact values",
        params: [],
        computeJs: `return { categories: ["animal gallop (typical)", "60-cm step @ 4.25 m/s", "stair drop-down @ 6 m/s"], series: [
  { label: "Froude number", data: [2.5, 3.85, 7.69] } ] };`,
      },
    },
    {
      title: "The motion-data factory, quantified",
      basis: "reported",
      story:
        "Trajectory optimization with the simplified model produced 180,000 trajectories — 15.5 hours of motion — in " +
        "8 minutes of compute. That's ≈116× faster than real time, and it's the reason the whole pretraining stage " +
        "costs almost nothing compared to RL.",
      source: "§Introduction / Methods — dataset generation",
      demo: {
        kind: "chart", chartKind: "bar", T: 1, dt: 1,
        xLabel: "quantity", yLabel: "value",
        caption: "hover for the reported numbers",
        params: [
          { key: "hours", sym: "h", label: "motion-hours you want", min: 5, max: 100, step: 1, def: 15.5 },
        ],
        computeJs: `
const rate = 15.5 / 8; // motion-hours per compute-minute, as reported
return { categories: ["compute minutes needed", "trajectories (×1000)"], series: [
  { label: "at the paper's reported rate", data: [ params.hours / rate, 180 * (params.hours / 15.5) ] } ] };`,
        insightJs: `
const mins = params.hours / (15.5 / 8);
return params.hours.toFixed(0) + " hours of motion data costs ≈ " + mins.toFixed(1) +
  " minutes of trajectory optimization — versus days of animal motion-capture collection and cleanup.";`,
      },
    },
    {
      title: "When does the robot stop trotting?",
      basis: "reported",
      story:
        "From the paper's own gait-fraction data (Fig. 6B source file): the share of time the policy chooses trot, as " +
        "command velocity rises, on four terrains at difficulty level 6. On rough ground trot survives past 3 m/s; on " +
        "high steps the policy starts bounding almost immediately.",
      source: "data S1, 'Figure 6B' sheet — trot fraction vs command velocity (difficulty 6)",
      demo: {
        kind: "chart", chartKind: "line", T: 1, dt: 1,
        xLabel: "command velocity (m/s)", yLabel: "fraction of time trotting",
        caption: "each curve is the paper's measured gait fraction on one terrain",
        params: [
          { key: "v", sym: "v", label: "your command velocity (m/s)", min: 0.7, max: 3.8, step: 0.1, def: 2.0 },
        ],
        computeJs: `
const D = ${JSON.stringify(["Rough", "Low stair", "High step", "Gap"])};
const TAB = ${JSON.stringify(
      ["Rough", "Low stair", "High step", "Gap"].reduce((acc, t) => {
        acc[t] = (FIG6B[`${t} · L6`] || []).map(([v, f]) => [v, f]);
        return acc;
      }, {})
    )};
const series = D.map((t) => ({ label: t, data: TAB[t].map((p) => p[1]) }));
return { x: TAB[D[0]].map((p) => p[0]), series };`,
        insightJs: `
const TAB = ${JSON.stringify(
      ["Rough", "High step"].reduce((acc, t) => {
        acc[t] = (FIG6B[`${t} · L6`] || []).map(([v, f]) => [v, f]);
        return acc;
      }, {})
    )};
const at = (t) => {
  const arr = TAB[t]; let best = arr[0];
  for (const p of arr) if (Math.abs(p[0] - params.v) < Math.abs(best[0] - params.v)) best = p;
  return best[1];
};
const r = at("Rough"), h = at("High step");
return "At " + params.v.toFixed(1) + " m/s the policy trots " + Math.round(r * 100) +
  "% of the time on rough ground but only " + Math.round(h * 100) +
  "% on high steps — terrain, not just speed, drives the gait choice.";`,
      },
    },
    {
      title: "Auto gait selection vs. fixed gaits — the scoreboard",
      basis: "reported",
      story:
        "Across 7 terrains × 3 speed ranges (21 cases), how often was each controller the best, and how far off the " +
        "best did it sit on average? Auto wins 44.4% of cases with only 4.99% average regret; fixed trot wins 23.8% " +
        "but averages 24.6% regret. Auto's worst-case normalized score (0.711) also crushes trot's (0.028) and " +
        "bound's (0.137) — it never falls apart.",
      source: "Fig. 6C(ii) — aggregate comparison table",
      demo: {
        kind: "chart", chartKind: "bar", T: 1, dt: 1,
        xLabel: "controller", yLabel: "percent",
        caption: "hover for exact values; lower regret is better",
        params: [],
        computeJs: `return { categories: ["Auto (ours)", "Trot only", "Bound only"], series: [
  { label: "best-performance rate (%)", data: [44.44, 23.81, 31.75] },
  { label: "avg relative regret (%)", data: [4.99, 24.63, 13.28] },
] };`,
      },
    },
  ],

  protocol: { T: 1, dt: 1, description: "" },
  blocks: [],

  resultFigures: [
    {
      figureLabel: "Figure 3",
      page: 6,
      image: FIG("sr-fig3"),
      title: "Agile perceptive locomotion in urban, wild and indoor scenarios",
      explanation:
        "Three field deployments of the same policy. (A) A 1.1-km urban course: the trajectory map is colored by " +
        "velocity, and the traces show gait selection flipping to bound (red shading) exactly where speed or terrain " +
        "demands it — including the stair-jump inset where speed peaks at 6 m/s just before touchdown. (B) A 0.34-km " +
        "forest trail with logs and roots: bound over obstacles, trot on irregular ground. (C) The indoor course: " +
        "trot up the stairs, switch to bound at 4.41 s, leap off the 90-cm step. The panels plot the authors' own " +
        "published traces for the indoor run and the stair jump.",
      hotspots: [
        { x: 0.13, y: 0.13, label: "1.1 km, colored by speed", note: "The urban loop: blue segments are trot, red bound; the color bar runs 0→5 m/s. Total distance 1100 m on one policy." },
        { x: 0.42, y: 0.42, label: "6 m/s, measured", note: "The stair-jump inset: body-center speed peaks at 6 m/s immediately before ground impact — Froude 7.69." },
        { x: 0.75, y: 0.87, label: "The gait trace", note: "Gait Select. < 0.5 means trot, ≥ 0.5 bound. Watch it jump exactly when command velocity rises past ≈2 m/s." },
      ],
      panels: [
        {
          subplotLabel: "Indoor run — command vs estimated speed & gait choice",
          xLabel: "time (s)", yLabel: "m/s · gait (0=trot, 1=bound)",
          chartKind: "line",
          digitized: {
            badge: "paper's data",
            source: "data S1, 'Figure 3C' sheet — the indoor scenario's command velocity, estimated velocity and gait-selection output",
            series: [
              { label: "command vx (m/s)", points: FIG3C.t.map((t, i) => [t, FIG3C.cmd[i]]) },
              { label: "estimated vx (m/s)", points: FIG3C.t.map((t, i) => [t, FIG3C.est[i]]) },
              { label: "gait selection (≥0.5 = bound)", points: FIG3C.t.map((t, i) => [t, FIG3C.sel[i]]) },
            ],
          },
        },
        {
          subplotLabel: "Stair-jump speed — the 6 m/s moment",
          xLabel: "time (s)", yLabel: "speed (m/s)",
          chartKind: "line",
          digitized: {
            badge: "paper's data",
            source: "data S1, 'Figure 3A down' sheet — body-center speed around the stair-jump touchdowns (two recorded windows)",
            series: [
              { label: "first window", points: FIG3A_SPEED.interval_1 || [] },
              { label: "drop-down window (peaks 6 m/s)", points: FIG3A_SPEED.interval_2 || [] },
            ],
          },
        },
      ],
    },
    {
      figureLabel: "Figure 4",
      page: 7,
      image: FIG("sr-fig4"),
      title: "Which gait works where — five gaits × four terrains",
      explanation:
        "The paper's circular 'gait effectiveness' chart, reproduced as three radial panels — one per metric, exactly " +
        "like the original's three sectors. Bars radiate per gait; within each gait the four terrains (A = rough & " +
        "discrete, B = stair up, C = high step, D = stepping stones) appear at low speed (hatched) and high speed " +
        "(solid). The takeaways the paper draws: trot is stable and efficient at low speed, bound wins the high-speed " +
        "and big-obstacle cases, and pace/gallop/pronk are only situationally competitive — which is why the final " +
        "policy uses trot + bound as its two torque-level gait primitives.",
      hotspots: [
        { x: 0.72, y: 0.13, label: "Success rate sector", note: "Bound (bold label in the original) has the highest average success; trot is second. Each bar = 9 trials × 300 agents." },
        { x: 0.20, y: 0.30, label: "1/COT sector", note: "Cost of transport inverted — higher is more efficient. Trot leads on efficiency; pace is competitive but fails more often." },
        { x: 0.50, y: 0.83, label: "Velocity-tracking sector", note: "How closely each gait follows commanded speed. The average line per sector marks each gait's mean." },
      ],
      panels: [
        {
          subplotLabel: "Success rate (%) — hatched = low speed",
          xLabel: "gait · terrain", yLabel: "success rate (%)",
          chartKind: "radar",
          digitized: { ...fig4Radial("success", "successStd"), max: 100, unit: "%" },
        },
        {
          subplotLabel: "Velocity-tracking reward",
          xLabel: "gait · terrain", yLabel: "tracking reward",
          chartKind: "radar",
          digitized: { ...fig4Radial("tracking", "trackingStd"), max: 1.6 },
        },
        {
          subplotLabel: "1 / cost of transport (higher = more efficient)",
          xLabel: "gait · terrain", yLabel: "1/COT",
          chartKind: "radar",
          digitized: { ...fig4Radial("invCot", "invCotStd"), max: 3.6 },
        },
      ],
    },
    {
      figureLabel: "Figure 5",
      page: 9,
      image: FIG("sr-fig5"),
      title: "Inside the latent skill space & the auxiliary torque",
      explanation:
        "(A) PCA of latent actions: the pale clouds are the 2D pretraining dataset (trot left, bound right); the " +
        "policy's real-world latent actions overlap those clouds for familiar gaits and push into NEW regions on " +
        "harder terrain — the space generalizes. (B) t-SNE of real-world latent actions: clean clusters per " +
        "terrain-skill, subclustered by motion variation. (C–E) Torque decompositions for a log jump, a leg fracture " +
        "and in-place rotation: the frozen decoder supplies the rhythmic gait torque, and the auxiliary action adds " +
        "exactly what the 2D dataset lacked — the jump burst, the fracture recovery, the yaw torque. The panels plot " +
        "the authors' own embedding coordinates and torque traces.",
      hotspots: [
        { x: 0.16, y: 0.13, label: "Pretrained vs real world", note: "Diamonds (real world) sit ON the pale pretrained cloud for flat gaits and extend beyond it for stairs and high steps — reuse plus generalization." },
        { x: 0.72, y: 0.15, label: "Skills self-organize", note: "t-SNE clusters: flat trot, flat bound, high-step jump, hurdle jump, stepping stones, stairs — the space sorts behaviors on its own." },
        { x: 0.42, y: 0.72, label: "Where the jump comes from", note: "In the log jump (C), decoder torque drives flat running; at jump initiation (JI) the auxiliary torque takes over — that skill was never in the dataset." },
      ],
      panels: [
        {
          subplotLabel: "PCA of latent actions — pretrained vs real world",
          xLabel: "PC 1", yLabel: "PC 2",
          chartKind: "scatter",
          digitized: {
            kind: "scatter", badge: "paper's data",
            source: "data S1, 'Figure 5A' sheet — PCA coordinates of latent actions (downsampled clouds)",
            xLabel: "PC 1",
            series: [
              { label: "Trot · 2D pretrained", color: "#9ec9f0", points: FIG5A.clouds.T0 || [] },
              { label: "Bound · 2D pretrained", color: "#f2b0af", points: FIG5A.clouds.B1 || [] },
              { label: "Trot · 3D real world (stair)", color: "#1d4ed8", marker: "diamond", points: FIG5A.clouds.T6 || [] },
              { label: "Bound · 3D real world (high step)", color: "#b91c1c", marker: "diamond", points: FIG5A.clouds.B7 || [] },
            ],
          },
        },
        {
          subplotLabel: "t-SNE of real-world latent actions, by skill",
          xLabel: "t-SNE 1", yLabel: "t-SNE 2",
          chartKind: "scatter",
          digitized: {
            kind: "scatter", badge: "paper's data",
            source: "data S1, 'Figure 5B' sheet — t-SNE embedding of latent actions recorded on the real robot",
            xLabel: "t-SNE 1",
            series: Object.entries(FIG5B.names).map(([id, name]) => ({
              label: name, points: FIG5B.clouds[id] || [],
            })),
          },
        },
        {
          subplotLabel: "Log jump — knee torque decomposition",
          xLabel: "time (s)", yLabel: "torque (N·m)",
          chartKind: "line",
          digitized: {
            badge: "paper's data",
            source: "data S1, 'Figure 5C' sheet — KFE motor: total torque = frozen-decoder torque + auxiliary torque",
            series: [
              { label: "total torque", points: FIG5C.kfe.map((r) => [r[0], r[1]]) },
              { label: "from latent action (decoder)", points: FIG5C.kfe.map((r) => [r[0], r[2]]) },
              { label: "from auxiliary action", points: FIG5C.kfe.map((r) => [r[0], r[3]]) },
            ],
          },
        },
      ],
    },
    {
      figureLabel: "Figure 6",
      page: 10,
      image: FIG("sr-fig6"),
      title: "Autonomous gait selection, quantified",
      explanation:
        "(A) The same terrain and command produce different gaits when either changes — trot over a 0.175-m obstacle " +
        "but bound over 0.44 m at the same 2 m/s. (B) In simulation, the fraction of time spent trotting falls as " +
        "command velocity rises — but at different rates per terrain: high steps, hurdles and gaps push the policy to " +
        "bound early, rough ground keeps trot viable past 3 m/s. (C) Head-to-head: automatic selection matches or " +
        "beats fixed trot/bound almost everywhere, and the aggregate table shows it wins 44% of cases with 5% average " +
        "regret. The panels plot the paper's own gait fractions and per-terrain success rates.",
      hotspots: [
        { x: 0.5, y: 0.32, label: "The trot→bound frontier", note: "Each small panel is one terrain; curves are difficulty levels 4/6/8. The crossover speed shifts left as terrain gets harder." },
        { x: 0.5, y: 0.60, label: "Success: auto vs fixed", note: "Teal (auto) tracks the better of blue (trot) and orange (bound) on nearly every terrain × speed case." },
        { x: 0.5, y: 0.90, label: "The scoreboard", note: "Auto: 44.4% best-performance rate, 4.99% average regret, 0.711 worst-case score — the fixed gaits collapse somewhere; auto doesn't." },
      ],
      panels: [
        {
          subplotLabel: "Trot fraction vs command velocity (difficulty 6)",
          xLabel: "command velocity (m/s)", yLabel: "trot fraction",
          chartKind: "line",
          digitized: {
            badge: "paper's data",
            source: "data S1, 'Figure 6B' sheet — fraction of time trotting, difficulty level 6",
            series: ["Rough", "Low stair", "Discrete", "Hurdle", "High step", "Gap"].map((t) => ({
              label: t, points: (FIG6B[`${t} · L6`] || []),
            })),
          },
        },
        {
          subplotLabel: "Success rate by terrain — auto vs fixed gaits (all speeds)",
          xLabel: "terrain", yLabel: "success rate (%)",
          chartKind: "bar",
          digitized: {
            kind: "groupedBar", badge: "paper's data",
            source: "data S1, 'Figure 6Ci' sheet — success rate across 0–6 m/s commands",
            colors: CTRL_COLORS, unit: "%",
            groups: FIG6C.map((r) => ({
              name: r.terrain.replace("Stepping stones", "Step. stones"),
              bars: [
                { label: "Trot only", value: r.success.trot },
                { label: "Auto (ours)", value: r.success.ours },
                { label: "Bound only", value: r.success.bound },
              ],
            })),
          },
        },
        {
          subplotLabel: "Velocity tracking by terrain (all speeds)",
          xLabel: "terrain", yLabel: "tracking reward",
          chartKind: "bar",
          digitized: {
            kind: "groupedBar", badge: "paper's data",
            source: "data S1, 'Figure 6Ci' sheet — velocity-tracking reward across 0–6 m/s commands",
            colors: CTRL_COLORS,
            groups: FIG6C.map((r) => ({
              name: r.terrain.replace("Stepping stones", "Step. stones"),
              bars: [
                { label: "Trot only", value: r.tracking.trot },
                { label: "Auto (ours)", value: r.tracking.ours },
                { label: "Bound only", value: r.tracking.bound },
              ],
            })),
          },
        },
      ],
    },
    {
      figureLabel: "Figure 7",
      page: 12,
      image: FIG("sr-fig7"),
      title: "Ablations: priors, adaptation, samples, transitions",
      explanation:
        "The training-strategy comparisons. (B) Against AMP and vanilla RL, the method matches success rates while " +
        "consistently using less energy (lower COT). (C) Adapting from flat ground to the full obstacle course: our " +
        "policy's velocity-tracking reward and terrain difficulty keep climbing after the exploration phase, while " +
        "HRL+residual plateaus early. (D) It also consumes fewer total samples — the HRL baseline additionally pays " +
        "for pretraining each expert. (E) Under random gait switching at 2 Hz, transition success stays 74–95% for " +
        "ours vs 15–59% for HRL+residual, and the pitch-angle trace shows why: the baseline stumbles and falls after " +
        "a bound→trot switch. Panels plot the authors' own learning curves and transition rates.",
      hotspots: [
        { x: 0.5, y: 0.065, label: "Eight training terrains", note: "Stairs up/down, stepping stones, rough, hurdle, discrete, high step, gap — all randomized in difficulty during RL." },
        { x: 0.30, y: 0.48, label: "Keeps climbing", note: "Teal (ours) passes the HRL+residual baseline once exploitation starts and reaches difficulty ≈6 vs ≈3." },
        { x: 0.78, y: 0.75, label: "The fall", note: "In the transition test, HRL+residual stumbles after the switch (red 'Fall occurred'); ours re-times its footfalls and stabilizes." },
      ],
      panels: [
        {
          subplotLabel: "Velocity-tracking reward vs training samples",
          xLabel: "training samples (×10⁹, approx.)", yLabel: "velocity-tracking reward",
          chartKind: "line",
          digitized: {
            badge: "paper's data",
            source: "data S1, 'Figure7 C' sheet — velocity-tracking reward, ours vs HRL with residual (steps mapped to the paper's ≈19.7×10⁹-sample budget)",
            series: [
              { label: "Ours", points: FIG7C.reward.map((r) => [+(r[0] / 96149 * 19.7).toFixed(2), r[2]]) },
              { label: "HRL with residual", points: FIG7C.reward.map((r) => [+(r[0] / 96149 * 19.7).toFixed(2), r[1]]) },
            ],
          },
        },
        {
          subplotLabel: "Terrain difficulty reached vs training samples",
          xLabel: "training samples (×10⁹, approx.)", yLabel: "terrain difficulty level",
          chartKind: "line",
          digitized: {
            badge: "paper's data",
            source: "data S1, 'Figure7 C' sheet — curriculum terrain level, ours vs HRL with residual",
            series: [
              { label: "Ours", points: FIG7C.level.map((r) => [+(r[0] / 96149 * 19.7).toFixed(2), r[2]]) },
              { label: "HRL with residual", points: FIG7C.level.map((r) => [+(r[0] / 96149 * 19.7).toFixed(2), r[1]]) },
            ],
          },
        },
        {
          subplotLabel: "Transition success vs terrain difficulty (2 Hz random switching)",
          xLabel: "terrain difficulty level", yLabel: "transition success rate (%)",
          chartKind: "line",
          digitized: {
            badge: "paper's data",
            source: "data S1, 'Figure7 Eii' sheet — success of randomly-triggered gait transitions, averaged over command velocities",
            series: Object.entries(FIG7E).map(([pol, pts]) => ({ label: pol, points: pts })),
          },
        },
      ],
    },
    {
      figureLabel: "Figure 8",
      page: 13,
      image: FIG("sr-fig8"),
      title: "Sensor ablation — why depth camera + LIDAR together",
      explanation:
        "Success rates when the policy perceives with both sensors, LIDAR only, or depth camera only, across seven " +
        "terrains at 1–7 m/s commands. The fused policy wins everywhere. LIDAR-only holds up where long-range " +
        "geometry matters (stairs, rough, gaps) but collapses on hurdles (24% vs 44%); depth-only is competitive on " +
        "stepping stones' precise local geometry but loses 14 points on low stairs. The panel reproduces the grouped " +
        "bars with the paper's exact means and standard deviations.",
      hotspots: [
        { x: 0.13, y: 0.35, label: "Fusion wins on stairs", note: "82% vs 76% (LIDAR-only) vs 63% (depth-only): long-range LIDAR sees the staircase early; depth fills in the local step edges." },
        { x: 0.52, y: 0.55, label: "Hurdles need depth", note: "The LIDAR-only policy drops to ≈24% on hurdles — thin obstacles demand the depth camera's dense local geometry." },
        { x: 0.88, y: 0.30, label: "Error bars = 10 trials", note: "Each bar: 100 agents × 10 trials; whiskers are standard deviation, exactly as published." },
      ],
      panels: [
        {
          subplotLabel: "Success rate by terrain & sensing (mean ± SD)",
          xLabel: "terrain", yLabel: "success rate (%)",
          chartKind: "bar",
          digitized: {
            kind: "groupedBar", badge: "paper's data",
            source: "data S1, 'Figure 8' sheet — 100 agents × 10 trials per bar",
            colors: SENSOR_COLORS, unit: "%",
            groups: [...new Set(FIG8.map((r) => r.terrain))].map((terrain) => ({
              name: terrain.replace("Stepping stones", "Step. stones"),
              bars: FIG8.filter((r) => r.terrain === terrain).map((r) => ({
                label: r.type, value: r.success, err: r.std,
              })),
            })),
          },
        },
      ],
    },
  ],
};
