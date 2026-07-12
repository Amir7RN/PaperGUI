/**
 * The bundled sample paper, expressed in the same PaperSpec format that the
 * AI analyzer produces — so the generic engine and workspace are exercised
 * end-to-end even before any PDF is uploaded.
 */

const conceptSvg = `
<svg viewBox="0 0 760 150" xmlns="http://www.w3.org/2000/svg" font-family="system-ui, sans-serif">
  <defs>
    <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#898781"/>
    </marker>
  </defs>
  <g font-size="12" text-anchor="middle">
    <text x="52" y="70" fill="#52514e" font-style="italic" font-size="14">x(t)</text>
    <line x1="78" y1="66" x2="118" y2="66" stroke="#898781" stroke-width="1.5" marker-end="url(#arr)"/>
    <rect x="122" y="38" width="120" height="56" rx="10" fill="#eef4fc" stroke="#2a78d6" stroke-width="1.5"/>
    <text x="182" y="61" fill="#0b0b0b" font-weight="600">Recursive LPF</text>
    <text x="182" y="80" fill="#52514e" font-style="italic">y[n] = αx + (1−α)y</text>
    <line x1="246" y1="66" x2="286" y2="66" stroke="#898781" stroke-width="1.5" marker-end="url(#arr)"/>
    <rect x="290" y="38" width="120" height="56" rx="10" fill="#f1eefb" stroke="#4a3aa7" stroke-width="1.5"/>
    <text x="350" y="61" fill="#0b0b0b" font-weight="600">Saturating gain</text>
    <text x="350" y="80" fill="#52514e" font-style="italic">z = G·tanh(y/S)</text>
    <line x1="414" y1="66" x2="454" y2="66" stroke="#898781" stroke-width="1.5" marker-end="url(#arr)"/>
    <rect x="458" y="38" width="150" height="56" rx="10" fill="#fdeeee" stroke="#e34948" stroke-width="1.5"/>
    <text x="533" y="61" fill="#0b0b0b" font-weight="600">PID + plant</text>
    <text x="533" y="80" fill="#52514e" font-style="italic">τẏ = −y + u + w·z</text>
    <line x1="612" y1="66" x2="652" y2="66" stroke="#898781" stroke-width="1.5" marker-end="url(#arr)"/>
    <text x="690" y="70" fill="#52514e" font-style="italic" font-size="14">y(t)</text>
    <text x="533" y="122" fill="#898781" font-size="11">r(t) step command enters the loop as e = r − y</text>
  </g>
</svg>`;

