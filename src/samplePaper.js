/**
 * The bundled sample paper, expressed in the same PaperSpec format that the
 * Claude analyzer produces — so the generic engine and workspace are exercised
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
  resultFigures: [
    {
      figureLabel: "Fig. 6",
      title: "Closed-loop step response vs. command",
      xLabel: "t (s)",
      yLabel: "position",
      explanation:
        "The paper's headline result: the regulated output tracking the step command. Move the PID " +
        "gains or plant time constant and watch overshoot, rise time and settling change against the " +
        "author's baseline (dashed).",
      svg: `<svg viewBox="0 0 340 170" xmlns="http://www.w3.org/2000/svg" font-family="system-ui" font-size="9">
        <rect x="0" y="0" width="340" height="170" fill="white"/>
        <line x1="38" y1="140" x2="325" y2="140" stroke="#c3c2b7"/>
        <line x1="38" y1="20" x2="38" y2="140" stroke="#c3c2b7"/>
        <text x="10" y="55" fill="#898781">1.5</text>
        <text x="20" y="143" fill="#898781">0</text>
        <text x="300" y="155" fill="#898781">t</text>
        <polyline points="38,140 108,140 108,55 325,55" fill="none" stroke="#4a3aa7" stroke-width="1.5" stroke-dasharray="3 3"/>
        <path d="M108 140 C 130 40, 150 45, 172 58 S 210 55, 325 55" fill="none" stroke="#111" stroke-width="1.6"/>
        <text x="150" y="35" fill="#4a3aa7">command r(t)</text>
        <text x="205" y="80" fill="#111">response y(t)</text>
      </svg>`,
      computeJs: `
const R = 1.5, tStep = 2.0;
const cmd = new Array(helpers.n), y = outputs.resp;
for (let i = 0; i < helpers.n; i++) cmd[i] = helpers.t[i] >= tStep ? R : 0;
return { series: [
  { label: "Command r(t)", data: cmd },
  { label: "Closed-loop y(t)", data: y },
] };`,
    },
    {
      figureLabel: "Fig. 7",
      title: "Tracking error under regulation",
      xLabel: "t (s)",
      yLabel: "error e(t)",
      explanation:
        "The regulation error e = r − y over time. A well-tuned loop drives it to zero quickly; " +
        "detune the gains and the error rings or fails to settle — exactly the failure modes §4 warns about.",
      svg: `<svg viewBox="0 0 340 170" xmlns="http://www.w3.org/2000/svg" font-family="system-ui" font-size="9">
        <rect x="0" y="0" width="340" height="170" fill="white"/>
        <line x1="38" y1="90" x2="325" y2="90" stroke="#c3c2b7"/>
        <line x1="38" y1="20" x2="38" y2="150" stroke="#c3c2b7"/>
        <text x="20" y="93" fill="#898781">0</text>
        <path d="M38 90 L108 90 L108 35 C 150 30, 180 92, 230 90 S 325 90, 325 90" fill="none" stroke="#e34948" stroke-width="1.6"/>
        <text x="150" y="120" fill="#e34948">e(t) = r − y</text>
      </svg>`,
      computeJs: `
const R = 1.5, tStep = 2.0, y = outputs.resp;
const e = new Array(helpers.n);
for (let i = 0; i < helpers.n; i++) e[i] = (helpers.t[i] >= tStep ? R : 0) - y[i];
return { series: [ { label: "Tracking error", data: e } ] };`,
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
};
