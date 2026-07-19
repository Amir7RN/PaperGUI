/**
 * Eighth bundled sample — a CONTROL-THEORY / CONVEX-OPTIMIZATION paper, in the
 * same PaperSpec format the analyzer produces.
 *
 * Paper: Ghasemi, Sadraddini & Belta — "Compositional Synthesis for Linear
 * Systems via Convex Optimization of Assume-Guarantee Contracts",
 * preprint submitted to Automatica (2022), arXiv:2208.01701.
 *
 * This is the first sample onboarded AFTER the sections 4 & 5 overhaul, so its
 * Background (foundations) and Model sections are fully GROUNDED: every live
 * demo sits next to the paper's OWN figure (page+bbox crops in public/figs/
 * stab-*.jpg), each plot/equation carries a provenance stamp, and both sections
 * ship an authored narrated explainer. Built to send to the paper's authors.
 *
 * Not live-simulatable end to end (the method is a distributed convex program),
 * so interactivity lives in explorables — the paper's own relations on sliders
 * (the convex potential function, RCI scaling, zonotope containment) and its
 * reported scalability numbers as an interactive chart.
 */

const BASE = (typeof import.meta !== "undefined" && import.meta.env) ? import.meta.env.BASE_URL : "/";
const FIG = (name) => `${BASE}figs/${name}.jpg`;