export const SAMPLE_SPEC = {
  meta: {
    title:
      "A Generalized Multi-Stage Filtering and Feedback-Regulation Framework for Noisy Multi-Frequency Signals",
    authors: "R. Ellison, M. Okafor, T. Lindqvist, and A. Ramezani",
    venue: "Journal of Computational Systems Engineering, Vol. 41 (2024)",
    abstract:
      "We present a four-stage methodology that conditions a noisy multi-frequency input " +
      "through a first-order recursive filter and a saturating gain stage, then uses the " +
      "conditioned signal as a coupled disturbance on a PID-regulated first-order plant. " +
      "With the reported coefficients, the closed loop tracks a step command with under 9% " +
      "overshoot and settles within 2.1 s despite broadband measurement noise.",
  },
  archetype: {
    kind: "simulation-control",
    pipelineFeasible: true,
    reproductionAdvice:
      "The method is a fully computable signal chain (filter → gain → PID loop); every result figure " +
      "falls directly out of simulating it, so all figures are honestly reproducible.",
  },
  story: {
    problem:
      "Real sensors are noisy. Before a machine can act on a measured signal — a temperature, a position, " +
      "a pressure — that signal has to be cleaned up and kept under control, even while random noise keeps " +
      "kicking it around.",
    gap:
      "Classic recipes treat filtering and control as separate problems tuned separately. When the cleaned-up " +
      "signal also feeds back into the loop as a disturbance, tuning one stage can silently break the other.",
    contribution: [
      {
        headline: "One chain, tuned as a whole",
        detail:
          "The paper treats filter, saturating pre-shaper and PID controller as a single four-stage pipeline " +
          "and reports one coefficient set that makes the whole chain behave — not four locally tuned pieces.",
      },
      {
        headline: "Saturation as a feature, not a flaw",
        detail:
          "Instead of avoiding the saturating gain stage, the method uses its soft-limiting to keep noise " +
          "spikes from ever reaching the plant at full strength.",
      },
      {
        headline: "Robustness quantified across plant speeds",
        detail:
          "The same coefficients are stress-tested against slower and faster plants and swept over the " +
          "proportional gain, mapping exactly where the design stays calm and where it starts to overshoot.",
      },
    ],
    whyItMatters:
      "One coefficient set that survives noise, saturation and plant variation means less hand-tuning in " +
      "the lab — the recipe transfers instead of being re-derived for every rig.",
  },
  mindmap: {
    nodes: [
      { id: "paper", label: "Filter+Gain+PID Chain", kind: "paper",
        detail: "A four-stage pipeline — recursive filter, saturating gain, then a PID-regulated plant — tuned and reported as ONE coefficient set instead of four separately-tuned pieces." },
      { id: "prob", label: "Noisy sensors destabilize control", kind: "problem",
        detail: "Real sensors are noisy. Before a control loop can act on a measurement, it has to be cleaned up — but cleaning it up interacts with the control loop itself." },
      { id: "prior1", label: "IIR filtering (Oppenheim & Schafer)", kind: "prior",
        detail: "The recursive low-pass filter this paper uses is the classic exponential moving average: one multiply, one memory cell, a genuine cutoff — but it adds phase lag." },
      { id: "prior2", label: "PID tuning rules (Åström & Murray)", kind: "prior",
        detail: "Classic PID design treats the controller in isolation, assuming a clean reference signal — this paper breaks that assumption on purpose." },
      { id: "m1", label: "Saturating pre-shaper", kind: "method",
        detail: "z = G·tanh(y/S) — a smooth soft limiter placed between the filter and the plant, so noise spikes never reach the plant at full strength." },
      { id: "m2", label: "Whole-chain tuning", kind: "method",
        detail: "All four stages (filter α, gain G, and the PID gains) are tuned together as one system, not locally optimized in isolation." },
      { id: "c1", label: "One coefficient set, not four", kind: "contribution",
        detail: "The paper's central claim: a single reported coefficient set (α=0.18, G=1.6, Kp=2.4, Ki=1.1, Kd=0.35) makes the whole chain behave." },
      { id: "c2", label: "Saturation as a feature", kind: "contribution",
        detail: "Instead of avoiding the saturating stage as a nonlinearity to fight, the method deliberately exploits its soft-limiting." },
      { id: "res1", label: "<9% overshoot, 2.1s settling", kind: "result",
        detail: "With the published coefficients the closed loop tracks a step command with under 9% overshoot and settles within 2.1 seconds despite broadband noise." },
      { id: "res2", label: "Robust across plant speeds", kind: "result",
        detail: "The same coefficients were stress-tested against slower and faster plants and swept over the proportional gain, mapping where the design stays calm." },
    ],
    edges: [
      { from: "prob", to: "paper", label: "motivates" },
      { from: "prior1", to: "paper", label: "builds on" },
      { from: "prior2", to: "paper", label: "builds on" },
      { from: "paper", to: "m1", label: "introduces" },
      { from: "paper", to: "m2", label: "introduces" },
      { from: "paper", to: "c1", label: "claims" },
      { from: "paper", to: "c2", label: "claims" },
      { from: "m2", to: "res1", label: "achieves" },
      { from: "m1", to: "res2", label: "achieves" },
    ],
  },
  conclusion:
    "With the published coefficients (α = 0.18, G = 1.6, Kp = 2.4, Ki = 1.1, Kd = 0.35), " +
    "the closed-loop system tracks the step command with low overshoot and fast settling, " +
    "demonstrating that moderate recursive filtering plus saturating pre-shaping is " +
    "sufficient for robust regulation under broadband noise.",
  references: [
    "K. J. Åström & R. M. Murray, Feedback Systems: An Introduction for Scientists and Engineers, 2nd ed., Princeton Univ. Press, 2021.",
    "A. V. Oppenheim & R. W. Schafer, Discrete-Time Signal Processing, 3rd ed., Pearson, 2010.",
    "S. Skogestad, \"Simple analytic rules for model reduction and PID controller tuning,\" J. Process Control 13(4), 2003.",
    "G. F. Franklin, J. D. Powell & A. Emami-Naeini, Feedback Control of Dynamic Systems, 8th ed., Pearson, 2019.",
    "B. Widrow & S. D. Stearns, Adaptive Signal Processing, Prentice-Hall, 1985.",
  ],
  conceptFigures: [
    {
      title: "Fig. 1 — System architecture (concept)",
      explanation:
        "The paper's core idea in one picture: a noisy multi-frequency excitation is conditioned " +
        "in two stages (a recursive low-pass filter that removes broadband noise, then a smooth " +
        "saturating gain that bounds the signal's energy) before it enters a feedback-regulated " +
        "plant as a coupled disturbance. The claim under test is that this two-stage conditioning " +
        "is what lets a plain PID loop stay well-behaved despite the noise — every module below " +
        "lets you probe exactly that.",
      svg: conceptSvg,
    },
  ],
  foundations: [
    {
      title: "First-order recursive (IIR) filtering",
      source: "Oppenheim & Schafer, Discrete-Time Signal Processing",
      concept:
        "The exponential moving average is the simplest infinite-impulse-response filter: each output " +
        "sample blends a fraction α of the newest measurement with (1−α) of the previous output. It " +
        "needs one multiply and one memory cell, yet acts as a genuine low-pass filter whose cutoff is " +
        "set by α. The price of noise rejection is phase lag: the smaller α, the smoother the output " +
        "but the later it responds — a delay that can destabilize any feedback loop wrapped around it. " +
        "This noise-vs-lag trade is the central tension the paper's Stage 1 must manage.",
      equation: "y[n] = α·x[n] + (1 − α)·y[n−1]",
      whyItMatters:
        "The paper picks α = 0.18 to buy ≈11 dB of noise attenuation while keeping the group delay " +
        "small enough for the downstream loop to stay stable.",
      demo: {
        kind: "chart", T: 6, dt: 0.02,
        xLabel: "t (s)", yLabel: "signal",
        caption: "drag the trust dial: low = smooth but late, high = fast but noisy",
        params: [
          { key: "alpha", sym: "α", label: "Trust in each new sample", min: 0.02, max: 1, step: 0.02, def: 0.15 },
        ],
        computeJs: `
const raw = new Array(helpers.n), out = new Array(helpers.n);
let y = 0;
for (let i = 0; i < helpers.n; i++) {
  raw[i] = Math.sin(2 * Math.PI * 0.5 * helpers.t[i]) + 0.5 * helpers.noise[i];
  y = params.alpha * raw[i] + (1 - params.alpha) * y;
  out[i] = y;
}
return { series: [
  { label: "noisy measurement", data: raw },
  { label: "filtered", data: out },
] };`,
      },
    },
    {
      title: "PID feedback control",
      source: "Åström & Murray, Feedback Systems",
      concept:
        "The proportional–integral–derivative controller is the workhorse of feedback: the P term " +
        "pushes against the current error, the I term accumulates past error to eliminate steady-state " +
        "offset, and the D term anticipates by reacting to the error's slope. Tuning is a compromise — " +
        "more P speeds the response but overshoots, more I removes offset but can ring, more D damps " +
        "ringing but amplifies noise. Anti-windup clamping of the integrator prevents runaway when the " +
        "actuator saturates.",
      equation: "u = Kₚe + Kᵢ∫e dt + K_d·ė",
      whyItMatters:
        "The paper's headline claim — <9% overshoot, 2.1 s settling under noise — is a statement about " +
        "this classic law working despite the injected disturbance, thanks to the conditioning stages.",
      demo: {
        kind: "chart", T: 8, dt: 0.02,
        xLabel: "t (s)", yLabel: "position",
        caption: "one knob, three personalities: sluggish, perfect, or ringing — find each one",
        params: [
          { key: "Kp", sym: "Kₚ", label: "Reaction strength", min: 0.2, max: 10, step: 0.1, def: 2 },
        ],
        computeJs: `
const r = new Array(helpers.n), y = new Array(helpers.n);
let pos = 0, vel = 0;
for (let i = 0; i < helpers.n; i++) {
  r[i] = helpers.t[i] >= 1 ? 1 : 0;
  const acc = params.Kp * (r[i] - pos) - 0.8 * vel;
  vel += acc * helpers.dt;
  pos += vel * helpers.dt;
  y[i] = pos;
}
return { series: [
  { label: "target", data: r },
  { label: "response", data: y },
] };`,
      },
    },
    {
      title: "Saturating (sigmoid) nonlinearities",
      source: "Standard nonlinear-systems practice; cf. describing-function analysis",
      concept:
        "A tanh-shaped gain is linear for small inputs and flattens to a hard ceiling for large ones. " +
        "Passing a signal through it guarantees the output can never exceed ±G no matter what spike " +
        "arrives — a smooth, differentiable alternative to hard clipping that doesn't inject the harsh " +
        "harmonics a hard limiter would. In control systems it is used to bound the energy a noisy or " +
        "unmodeled signal can inject into a loop.",
      equation: "z = G·tanh(y / S)",
      whyItMatters:
        "Stage 2 uses exactly this to cap the disturbance energy entering the regulation loop, which " +
        "is what makes the closed loop robust to input-amplitude surprises.",
      demo: {
        kind: "chart", T: 1, dt: 1,
        xLabel: "input", yLabel: "output",
        caption: "feed the squasher a growing input — see where 'almost linear' turns into 'hard ceiling'",
        params: [
          { key: "S", sym: "S", label: "Where the squash begins", min: 0.2, max: 3, step: 0.05, def: 1 },
        ],
        computeJs: `
const N = 121, x = [], out = [], ident = [];
for (let i = 0; i < N; i++) {
  const u = -3 + (6 * i) / (N - 1);
  x.push(u);
  out.push(Math.tanh(u / params.S));
  ident.push(Math.max(-1.2, Math.min(1.2, u)));
}
return { x, series: [
  { label: "squashed output", data: out },
  { label: "no squash (for comparison)", data: ident },
] };`,
      },
    },
  ],
  resultFigures: [
    {
      figureLabel: "Fig. 6",
      title: "Closed-loop step response and signal conditioning",
      explanation:
        "The paper's headline result, shown as two subplots. (a) The regulated output tracking the " +
        "step command, compared against the uncontrolled plant — the gap is what the controller buys " +
        "you. (b) The signal at each conditioning stage. Move the PID gains, filter α or gain G and " +
        "both subplots redraw against the author's baseline (dashed).",
      hotspots: [
        { x: 0.32, y: 0.22, label: "the step command", note: "At t = 2s the reference jumps — this is the disturbance the whole loop has to reject." },
        { x: 0.55, y: 0.11, label: "fast, low overshoot", note: "The controlled output (blue) catches the step with under 9% overshoot — the paper's headline number." },
        { x: 0.42, y: 0.63, label: "the gap the controller buys you", note: "The red curve is the SAME plant with no controller — it barely moves. That gap is the paper's whole argument." },
      ],
      svg: `<svg viewBox="0 0 300 180" xmlns="http://www.w3.org/2000/svg" font-family="system-ui" font-size="8">
        <rect x="0" y="0" width="300" height="180" fill="white"/>
        <text x="8" y="12" fill="#52514e" font-weight="600">(a) step tracking</text>
        <line x1="30" y1="80" x2="290" y2="80" stroke="#c3c2b7"/><line x1="30" y1="20" x2="30" y2="80" stroke="#c3c2b7"/>
        <polyline points="30,80 95,80 95,30 290,30" fill="none" stroke="#4a3aa7" stroke-width="1.2" stroke-dasharray="3 2"/>
        <path d="M95 80 C 115 22, 135 26, 160 32 S 220 30, 290 30" fill="none" stroke="#2a78d6" stroke-width="1.4"/>
        <line x1="95" y1="80" x2="290" y2="79" stroke="#e34948" stroke-width="1.2"/>
        <text x="150" y="98" fill="#52514e" font-weight="600">(b) conditioning stages</text>
        <line x1="30" y1="160" x2="290" y2="160" stroke="#c3c2b7"/><line x1="30" y1="108" x2="30" y2="160" stroke="#c3c2b7"/>
        <path d="M30 135 Q 70 108, 110 150 T 190 120 T 290 138" fill="none" stroke="#898781" stroke-width="1"/>
        <path d="M30 135 Q 90 124, 150 140 T 290 133" fill="none" stroke="#1baf7a" stroke-width="1.2"/>
      </svg>`,
      panels: [
        {
          subplotLabel: "(a) Step tracking vs. uncontrolled plant",
          xLabel: "t (s)", yLabel: "position",
          computeJs: `
const R = 1.5, tStep = 2.0;
const cmd = new Array(helpers.n), y = outputs.resp;
for (let i = 0; i < helpers.n; i++) cmd[i] = helpers.t[i] >= tStep ? R : 0;
const off = helpers.simulate({ Kp: 0, Ki: 0, Kd: 0 }); // no controller
return { series: [
  { label: "Command r(t)", data: cmd },
  { label: "Closed-loop y(t)", data: y },
  { label: "Uncontrolled", data: off ? off.resp : cmd },
] };`,
        },
        {
          subplotLabel: "(b) Signal at each conditioning stage",
          xLabel: "t (s)", yLabel: "amplitude",
          computeJs: `
return { series: [
  { label: "Raw x(t)", data: outputs.raw },
  { label: "Filtered y(t)", data: outputs.filt },
  { label: "Shaped z(t)", data: outputs.shaped },
] };`,
        },
      ],
    },
    {
      figureLabel: "Fig. 7",
      title: "Robustness: error vs. plant speed, and overshoot vs. gain",
      explanation:
        "The paper's robustness study, reproduced as two subplots that both use scenario sweeps. " +
        "(a) Tracking error for three plant time constants — the loop stays fast for small τ and " +
        "degrades as the plant slows. (b) Percent overshoot swept across the proportional gain Kₚ. " +
        "Changing any other slider shifts these whole curves, because each point re-runs the model.",
      hotspots: [
        { x: 0.33, y: 0.28, label: "slow plants degrade", note: "The τ = 1.0 curve (amber) sags further from zero and takes longer to recover — the loop's speed is capped by the plant itself." },
        { x: 0.68, y: 0.13, label: "fast plants recover cleanly", note: "τ = 0.3 (blue) barely dips before the controller pulls the error back to zero." },
        { x: 0.72, y: 0.62, label: "overshoot climbs with Kp", note: "Pushing the proportional gain higher trades a faster response for a bigger overshoot — the curve's upward bend is that tradeoff." },
      ],
      svg: `<svg viewBox="0 0 300 180" xmlns="http://www.w3.org/2000/svg" font-family="system-ui" font-size="8">
        <rect x="0" y="0" width="300" height="180" fill="white"/>
        <text x="8" y="12" fill="#52514e" font-weight="600">(a) error vs τ</text>
        <line x1="30" y1="80" x2="290" y2="80" stroke="#c3c2b7"/><line x1="30" y1="20" x2="30" y2="80" stroke="#c3c2b7"/>
        <path d="M30 80 L95 80 L95 32 Q 150 88, 210 78 T 290 80" fill="none" stroke="#2a78d6" stroke-width="1.1"/>
        <path d="M30 80 L95 80 L95 32 Q 160 96, 240 78 T 290 80" fill="none" stroke="#1baf7a" stroke-width="1.1"/>
        <path d="M30 80 L95 80 L95 32 Q 180 104, 270 82 T 290 82" fill="none" stroke="#eda100" stroke-width="1.1"/>
        <text x="120" y="98" fill="#52514e" font-weight="600">(b) overshoot vs Kp</text>
        <line x1="30" y1="160" x2="290" y2="160" stroke="#c3c2b7"/><line x1="30" y1="108" x2="30" y2="160" stroke="#c3c2b7"/>
        <path d="M40 150 C 110 148, 160 130, 290 112" fill="none" stroke="#e34948" stroke-width="1.4"/>
      </svg>`,
      panels: [
        {
          subplotLabel: "(a) Tracking error for three plant speeds",
          xLabel: "t (s)", yLabel: "error e(t)",
          computeJs: `
const R = 1.5, tStep = 2.0;
function err(o) {
  const e = new Array(helpers.n);
  for (let i = 0; i < helpers.n; i++) e[i] = (helpers.t[i] >= tStep ? R : 0) - o.resp[i];
  return e;
}
const fast = helpers.simulate({ tau: 0.3 });
const nom  = helpers.simulate({ tau: 0.5 });
const slow = helpers.simulate({ tau: 1.0 });
return { series: [
  { label: "τ = 0.3 (fast)", data: err(fast) },
  { label: "τ = 0.5 (nominal)", data: err(nom) },
  { label: "τ = 1.0 (slow)", data: err(slow) },
] };`,
        },
        {
          subplotLabel: "(b) Overshoot swept over proportional gain",
          xLabel: "Kₚ", yLabel: "overshoot (%)",
          computeJs: `
const R = 1.5, iStep = Math.round(2.0 / helpers.dt);
const kps = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4];
const x = [], os = [];
for (const kp of kps) {
  const o = helpers.simulate({ Kp: kp });
  let peak = -1e9;
  for (let i = iStep; i < helpers.n; i++) peak = Math.max(peak, o.resp[i]);
  x.push(kp);
  os.push(helpers.clamp((peak - R) / R * 100, 0, 200)); // clamp the unstable tail
}
return { x, series: [ { label: "Overshoot", data: os } ] };`,
        },
      ],
    },
  ],
  protocol: {
    T: 12,
    dt: 0.05,
    description:
      "Protocol constants fixed by the paper: step command R = 1.5 at t = 2 s, disturbance " +
      "coupling w_d = 0.35, horizon 12 s, Δt = 0.05 s. Noise realization is seeded — every " +
      "visible change is caused by your edits, never by resampling.",
  },
  blocks: [
    {
      key: "raw",
      plain: "Every experiment starts with a messy input. Here it's a wavy signal — one slow wave, one fast wave — buried in static, like a radio station fighting through interference. The sliders let you make the waves taller or the static louder.",
      title: "Signal Synthesis (Universal Signal Adapter)",
      equation: "x(t) = A₁·sin(2πf₁t) + A₂·sin(2πf₂t) + η·𝒩(0,1)",
      params: [
        { key: "A1",  sym: "A₁", label: "Primary amplitude",   min: 0,    max: 3, step: 0.05, def: 1.0  },
        { key: "f1",  sym: "f₁", label: "Primary freq (Hz)",   min: 0.1,  max: 2, step: 0.05, def: 0.4  },
        { key: "A2",  sym: "A₂", label: "Secondary amplitude", min: 0,    max: 2, step: 0.05, def: 0.5  },
        { key: "f2",  sym: "f₂", label: "Secondary freq (Hz)", min: 0.5,  max: 6, step: 0.1,  def: 2.2  },
        { key: "eta", sym: "η",  label: "Noise intensity",     min: 0,    max: 1, step: 0.01, def: 0.25 },
      ],
      theory:
        "§3.1 of the paper: “Where raw empirical traces are unavailable, we adopt a surrogate " +
        "excitation x(t) composed of two sinusoidal components corrupted by additive white Gaussian " +
        "noise, spectrally matched to the empirical excitation in Fig. 2 of the original study " +
        "(dominant tone near 0.4 Hz, secondary tone near 2.2 Hz, SNR ≈ 12 dB).” The same seeded " +
        "noise realization is reused for baseline and modified runs.",
      pythonCode: `import numpy as np

rng = np.random.default_rng(1337)
t = np.arange(0.0, 12.0 + 0.05, 0.05)
noise = rng.standard_normal(t.size)

def synthesize(A1=1.0, f1=0.4, A2=0.5, f2=2.2, eta=0.25):
    """x(t) = A1 sin(2*pi*f1*t) + A2 sin(2*pi*f2*t) + eta*N(0,1)"""
    return (A1 * np.sin(2*np.pi*f1*t)
          + A2 * np.sin(2*np.pi*f2*t)
          + eta * noise)`,
      computeJs: `
const out = new Array(helpers.n);
for (let i = 0; i < helpers.n; i++) {
  const ti = helpers.t[i];
  out[i] = params.A1 * Math.sin(2 * Math.PI * params.f1 * ti)
         + params.A2 * Math.sin(2 * Math.PI * params.f2 * ti)
         + params.eta * helpers.noise[i];
}
return out;`,
    },
    {
      key: "filt",
      plain: "First cleanup step: a smoothing filter that trusts each new measurement only a little, blending it with what it already believes. Small trust = silky-smooth output that reacts late; big trust = instant reaction that lets the static through. One dial, one classic dilemma.",
      title: "Stage 1 — Recursive Low-Pass Filter",
      equation: "y[n] = α·x[n] + (1 − α)·y[n−1]",
      params: [
        { key: "alpha", sym: "α", label: "Filter coefficient", min: 0.01, max: 1, step: 0.01, def: 0.18 },
      ],
      theory:
        "§3.2: “The measurement stream is conditioned by a single-pole recursive filter. The " +
        "coefficient α trades noise rejection against phase lag: the reported α = 0.18 attenuates " +
        "the broadband noise floor by ≈ 11 dB while keeping group delay below 0.3 s at the dominant " +
        "excitation frequency.” Push α toward 1 and the filter becomes a pass-through; push it " +
        "toward 0 and the lag destabilizes the downstream loop.",
      pythonCode: `def ema_filter(x, alpha=0.18):
    """Single-pole IIR:  y[n] = alpha*x[n] + (1-alpha)*y[n-1]"""
    y = np.empty_like(x)
    y[0] = x[0]
    for n in range(1, x.size):
        y[n] = alpha * x[n] + (1.0 - alpha) * y[n - 1]
    return y`,
      computeJs: `
const out = new Array(helpers.n);
out[0] = input[0];
for (let i = 1; i < helpers.n; i++) {
  out[i] = params.alpha * input[i] + (1 - params.alpha) * out[i - 1];
}
return out;`,
    },
    {
      key: "shaped",
      plain: "Next, a safety squash. Small signals pass through almost untouched, but the harder the signal pushes, the more this stage pushes back — nothing can ever exceed the ceiling. It's a volume limiter for physics: spikes come in, gentle bumps come out.",
      title: "Stage 2 — Saturating Gain Shaping",
      equation: "z(t) = G·tanh( y(t) / S )",
      params: [
        { key: "G", sym: "G", label: "Linear gain",      min: 0.1, max: 4, step: 0.05, def: 1.6 },
        { key: "S", sym: "S", label: "Saturation level", min: 0.2, max: 4, step: 0.05, def: 1.2 },
      ],
      theory:
        "§3.3: “The filtered signal is amplified through a smooth saturating nonlinearity " +
        "z = G·tanh(y/S). For |y| ≪ S the stage is linear with slope G/S; for |y| ≫ S it limits at " +
        "±G, bounding the disturbance energy injected into the regulation loop regardless of input " +
        "amplitude.” This is the block that makes the method robust to un-modeled spikes.",
      pythonCode: `def shape(y, G=1.6, S=1.2):
    """Smooth saturation:  z = G * tanh(y / S)"""
    return G * np.tanh(y / S)`,
      computeJs: `
const out = new Array(helpers.n);
for (let i = 0; i < helpers.n; i++) {
  out[i] = params.G * Math.tanh(input[i] / params.S);
}
return out;`,
    },
    {
      key: "resp",
      plain: "Finally, the payoff: a feedback controller tries to hold a target while the cleaned-up (but still misbehaving) signal keeps nudging it. Tune the three control knobs and watch it snap to the target, wobble around it, or give up entirely — this plot is the paper's whole claim in one picture.",
      title: "Stage 3 — PID-Regulated Plant (headline result)",
      equation: "τ·ẏ = −y + u + w_d·z,   u = Kₚe + Kᵢ∫e dt + K_d·ė,   e = r − y",
      params: [
        { key: "Kp",  sym: "Kₚ",  label: "Proportional gain", min: 0,    max: 8, step: 0.05, def: 2.4  },
        { key: "Ki",  sym: "Kᵢ",  label: "Integral gain",     min: 0,    max: 4, step: 0.05, def: 1.1  },
        { key: "Kd",  sym: "K_d", label: "Derivative gain",   min: 0,    max: 2, step: 0.01, def: 0.35 },
        { key: "tau", sym: "τ",   label: "Plant time const.", min: 0.05, max: 2, step: 0.05, def: 0.5  },
      ],
      theory:
        "§3.4: “The shaped signal acts as a coupled disturbance d(t) = w_d·z(t) (w_d = 0.35) on a " +
        "first-order plant τ·ẏ = −y + u + d driven by a PID law with the step command " +
        "r(t) = 1.5·𝟙(t ≥ 2). The integrator is clamped to ±10 for anti-windup. The published gains " +
        "give < 9% overshoot and 2.1 s settling.” Weakening Kₚ or inflating τ slows the loop until " +
        "the disturbance dominates; excessive Kᵢ re-introduces oscillation.",
      pythonCode: `def closed_loop(z, Kp=2.4, Ki=1.1, Kd=0.35, tau=0.5,
                R=1.5, t_step=2.0, wd=0.35, dt=0.05):
    y, integ, e_prev = 0.0, 0.0, 0.0
    out = np.empty_like(z)
    for n, zn in enumerate(z):
        r = R if n * dt >= t_step else 0.0
        e = r - y
        integ = np.clip(integ + e * dt, -10, 10)   # anti-windup
        deriv = 0.0 if n == 0 else (e - e_prev) / dt
        e_prev = e
        u = Kp * e + Ki * integ + Kd * deriv
        y += dt * (-y + u + wd * zn) / tau         # explicit Euler
        out[n] = y
    return out`,
      computeJs: `
const R = 1.5, tStep = 2.0, wd = 0.35;
const out = new Array(helpers.n);
let y = 0, integ = 0, ePrev = 0;
for (let i = 0; i < helpers.n; i++) {
  const r = helpers.t[i] >= tStep ? R : 0;
  const e = r - y;
  integ = helpers.clamp(integ + e * helpers.dt, -10, 10);
  const deriv = i === 0 ? 0 : (e - ePrev) / helpers.dt;
  ePrev = e;
  const u = params.Kp * e + params.Ki * integ + params.Kd * deriv;
  y += (helpers.dt * (-y + u + wd * input[i])) / params.tau;
  out[i] = y;
}
return out;`,
    },
  ],
  // Bonus explorers (this paper HAS a pipeline — these are extra, not a
  // substitute): the filter's own transfer function, on a slider, straight
  // from Eq. 2 — a second, equation-level way to feel the α tradeoff besides
  // watching the time-domain trace in the Concept Lab.
  explorables: [
    {
      title: "The filter's frequency response, live",
      basis: "equation",
      story: "Every α is a tradeoff between smoothing and lag. Drag it and watch the cutoff frequency itself slide — the same knob you tune in the Concept Lab, seen from the filter's own transfer function instead of a time trace.",
      source: "Eq. (2), the recursive filter y[n] = αx[n] + (1−α)y[n−1]",
      demo: {
        kind: "chart",
        chartKind: "line",
        T: 1, dt: 1 / 200,
        xLabel: "normalized frequency ω (0 → π)",
        yLabel: "|H(ω)|",
        caption: "drag α and watch the cutoff frequency slide",
        params: [
          { key: "alpha", sym: "α", label: "Filter coefficient", min: 0.01, max: 1, step: 0.01, def: 0.18 },
        ],
        computeJs: `
const N = helpers.n;
const w = new Array(N), mag = new Array(N);
const a = params.alpha;
for (let i = 0; i < N; i++) {
  const f = (i / (N - 1)) * Math.PI;
  w[i] = f;
  mag[i] = a / Math.sqrt(1 - 2 * (1 - a) * Math.cos(f) + (1 - a) * (1 - a));
}
return { x: w, series: [{ label: "|H(ω)|", data: mag }] };`,
      },
    },
  ],
};