export const SAMPLE_SPEC_8 = {
  meta: {
    title: "Compositional Synthesis for Linear Systems via Convex Optimization of Assume-Guarantee Contracts",
    authors: "Kasra Ghasemi, Sadra Sadraddini, Calin Belta",
    venue: "Preprint submitted to Automatica (2022) · arXiv:2208.01701",
    abstract:
      "A divide-and-conquer method to design controllers for reachability problems on large-scale linear systems " +
      "with polyhedral constraints on states, controls and disturbances. Couplings between subsystems are treated " +
      "as additional disturbances characterized by assume-guarantee (AG) contracts. Each subsystem synthesizes a " +
      "robust controller locally; a novel zonotope parameterization of contracts, plus a convex potential function " +
      "measuring distance to correct composition, lets subsystems negotiate contracts using gradient information " +
      "from the duals of their local optimization problems. The result is compositional, correct-by-construction " +
      "synthesis that scales to systems with tens of thousands of dimensions, demonstrated on a distributed MPC " +
      "problem in a power network.",
  },

  archetype: {
    kind: "simulation-control",
    pipelineFeasible: false,
    reproductionAdvice:
      "The method is a distributed convex program (linear/semidefinite programs solved with Gurobi), not a " +
      "time-domain dynamical simulation, so there is no single browser pipeline to run. Honest interactivity comes " +
      "from the paper's OWN relations on sliders — the convex piecewise-affine potential function, the robust " +
      "control-invariant set scaling, zonotope containment — and from its reported scalability table as a live " +
      "chart. The set-geometry and power-network result figures stay original crops.",
  },

  story: {
    problem:
      "Controlling a very large machine — a power grid, a fleet, a chemical plant — means keeping thousands of " +
      "coupled variables inside hard safety limits despite disturbances. Solving that as one giant optimization is " +
      "too slow for real time, and wiring every part to one central brain is impractical.",
    gap:
      "Prior work mostly ASSUMED the contracts between subsystems were given in advance, or searched them with " +
      "non-convex, non-scalable methods. Nobody had a way to SYNTHESIZE the contracts themselves that stayed " +
      "convex and distributed as the system grew.",
    contribution: [
      { headline: "Contracts as zonotopes + a convex potential function",
        detail: "A novel parameterization of assume-guarantee contracts as scaled zonotopes, and a potential " +
          "function that scores how far a set of contracts is from 'correct composition' — proven convex and " +
          "piecewise-affine in the contract parameters." },
      { headline: "Distributed negotiation by dual gradients",
        detail: "Because the potential is convex, subsystems descend it together using gradients read straight " +
          "from the duals of their LOCAL synthesis LPs — no central solve, only neighbor-to-neighbor messages." },
      { headline: "Scales to tens of thousands of dimensions",
        detail: "Where a centralized solve times out by ~n=100, the compositional method synthesizes a 10,000-" +
          "dimensional system in ~153 s, and drives a distributed robust-MPC power-network case study." },
    ],
    whyItMatters:
      "It turns a prohibitive, central, one-shot design into many small local designs that TALK — correct by " +
      "construction and scalable — which is what large safety-critical networks actually need.",
  },

  mindmap: {
    nodes: [
      { id: "paper", label: "Convex AG-contract synthesis", kind: "paper",
        detail: "Compositional controller synthesis for large constrained linear systems." },
      { id: "prob", label: "Large coupled systems, hard constraints", kind: "problem",
        detail: "Centralized synthesis is too big and too centralized for real-time large networks." },
      { id: "prior1", label: "AG contracts given a priori", kind: "prior",
        detail: "Most prior work uses contracts as inputs rather than synthesizing them." },
      { id: "prior2", label: "Zonotope / RCI set methods", kind: "prior",
        detail: "Zonotope containment (Sadraddini & Tedrake) and RCI computation via LPs." },
      { id: "m1", label: "Zonotope-parameterized contracts", kind: "method",
        detail: "Guarantee sets = baseline zonotopes with generator columns scaled by parameters α." },
      { id: "m2", label: "Convex potential function", kind: "method",
        detail: "Sum of directed Hausdorff distances; zero ⟺ correct composition; convex piecewise-affine." },
      { id: "m3", label: "Dual-gradient negotiation", kind: "method",
        detail: "Subsystems descend the potential using gradients from their local LP duals." },
      { id: "c1", label: "Convexity theorems", kind: "contribution",
        detail: "Potential function and the correct/valid parameter sets are convex." },
      { id: "c2", label: "Linear-time scalability", kind: "contribution",
        detail: "Up to 10,000 dimensions where centralized methods time out." },
      { id: "res1", label: "Distributed robust MPC in a power grid", kind: "result",
        detail: "Load-frequency control case study reaches its goal set compositionally." },
    ],
    edges: [
      { from: "prob", to: "paper", label: "motivates" },
      { from: "prior1", to: "paper", label: "contrasts with" },
      { from: "prior2", to: "m1", label: "provides tools" },
      { from: "paper", to: "m1", label: "introduces" },
      { from: "m1", to: "m2", label: "scored by" },
      { from: "m2", to: "m3", label: "descended by" },
      { from: "m2", to: "c1", label: "proves" },
      { from: "m3", to: "c2", label: "delivers" },
      { from: "m3", to: "res1", label: "drives" },
    ],
  },

  conceptFigures: [
    {
      title: "FIG. 1 — Correct composition, in one picture",
      image: FIG("stab-fig1"),
      explanation:
        "The whole idea in one diagram, for a 2-D subsystem at one time step. Three nested sets: the admissible " +
        "set X (red) is the true constraint; the guarantee set 𝒳 (blue) is what a subsystem PROMISES to stay " +
        "inside; the viable set Ω (green) is where it can actually be kept under all disturbances. Composition is " +
        "correct when Ω ⊆ 𝒳 ⊆ X for every subsystem and time — the green sits inside the blue sits inside the " +
        "red. The labeled arrow ν_x is the directed Hausdorff distance from the guarantee to the viable set: the " +
        "'how far are we from a valid contract' number the paper's potential function adds up. Drive every such " +
        "arrow to zero and the network's contracts compose correctly.",
    },
    {
      title: "FIG. 3 — Decomposing one big set into local ones",
      image: FIG("stab-fig3"),
      explanation:
        "Case Study 1's payoff, projected onto each subsystem's plane. The green polytopes are the projections of " +
        "the coupled 6-dimensional admissible set; the red polytopes are the decentralized robust-control-invariant " +
        "sets the method computes for the three 2-D subsystems. Every red set sits inside its green set — visual " +
        "proof that the local controllers, designed separately, still respect the global constraint once their " +
        "contracts compose correctly. This is 'divide and conquer' made concrete: three small problems replacing " +
        "one coupled one.",
    },
  ],

  model: {
    approach: "simulation",
    summary:
      "This is a computational control-synthesis study — theorems plus convex programs, validated on numerical " +
      "case studies (no physical experiment). The core objects are ZONOTOPES (centers + generators) used to " +
      "represent every set. Set containment is encoded as linear constraints, so finding a robust controller for " +
      "one subsystem is a linear program. Couplings are folded in as an assumed disturbance governed by an " +
      "assume-guarantee contract; a convex potential function measures how far a whole set of contracts is from " +
      "composing correctly, and subsystems descend it with gradients taken from the duals of their local LPs. " +
      "Everything runs in the authors' Python package (parsi) with Gurobi as the solver.",
    toolchain: [
      { name: "Zonotopes", role: "Every set (states, controls, disturbances, contracts) is a zonotope Z(c,G) — a center c and generator columns G. Affine maps, Minkowski sums and Cartesian products stay zonotopes, which is what keeps the algebra linear (Sec. 2.2, Eqs. 2–5)." },
      { name: "Linear set-containment encoding [36]", role: "Zonotope containment Z(c₁,G₁) ⊆ Z(c₂,G₂) is written as the linear constraints G₁ = G₂Γ, c₂−c₁ = G₂γ, ‖[Γ,γ]‖∞ ≤ 1 (Lemma 1). This turns 'stay inside the constraints' into an LP." },
      { name: "Directed Hausdorff distance (LP)", role: "The distance from one set to another is itself a small linear program (Lemma 3); summed over sets and time it becomes the potential function." },
      { name: "Duality for gradients", role: "The gradient of the potential w.r.t. the contract parameters α is read from the optimal DUAL variables of each subsystem's local LP — so no subsystem needs the global problem to know which way to move (Sec. 6.2)." },
      { name: "Gurobi + parsi (Python)", role: "All linear/semidefinite programs are solved with Gurobi; the implementation is the open-source parsi package (github.com/Kasraghasemi/parsi). Timings were taken on a 2.6 GHz Intel Core i7." },
    ],
    equations: [
      {
        name: "Viable set (Theorem 1)",
        eq: "[AₜTₜ + BₜMₜ, Gᵈₜ] = Tₜ₊₁,   Z(x̄ₜ, Tₜ) ⊆ Xₜ,   Z(ūₜ, Mₜ) ⊆ Uₜ",
        source: "Theorem 1, Eqs. (17)–(18), Sec. 4.2",
        provenance: { equation: "Eqs. (17)–(18)", section: "Sec. 4.2", figure: "FIG. 3" },
        figure: {
          image: FIG("stab-fig3"),
          label: "FIG. 3 — the viable (red) sets these constraints produce",
          caption: "Solving this LP for each subsystem yields the decentralized robust sets Ω = Z(x̄,T) — the red sets in Fig. 3, each inside its admissible green set.",
        },
        plain:
          "A control policy μₜ(x) = ūₜ + Mₜζ keeps the state inside the zonotope Z(x̄ₜ,Tₜ) for the whole horizon. " +
          "The first equation propagates the generator matrix forward in time; the two containments say the state " +
          "and control sets never leave their constraints. Because containment is linear (Lemma 1), the whole " +
          "thing is a linear program — the atom every subsystem solves locally.",
        terms: [
          { sym: "Z(c, G)", meaning: "a zonotope: center c plus generator columns G — the set c ⊕ G·B (B the unit box)" },
          { sym: "Tₜ, Mₜ", meaning: "generator matrices of the viable state set Ωₜ and action set Θₜ" },
          { sym: "Gᵈₜ", meaning: "generators of the disturbance zonotope Dₜ — the uncertainty the controller must absorb" },
          { sym: "μₜ(x)", meaning: "the resulting feedback controller, affine in the normalized coordinates ζ" },
        ],
      },
      {
        name: "Potential function (correctness distance)",
        eq: "V(𝒞) = Σᵢ Vᵢ,   Vᵢ = Σₜ d_DH(𝒳ᵢ,ₜ, Ωᵢ,ₜ) + Σₜ d_DH(𝒰ᵢ,ₜ, Θᵢ,ₜ)",
        source: "Definition 7, Eqs. (33)–(34), Sec. 5.1",
        provenance: { equation: "Eqs. (33)–(34)", section: "Sec. 5.1", figure: "FIG. 1" },
        figure: {
          image: FIG("stab-fig1"),
          label: "FIG. 1 — each d_DH is one arrow",
          caption: "Every directed-Hausdorff term is the ν_x arrow in Fig. 1; the potential sums them over all subsystems and time steps.",
        },
        plain:
          "How far is a whole set of contracts from being consistent? Add up the directed Hausdorff distances " +
          "between each guarantee set and the viable set it must contain (and the same in control space). The " +
          "potential is zero if and only if every containment holds — i.e. the contracts compose correctly. It " +
          "turns a yes/no correctness question into a smooth-enough number you can minimize.",
        terms: [
          { sym: "d_DH(S₁, S₂)", meaning: "directed Hausdorff distance — how far S₂ pokes outside S₁; itself a small LP (Lemma 3)" },
          { sym: "𝒳ᵢ,ₜ, 𝒰ᵢ,ₜ", meaning: "the guarantee sets subsystem i promises in state and control space" },
          { sym: "Ωᵢ,ₜ, Θᵢ,ₜ", meaning: "the viable set and action set actually achievable under the assumed disturbance" },
          { sym: "V = 0", meaning: "correct composition: every subsystem's promise contains what it can deliver" },
        ],
      },
      {
        name: "Parametric contracts & convexity (Theorem 3)",
        eq: "𝒳ᵢ,ₜ(αᵢ,ₜ) = Z(c̄, C̄·Diag(αᵢ,ₜ)),   V(α) convex & piecewise-affine",
        source: "Eqs. (35)–(37) + Theorem 3, Sec. 5",
        provenance: { equation: "Eqs. (35)–(37)", section: "Sec. 5.3", figure: "FIG. 4" },
        figure: {
          image: FIG("stab-fig4"),
          label: "FIG. 4 [right] — the convex potential surface",
          caption: "Plotting V against two parameters gives exactly this convex, piecewise-affine bowl; its flat zero floor is the correct-parameter set.",
        },
        plain:
          "To SEARCH over contracts, scale each generator column of a baseline zonotope by a non-negative parameter " +
          "α. The potential function, now a function of α, is proven CONVEX and piecewise-affine (Theorem 3), and " +
          "the set of α giving correct composition is convex too. That convexity is the whole paper's engine: it " +
          "means local gradient steps can't get stuck in a bad local optimum.",
        terms: [
          { sym: "α", meaning: "the contract parameters — non-negative scalings of the baseline generators; the search variables" },
          { sym: "C̄·Diag(α)", meaning: "scaling each generator column of the baseline set independently" },
          { sym: "convex PWA", meaning: "convex and piecewise-affine — a bowl made of flat facets; the shape you see in Fig. 4[right]" },
          { sym: "level set V=0", meaning: "the flat floor of the bowl = the convex set of correct parameters" },
        ],
      },
      {
        name: "Distributed gradient negotiation",
        eq: "α ← α − δ·∇_α V,    ∇_α Vᵢ  from the optimal DUALs of subsystem i's local LP",
        source: "Eq. (44), Sec. 6.2",
        provenance: { equation: "Eq. (44)", section: "Sec. 6.2", figure: "FIG. 4" },
        figure: {
          image: FIG("stab-fig4"),
          label: "FIG. 4 [left] — the negotiation path",
          caption: "The blue trajectory is this update in action: from random parameters, the arrows (per-subsystem gradients) steer α into the green correct-composition set.",
        },
        plain:
          "Each subsystem solves its own small LP, reads the gradient of the potential from that LP's dual " +
          "variables, and takes a step. Summing the per-subsystem gradients and stepping with size δ walks the " +
          "parameters downhill to V = 0 — the correct composition. Because the landscape is convex, this local, " +
          "message-passing negotiation converges without any central coordinator.",
        terms: [
          { sym: "δ", meaning: "the gradient step size" },
          { sym: "∇_α Vᵢ", meaning: "subsystem i's preferred direction — the gradient computed from its LP duals" },
          { sym: "dual variables", meaning: "the Lagrange multipliers of the local synthesis LP, which encode the sensitivity used as the gradient" },
        ],
      },
    ],
    assumptions: [
      "Linear discrete-time subsystem dynamics xₜ₊₁ = Aₜxₜ + Bₜuₜ + dₜ, with polytopic (zonotopic) state, control and disturbance sets given in advance.",
      "Couplings between subsystems are treated as bounded additive disturbances — an over-approximation that decouples the local problems.",
      "The conservative correctness criterion Ωᵢ,ₜ ⊆ 𝒳ᵢ,ₜ, Θᵢ,ₜ ⊆ 𝒰ᵢ,ₜ is used (it implies true composition correctness but can be stricter).",
      "Contracts are common knowledge among subsystems so each can compute its assumed disturbance; controllers use only local information online.",
      "Zonotope order reduction (Boxing) is applied to keep the LP sizes bounded, at the cost of some conservativeness.",
    ],
    validation:
      "The method reduces to standard centralized RCI/viable-set computation when couplings vanish, reproducing " +
      "known results. Case Study 3 benchmarks it against a centralized solve (Cen) and a decentralized-from-" +
      "centralized solve (DecCen): the centralized method times out around n = 100, while the compositional method " +
      "scales to n = 10,000 in ~153 s. Case Study 4 validates it end to end on a distributed robust-MPC load-" +
      "frequency problem in a four-area power network, where every subsystem's viable sets reach the goal set.",
    takeaways: [
      "Represent every set as a zonotope, and 'stay inside the constraints' becomes a linear program.",
      "A convex potential function turns 'do these contracts compose correctly?' into a number you can minimize.",
      "Convexity lets subsystems negotiate contracts with purely local dual-gradient steps — no central solver — and still reach the global optimum.",
    ],
    glossary: [
      { sym: "Z(c, G)", meaning: "zonotope — center c ⊕ generator matrix G times the unit box; closed under affine maps and Minkowski sums" },
      { sym: "RCI set", meaning: "robust control-invariant set — states that can be kept inside forever under all disturbances (Theorem 2)" },
      { sym: "AG contract", meaning: "assume-guarantee contract (A,G): the disturbances a subsystem assumes, and the state/control sets it guarantees" },
      { sym: "d_DH", meaning: "directed Hausdorff distance — the correctness residual summed into the potential function" },
      { sym: "correct composition", meaning: "every subsystem's actual disturbance stays within its assumed disturbance — no circular mismatch" },
    ],
    material: [
      { label: "arXiv:2208.01701", url: "https://arxiv.org/abs/2208.01701" },
      { label: "parsi (source code, GitHub)", url: "https://github.com/Kasraghasemi/parsi" },
    ],
  },

  explainer: {
    foundations: {
      voice: "onyx",
      scenes: [
        { caption: "The background this paper builds on", narration:
          "Four ideas set up the method: zonotopes as computable sets, assume-guarantee contracts, robust invariant sets, and the Hausdorff distance that measures correctness. Each is tied to a real figure from the paper.",
          visual: { type: "intro" } },
        { caption: "1 — Zonotopes: sets you can compute with", narration:
          "A zonotope is a center plus a few generator vectors. Add them, scale them, push them through a matrix — the result is still a zonotope. That closure is why the whole method stays linear instead of exploding in complexity.",
          visual: { type: "demo", foundationIdx: 0 } },
        { caption: "2 — Assume-guarantee contracts", narration:
          "Split a big coupled system into parts. Each part ASSUMES a bound on the disturbance its neighbors create, and GUARANTEES to stay in a set. The catch is circularity: my guarantee changes your assumption. Breaking that loop is the problem.",
          visual: { type: "demo", foundationIdx: 1 } },
        { caption: "3 — Robust control-invariant sets", narration:
          "A robust control-invariant set is one you can stay inside forever, no matter the disturbance. Fig. 3 shows the red invariant sets the method computes, each tucked inside the true green constraint.",
          visual: { type: "figure", image: FIG("stab-fig3"), label: "FIG. 3 — RCI sets (red) inside constraints (green)", foundationIdx: 2 } },
        { caption: "4 — Directed Hausdorff distance", narration:
          "How far is a contract from valid? The directed Hausdorff distance — the arrow in Fig. 1 — measures how far the achievable set pokes outside the promised set. Sum those arrows and you get the potential function.",
          visual: { type: "figure", image: FIG("stab-fig1"), label: "FIG. 1 — the ν_x correctness arrow", foundationIdx: 3 } },
      ],
    },
    model: {
      voice: "onyx",
      scenes: [
        { caption: "What the paper actually did", narration:
          "This is a computational study: theorems plus convex programs, checked on numerical case studies. Every set is a zonotope, every containment is a linear program, and the couplings are handled by contracts. Let's read the four key relations.",
          visual: { type: "intro" } },
        { caption: "Theorem 1 — the viable set", narration:
          "For one subsystem, a linear program finds a zonotope the state can be kept inside for the whole horizon, together with the controller that does it. Fig. 3's red sets are exactly these viable sets.",
          visual: { type: "equation", equationIdx: 0 } },
        { caption: "The potential function", narration:
          "Add up the directed Hausdorff distances between what each subsystem promises and what it can deliver. The potential is zero exactly when all the contracts compose correctly — correctness becomes a single number.",
          visual: { type: "equation", equationIdx: 1 } },
        { caption: "Convexity — Theorem 3", narration:
          "Scale the contract generators by parameters alpha, and the potential becomes a convex, piecewise-affine bowl — the surface you see in Fig. 4. The flat floor is the set of correct parameters. Convexity means no bad local minima.",
          visual: { type: "equation", equationIdx: 2 } },
        { caption: "Distributed negotiation", narration:
          "Each subsystem reads the gradient from its own linear program's dual variables and takes a step downhill. The blue path in Fig. 4 shows random parameters walking into the correct set — no central solver, just neighbors talking.",
          visual: { type: "equation", equationIdx: 3 } },
        { caption: "How it was checked", narration:
          "It reduces to the centralized result when couplings vanish, scales to ten thousand dimensions where the centralized solve times out, and drives a four-area power-grid MPC case study to its goal.",
          visual: { type: "validation" } },
      ],
    },
  },

  foundations: [
    {
      title: "Zonotopes: sets you can compute with",
      source: "Zonotope algebra (Sec. 2.2, Eqs. 2–5)",
      provenance: { equation: "Eqs. (2)–(5)", section: "Sec. 2.2" },
      takeaways: [
        "A zonotope Z(c,G) = center c plus generator columns G — a box stretched along the generator directions.",
        "Affine maps, Minkowski sums and Cartesian products of zonotopes are again zonotopes — closure keeps the math linear.",
        "Order reduction (Boxing) over-approximates a zonotope by a hyper-box to keep problem sizes bounded.",
      ],
      concept:
        "A zonotope is one of the most convenient set shapes in control. Take a center point c and a handful of " +
        "generator vectors (the columns of a matrix G); the zonotope is everything you reach by adding each " +
        "generator scaled between −1 and +1. Two generators make a parallelogram, three a squashed hexagon, and so " +
        "on. The magic is closure: apply a linear map, add two zonotopes (Minkowski sum), or stack them (Cartesian " +
        "product), and you always get another zonotope with easy-to-write center and generators. That is why the " +
        "whole paper can turn set operations into plain linear algebra.",
      equation: "Z(c, G) = c ⊕ G·B  (B the unit box);   A·Z(c,G)+b = Z(Ac+b, AG)",
      whyItMatters:
        "Every set in the paper — states, controls, disturbances, and the contracts themselves — is a zonotope, so " +
        "'design a controller' reduces to linear constraints instead of intractable set arithmetic.",
      demo: {
        kind: "chart", chartKind: "line", T: 1, dt: 1,
        xLabel: "generator index i", yLabel: "half-width contributed |gᵢ| (state units)",
        caption: "scale the generators — the boxed over-approximation width is Σ|gᵢ|",
        provenance: { equation: "Eqs. (4)–(5)", section: "Sec. 2.2" },
        params: [
          { key: "scale", sym: "s", label: "generator scale s", min: 0.2, max: 2.5, step: 0.05, def: 1.0, animate: true },
        ],
        computeJs: `
const g = [1.0, 0.7, 0.45, 0.6, 0.3, 0.5];
const x = [], per = [], cum = [];
let acc = 0;
for (let i = 0; i < g.length; i++) {
  const w = params.scale * g[i];
  acc += w;
  x.push(i + 1);
  per.push(+w.toFixed(3));
  cum.push(+acc.toFixed(3));
}
return { x, series: [
  { label: "this generator |s·gᵢ|", data: per },
  { label: "boxed half-width Σ|s·gᵢ| (order-1 over-approx)", data: cum },
] };`,
        insightJs: `
const g = [1.0, 0.7, 0.45, 0.6, 0.3, 0.5];
const tot = g.reduce((a,b)=>a+b,0) * params.scale;
return "At scale s = " + params.scale.toFixed(2) + ", the Boxing over-approximation has half-width Σ|gᵢ| = " +
  tot.toFixed(2) + " — this hyper-box (Eq. 4) is the cheap set the method carries when it reduces zonotope order.";`,
      },
    },
    {
      title: "Assume-guarantee contracts & the circularity problem",
      source: "AG contracts (Sec. 4, Definition 3; coupling Eq. 28)",
      provenance: { equation: "Eqs. (28)–(31)", section: "Sec. 5.1" },
      takeaways: [
        "A contract (A,G): the disturbance a subsystem ASSUMES from neighbors, and the sets it GUARANTEES to keep.",
        "Couplings are folded into an 'augmented disturbance' so each subsystem looks decoupled.",
        "Circularity: my guarantee feeds your assumption — correct composition means no subsystem exceeds what neighbors assumed.",
      ],
      concept:
        "To break a coupled network into independent pieces, each subsystem treats the influence of its neighbors " +
        "as an extra disturbance and signs a contract: it ASSUMES that disturbance stays in some set, and " +
        "GUARANTEES in return that its own states and controls stay in promised sets. The difficulty is " +
        "circular: the disturbance you assume depends on the sets your neighbors guarantee, which depend on what " +
        "they assume about you. Composition is 'correct' when the loop closes — every subsystem's actual " +
        "disturbance really does fall inside what its neighbors assumed. Finding contracts that close the loop is " +
        "the heart of the paper.",
      equation: "dᵃᵘᵍᵢ,ₜ = Σⱼ≠ᵢ Aᵢⱼ xⱼ,ₜ + Σⱼ≠ᵢ Bᵢⱼ uⱼ,ₜ + dᵢ,ₜ ;   correct ⇔ Dᵃᵘᵍᵢ,ₜ ⊆ Wᵢ,ₜ",
      whyItMatters:
        "This is the decomposition that makes everything scale — but only once the circular assumptions are made " +
        "consistent, which the potential function and its convexity finally enable.",
      demo: {
        kind: "chart", chartKind: "line", T: 1, dt: 1,
        xLabel: "negotiation round k", yLabel: "disturbance half-width (state units)",
        caption: "raise the coupling — watch assumed vs actual disturbance converge (or not)",
        provenance: { equation: "Eqs. (29)–(31)", section: "Sec. 5.1" },
        params: [
          { key: "lam", sym: "λ", label: "coupling strength λ", min: 0.0, max: 0.9, step: 0.02, def: 0.4, animate: true },
        ],
        computeJs: `
const x = [], assumed = [], actual = [];
let a = 2.0;
for (let k = 0; k <= 20; k++) {
  const d = 0.5 + params.lam * a;      // actual augmented disturbance grows with coupling
  x.push(k);
  assumed.push(+a.toFixed(3));
  actual.push(+d.toFixed(3));
  a = 0.6 * a + 0.4 * d;               // neighbors update their assumption toward the actual
}
return { x, series: [
  { label: "assumed disturbance Wᵢ", data: assumed },
  { label: "actual disturbance Dᵃᵘᵍᵢ", data: actual },
] };`,
        insightJs: `
const fixed = 0.5 / (1 - 0.4 * params.lam / (1 - 0.6 + 0.4)); // rough fixed point indicator
return "At coupling λ = " + params.lam.toFixed(2) + ", the assumed and actual disturbances " +
  (params.lam < 0.75 ? "settle onto a common value — the contract can compose correctly." :
   "keep chasing each other — strong coupling makes correct composition harder and needs more negotiation rounds.");`,
      },
    },
    {
      title: "Robust control-invariant (RCI) sets",
      source: "Infinite-horizon satisfiability (Sec. 4.3, Theorem 2, Eq. 23)",
      provenance: { equation: "Eqs. (23)–(24)", section: "Sec. 4.3", figure: "FIG. 3" },
      figure: {
        image: FIG("stab-fig3"),
        label: "FIG. 3 — RCI sets (red) inside admissible sets (green)",
        caption: "The decentralized RCI sets the method computes (red) sit inside each subsystem's admissible set (green) — invariance and constraint-satisfaction at once.",
      },
      takeaways: [
        "An RCI set is a region you can be kept inside forever under every allowed disturbance.",
        "Theorem 2 finds one as a zonotope via a linear program, with a contraction factor β ∈ [0,1).",
        "The set scales like 1/(1−β): as β→1 the invariant set (and the required control effort) blows up.",
      ],
      concept:
        "For safety you often want more than a finite plan — you want a region the system can stay inside " +
        "indefinitely no matter what the disturbance does. That is a robust control-invariant (RCI) set: from any " +
        "point inside it, a control exists that keeps the next state inside too. The paper computes one as a " +
        "zonotope Ω = Z(x̄, (1−β)⁻¹T) using a linear program, where β in [0,1) is a contraction factor. Smaller β " +
        "gives a tighter, cheaper set; as β approaches 1 the set — and the control authority it demands — grows " +
        "without bound.",
      equation: "[AT + BM, Gᵈ] = [E, T];   Z(0,E) ⊆ Z(0, βGᵈ);   Ω = Z(x̄, (1−β)⁻¹ T)",
      whyItMatters:
        "RCI sets are the guarantee sets each subsystem promises in the infinite-horizon problem; their size " +
        "trade-off (via β) is exactly what the contract parameters negotiate.",
      demo: {
        kind: "chart", chartKind: "line", T: 1, dt: 1,
        xLabel: "contraction factor β", yLabel: "RCI half-width  |Gᵈ|·(1−β)⁻¹ (state units)",
        caption: "sweep the disturbance size — the invariant set scales as 1/(1−β)",
        provenance: { equation: "Eq. (24)", section: "Sec. 4.3" },
        params: [
          { key: "gd", sym: "|Gᵈ|", label: "disturbance half-width |Gᵈ|", min: 0.1, max: 1.5, step: 0.05, def: 0.3, animate: true },
        ],
        computeJs: `
const x = [], size = [];
for (let b = 0; b <= 0.92001; b += 0.02) {
  x.push(+b.toFixed(2));
  size.push(+(params.gd / (1 - b)).toFixed(3));
}
return { x, series: [ { label: "RCI set half-width", data: size } ] };`,
        insightJs: `
const at07 = params.gd / (1 - 0.7);
return "With disturbance |Gᵈ| = " + params.gd.toFixed(2) + ", a contraction β = 0.7 needs an invariant set of " +
  "half-width " + at07.toFixed(2) + " — and the size diverges as β → 1. Bigger disturbances demand bigger promised sets.";`,
      },
    },
    {
      title: "Directed Hausdorff distance = distance from correct",
      source: "Directed Hausdorff LP (Lemma 3, Eq. 8) → potential (Eq. 34)",
      provenance: { equation: "Eq. (8), Eq. (34)", section: "Sec. 5.1", figure: "FIG. 1" },
      figure: {
        image: FIG("stab-fig1"),
        label: "FIG. 1 — ν_x is the directed Hausdorff distance",
        caption: "The labeled ν_x arrow from the viable set (green) to the guarantee set (blue) IS one directed-Hausdorff term; the potential adds them over all subsystems and times.",
      },
      takeaways: [
        "Directed Hausdorff distance d_DH(S₁,S₂) = how far S₂ pokes outside S₁ — computed by a small LP (Lemma 3).",
        "Summed over guarantee-vs-viable sets it is the potential function V; V = 0 ⇔ correct composition.",
        "It converts a hard yes/no correctness test into a minimizable quantity.",
      ],
      concept:
        "To steer contracts toward consistency you need to know not just WHETHER a set sits inside another, but by " +
        "HOW MUCH it fails. The directed Hausdorff distance answers that: the smallest amount you would have to " +
        "inflate S₁ so that it swallows S₂. It is computed by a single linear program (Lemma 3). Summed over " +
        "every guarantee-versus-viable pair and every time step, it becomes the paper's potential function — zero " +
        "exactly when all containments hold. That single number is what the negotiation drives to zero.",
      equation: "d_DH(S₁,S₂) = min{ d ≥ 0 : S₂ ⊆ S₁ ⊕ d·Z(0,I) }",
      whyItMatters:
        "Turning correctness into a distance is what makes the whole problem an OPTIMIZATION — and the next step " +
        "shows that optimization is convex.",
      demo: {
        kind: "chart", chartKind: "line", T: 1, dt: 1,
        xLabel: "time step t", yLabel: "correctness residual  d_DH (state units)",
        caption: "grow the guarantee set — the residual (and the potential) collapses to zero",
        provenance: { equation: "Eq. (34)", section: "Sec. 5.1" },
        params: [
          { key: "guar", sym: "α·|𝒳|", label: "guarantee-set half-width (scaled by α)", min: 0.5, max: 2.0, step: 0.05, def: 1.0, animate: true },
        ],
        computeJs: `
const omega = [1.2, 1.35, 1.1, 1.45, 1.25, 1.3];  // viable-set half-widths over time
const x = [], dh = [];
for (let t = 0; t < omega.length; t++) {
  x.push(t);
  dh.push(+Math.max(0, omega[t] - params.guar).toFixed(3));  // pokes out only if Ω > 𝒳
}
return { x, series: [ { label: "d_DH(𝒳ₜ, Ωₜ) — one potential term", data: dh } ] };`,
        insightJs: `
const omega = [1.2, 1.35, 1.1, 1.45, 1.25, 1.3];
const V = omega.reduce((a,o)=>a+Math.max(0,o-params.guar),0);
const need = Math.max.apply(null, omega);
return "Potential V = Σ d_DH = " + V.toFixed(2) + ". It hits zero once the guarantee half-width reaches " +
  need.toFixed(2) + " (the largest viable set) — that α is exactly a correct contract parameter.";`,
      },
    },
  ],

  explorables: [
    {
      title: "The convex potential function, live",
      basis: "equation",
      story:
        "The potential function V(α) is convex and piecewise-affine (Theorem 3). Widen the contract (raise the " +
        "parameter window) and watch the V-shaped valley open a FLAT ZERO FLOOR — that interval of α is the " +
        "correct-composition set the subsystems negotiate toward. This is the 1-D slice of Fig. 4[right].",
      source: "Eqs. (35)–(37), Theorem 3; Fig. 4[right]",
      demo: {
        kind: "chart", chartKind: "line", T: 1, dt: 1,
        xLabel: "contract parameter α₁", yLabel: "potential V(α) (correctness residual)",
        caption: "widen the contract — the convex valley grows a flat V = 0 floor (the correct set)",
        params: [
          { key: "width", sym: "w", label: "contract window width", min: 0.05, max: 0.6, step: 0.01, def: 0.2, animate: true },
          { key: "slope", sym: "s", label: "penalty slope", min: 0.8, max: 3.0, step: 0.1, def: 1.6 },
        ],
        computeJs: `
const lo = 1.35 - params.width, hi = 1.35 + params.width;
const x = [], V = [];
for (let a = 1.0; a <= 1.8001; a += 0.02) {
  x.push(+a.toFixed(2));
  V.push(+Math.max(0, params.slope * (lo - a), params.slope * (a - hi)).toFixed(3));
}
return { x, series: [ { label: "V(α₁) — convex, piecewise-affine", data: V } ] };`,
        insightJs: `
return "The valley is flat (V = 0) on α₁ ∈ [" + (1.35 - params.width).toFixed(2) + ", " +
  (1.35 + params.width).toFixed(2) + "] — a convex interval of CORRECT parameters. Convexity (Theorem 3) is why " +
  "local gradient steps always reach this floor without getting stuck.";`,
      },
    },
    {
      title: "Scalability: compositional vs centralized",
      basis: "reported",
      story:
        "The paper's Table 1 (Case Study 3), as a chart. Average synthesis time versus system dimension n for the " +
        "compositional method. The centralized solver (Cen) times out by n ≈ 100 and the decentralized-from-" +
        "centralized solver (DecCen) blows up by n = 500; the compositional method reaches n = 10,000 in ~153 s.",
      source: "Table 1, Case Study 3 (reported values)",
      demo: {
        kind: "chart", chartKind: "bar", T: 1, dt: 1,
        xLabel: "system dimension n", yLabel: "compositional synthesis time (s)",
        caption: "the paper's reported compositional-method times, straight from Table 1",
        params: [],
        computeJs: `
const n = [10, 20, 30, 50, 100, 200, 500, 1000, 10000];
const compose = [0.03, 0.05, 0.24, 0.56, 1.66, 6.46, 10.63, 12.40, 153.00];
return {
  categories: n.map(String),
  series: [ { label: "Compose time (s)", data: compose } ],
};`,
      },
    },
  ],

  protocol: {
    T: 1, dt: 1,
    description:
      "This paper's method is a distributed convex program, not a time-domain simulation, so there is no live " +
      "pipeline to sweep. Interactivity lives in the explorables (the convex potential function and reported " +
      "scalability) and in the grounded foundation demos.",
  },
  blocks: [],

  resultFigures: [
    {
      figureLabel: "FIG. 4",
      page: 13,
      bbox: { x: 0.055, y: 0.085, w: 0.430, h: 0.170 },
      image: FIG("stab-fig4"),
      title: "Case Study 1 — the convex potential and the negotiation path",
      explanation:
        "The paper's headline picture, in two panels. [Left] The green polytope is the projection of the CORRECT " +
        "set of contract parameters onto a plane of two parameters α₁[1]–α₁[2]; inside it every contract composes " +
        "correctly (potential = 0). The blue trajectory starts from random parameters and walks into the green set " +
        "using the compositional negotiation; the three black arrows are the three subsystems' preferred gradient " +
        "directions at the start point. [Right] The same potential function plotted as a surface over those two " +
        "parameters — a convex, piecewise-affine bowl whose flat zero floor is exactly the green set on the left. " +
        "Together they show the whole method: a convex landscape, descended by local dual gradients, reaching " +
        "correct composition.",
      hotspots: [
        { x: 0.18, y: 0.28, label: "Correct set (V=0)", note: "Green polytope: contracts here compose correctly." },
        { x: 0.30, y: 0.72, label: "Negotiation path", note: "Blue trajectory from random parameters into the correct set." },
        { x: 0.78, y: 0.45, label: "Convex bowl", note: "The potential surface — piecewise-affine and convex (Theorem 3)." },
      ],
      panels: [],
    },
    {
      figureLabel: "FIG. 6",
      page: 14,
      bbox: { x: 0.485, y: 0.075, w: 0.455, h: 0.265 },
      image: FIG("stab-fig6"),
      title: "Case Study 4 — distributed robust MPC in a power network",
      explanation:
        "The method driving a real control problem: load-frequency control across a four-area power network, each " +
        "area a subsystem with state (phase-angle deviation Δδ, frequency deviation Δf) and its generator power as " +
        "control. For each area the blue set is the GOAL set and the green sequence is the computed viable sets; " +
        "the red dashed line links the viable-set centers — the nominal predicted trajectory from the initial " +
        "state. In every subsystem the final viable set lands inside its goal set, so the decentralized " +
        "controllers, negotiated compositionally, robustly steer the whole grid to its target under load " +
        "disturbances — a distributed robust MPC with a recursive-feasibility guarantee.",
      hotspots: [
        { x: 0.2, y: 0.3, label: "Goal set", note: "Blue: where each area must end up (|Δδ|,|Δf| ≤ 0.01)." },
        { x: 0.5, y: 0.5, label: "Viable-set sequence", note: "Green: the horizon-5 robust sets the controller stays in." },
        { x: 0.35, y: 0.6, label: "Nominal trajectory", note: "Red dashed line through the viable-set centers." },
      ],
      panels: [],
    },
  ],

  conclusion:
    "The paper delivers a convex parameterization of assume-guarantee contracts that makes compositional, correct-" +
    "by-construction control synthesis of large constrained linear systems both distributed and scalable. By " +
    "representing sets as zonotopes, encoding containment as linear programs, and measuring distance-to-correct-" +
    "composition with a provably convex, piecewise-affine potential function, subsystems can negotiate their " +
    "contracts using only local dual-gradient information — no central solver. The method achieves near-linear " +
    "scaling (up to 10,000 dimensions where centralized methods time out) and drives a distributed robust-MPC " +
    "power-network case study to its goal. Future work targets nonlinear and partially-unknown dynamics, " +
    "probabilistic contracts, and parallel multi-core acceleration.",

  references: [
    "Sadraddini, S. & Tedrake, R. Linear encodings for polytope containment problems. IEEE CDC (2019) — zonotope containment, Lemma 1.",
    "Ghasemi, K., Sadraddini, S. & Belta, C. Compositional synthesis via convex optimization of assume-guarantee contracts. arXiv:2208.01701 (2022); code: github.com/Kasraghasemi/parsi.",
    "Nilsson, P. & Ozay, N. Synthesis of separable controlled invariant sets for modular local control design. ACC (2016) — random interconnected-LTI benchmark (Case Study 3).",
    "Venkat, A. N. et al. Distributed MPC strategies with application to power system automatic generation control. IEEE T-CST (2008) — load-frequency control model (Case Study 4).",
    "Benveniste, A. et al. Contracts for system design. Foundations and Trends in EDA (2018) — assume-guarantee reasoning.",
  ],
};
