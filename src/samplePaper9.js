/**
 * Ninth bundled sample — an ENERGY-SYSTEMS PLANNING / OPTIMIZATION paper, in
 * the same PaperSpec format the analyzer produces.
 *
 * Paper: Khorramfar, Santoni-Colvin, Amin, Norford, Botterud & Mallapragada —
 * "Cost-effective planning of decarbonized power-gas infrastructure to meet the
 * challenges of heating electrification", Cell Reports Sustainability 2, 100307
 * (2025). https://doi.org/10.1016/j.crsus.2025.100307
 *
 * Carries the full sections 4 & 5 treatment: grounded Background & Model
 * sections (each live chart sits next to the paper's OWN figure crop, with a
 * provenance stamp), a narrated explainer, a learn layer, and — because this
 * paper is DATA-rich — the headline figures reproduced point-for-point as
 * interactive digitized charts (Fig. 3A demand, Fig. 3B peak, Fig. 5D cost),
 * traced off the real figures. Figures cropped to public/figs/cost-*.jpg.
 */

const BASE = (typeof import.meta !== "undefined" && import.meta.env) ? import.meta.env.BASE_URL : "/";
const FIG = (name) => `${BASE}figs/${name}.jpg`;

/* scenario axis shared by most of the paper's figures */
const SCEN = ["RF", "ME", "MX", "HE", "HX"];
const SCEN6 = ["Present-day", "RF", "ME", "MX", "HE", "HX"];

export const SAMPLE_SPEC_9 = {
  meta: {
    title: "Cost-effective planning of decarbonized power-gas infrastructure to meet the challenges of heating electrification",
    authors: "R. Khorramfar, M. Santoni-Colvin, S. Amin, L. K. Norford, A. Botterud, D. Mallapragada",
    venue: "Cell Reports Sustainability 2, 100307 (2025)",
    abstract:
      "Building heat electrification is central to economy-wide decarbonization but reshapes energy infrastructure " +
      "by raising electricity and cutting gas demand. The authors build a two-module framework: a bottom-up model " +
      "that projects residential end-use power and gas demand across electrification pathways, feeding a co-" +
      "optimized bulk power-gas investment/operations model (JPoNG) under deep-decarbonization limits. Applied to " +
      "US New England in 2050 across 20 weather years, high residential electrification raises peak and total " +
      "electricity demand by 56–158% and 41–59%; adding building-envelope improvements cuts peak magnitude and " +
      "duration and yields 21–29% lower system cost than low electrification. The study underscores joint power-" +
      "gas planning for cold-climate regions, with renewables, storage, transmission and low-carbon firm power " +
      "carrying the decarbonized supply.",
  },

  archetype: {
    kind: "statistical-data",
    pipelineFeasible: false,
    reproductionAdvice:
      "The results come from a large co-optimization (a MILP capacity-expansion model, JPoNG) solved over 20 " +
      "weather years — not a browser-runnable simulation. Honest interactivity is the paper's OWN reported numbers " +
      "made interactive: annual demand, peak demand and system cost per electrification scenario, each traced off " +
      "its figure. The framework and map figures stay original crops.",
  },

  story: {
    problem:
      "To cut carbon, we are swapping gas furnaces for electric heat pumps in millions of homes. But in a cold " +
      "region like New England, that shifts a huge winter heating load onto the electric grid — right when it is " +
      "coldest and solar is weakest — while the gas system it leans on shrinks.",
    gap:
      "Most planning studies look at power OR gas, and treat demand as fixed. Nobody had co-optimized the two " +
      "coupled systems while also modeling how different electrification pathways (and building insulation) " +
      "actually reshape the demand they must serve.",
    contribution: [
      { headline: "A two-module bottom-up + co-optimization framework",
        detail: "A bottom-up residential model projects hourly power and gas demand for each electrification " +
          "pathway, feeding a joint power-and-gas capacity-expansion model (JPoNG) that invests and operates both " +
          "systems together under an emissions cap." },
      { headline: "Electrification can spike winter peak by up to 158%",
        detail: "High residential electrification raises peak electricity demand 56–158% and total 41–59% vs " +
          "business-as-usual, turning New England into a winter-peaking system." },
      { headline: "Envelope improvement is the cheapest lever",
        detail: "Adding insulation/air-sealing with high electrification cuts peak magnitude and duration and " +
          "delivers 21–29% lower total power-gas system cost than the low-electrification scenario." },
    ],
    whyItMatters:
      "It shows planners the least-cost path to decarbonized heat is aggressive electrification PLUS building " +
      "efficiency, planned across power and gas together — not either system alone.",
  },

  mindmap: {
    nodes: [
      { id: "paper", label: "Co-optimized power-gas planning", kind: "paper", detail: "Least-cost decarbonized infrastructure under heating electrification." },
      { id: "prob", label: "Electrified heat spikes winter load", kind: "problem", detail: "Heat pumps move a huge winter load onto a cold-weather grid." },
      { id: "prior1", label: "Power-only or gas-only planning", kind: "prior", detail: "Prior studies rarely co-optimize the two coupled systems." },
      { id: "prior2", label: "Fixed-demand capacity expansion", kind: "prior", detail: "Demand usually taken as given, not shaped by electrification pathway." },
      { id: "m1", label: "Bottom-up residential demand model", kind: "method", detail: "Projects hourly power+gas demand per electrification scenario and weather year." },
      { id: "m2", label: "JPoNG co-optimization", kind: "method", detail: "Joint power-gas investment/operation minimizing cost under an emissions cap." },
      { id: "m3", label: "Building-envelope measures", kind: "method", detail: "Insulation/air-sealing that lowers peak magnitude and duration." },
      { id: "c1", label: "Peak +56–158%, total +41–59%", kind: "contribution", detail: "Quantified demand impact of high electrification." },
      { id: "c2", label: "21–29% lower system cost", kind: "contribution", detail: "High electrification + envelope is the least-cost decarbonized path." },
      { id: "res1", label: "VRE + storage + firm + transmission", kind: "result", detail: "Renewables dominate supply; storage, transmission and low-carbon firm power fill gaps." },
    ],
    edges: [
      { from: "prob", to: "paper", label: "motivates" },
      { from: "prior1", to: "paper", label: "contrasts with" },
      { from: "prior2", to: "m1", label: "improved by" },
      { from: "m1", to: "m2", label: "feeds" },
      { from: "m3", to: "m2", label: "reduces load into" },
      { from: "m2", to: "c1", label: "quantifies" },
      { from: "m2", to: "c2", label: "delivers" },
      { from: "m2", to: "res1", label: "builds" },
    ],
  },

  conceptFigures: [
    {
      title: "FIG. 1 — The two-module modeling framework",
      image: FIG("cost-fig1"),
      explanation:
        "The whole study in one diagram. LEFT (bottom-up model): electrification scenarios plus annual weather " +
        "data drive a residential demand model (and a fixed non-residential demand and wind/solar profiles) to " +
        "produce hourly power and gas demand. RIGHT (JPoNG — Joint Power-Gas planning model): those demands feed a " +
        "co-optimization of the NG system and the power system, coupled by a joint emissions limit and by gas used " +
        "by gas-fueled power plants, solved over the New England network. The key move is the arrows crossing " +
        "between the two systems: gas and power are planned TOGETHER, not separately.",
    },
    {
      title: "FIG. 5 — What the least-cost system looks like in 2050",
      image: FIG("cost-fig5"),
      explanation:
        "The supply-side outcome across the five electrification scenarios (RF→HX) and two emissions targets " +
        "(80%, 95%). (A) Installed capacity (GW) — far above 2021's 30 GW, dominated by offshore/onshore wind and " +
        "solar. (B) Generation (TWh) — VRE carries most energy. (C) Gas demand vs supply, showing NG use shrinking " +
        "in buildings but persisting in power, met increasingly by low-carbon fuel (LCF) imports. (D) Annual cost " +
        "($B) — lowest for high-electrification scenarios, and much higher under the 95% target. Reading D across " +
        "RF→HX is the paper's headline: more electrification (with envelope) is cheaper.",
    },
  ],

  model: {
    approach: "simulation",
    summary:
      "A computational planning study — no experiment. Two coupled models. A BOTTOM-UP residential model turns " +
      "each electrification pathway (heat-pump adoption, sizing, envelope retrofits) and 20 weather years into " +
      "hourly power and gas demand. Those feed JPoNG, a co-optimization (mixed-integer linear program) that picks " +
      "generation, storage, transmission and gas capacity and operates them hour by hour to MINIMIZE total " +
      "annualized investment + operating cost, subject to power and gas balance, an economy-wide emissions cap " +
      "(80% or 95% below 1990), resource adequacy, and the coupling that gas-fired plants draw from the gas " +
      "system. Solved for US New England in 2050; source models are the bottom-up demand model and JPoNG.",
    toolchain: [
      { name: "Bottom-up residential model", role: "Projects hourly end-use electricity and gas demand per electrification scenario (RF/ME/MX/HE/HX) and weather year, including heat-pump sizing and building-envelope retrofits (Fig. 9, Notes S5)." },
      { name: "JPoNG (Joint Power-and-Natural-Gas)", role: "The co-optimization: a mixed-integer linear program that co-plans and co-operates the power and gas systems to minimize total annualized cost under emissions and adequacy constraints (Sec. Methods; Fig. 1)." },
      { name: "20 weather years", role: "Demand and VRE (wind/solar) profiles are built for 20 historical weather years adjusted for climate change, to capture inter-annual variation and cold-snap peaks (Fig. 2B, Fig. 3)." },
      { name: "New England network + policy", role: "The ISO-NE zonal network with real interconnections; emissions targets of 80% and 95% below 1990, aligned with regional 2050 policy goals." },
    ],
    equations: [
      {
        name: "Least-cost co-optimization objective",
        eq: "min  Σ (annualized investment cost) + Σ (operating cost)  over power AND gas assets",
        source: "JPoNG objective, Methods / Fig. 5D",
        provenance: { section: "Methods (JPoNG)", figure: "FIG. 5D" },
        figure: {
          image: FIG("cost-fig5"),
          label: "FIG. 5D — the cost this objective minimizes",
          caption: "Fig. 5D reports the minimized annual cost per scenario and target — the value of this objective at the optimum.",
        },
        plain:
          "The heart of the planning model: choose what to build and how to run it so that the TOTAL annualized " +
          "cost — capital for generation, storage, transmission and gas infrastructure, plus fuel and operating " +
          "costs — is as small as possible. Everything else (reliability, emissions) enters as constraints. The " +
          "bars in Fig. 5D are this minimized cost for each electrification scenario and emissions target.",
        terms: [
          { sym: "investment cost", meaning: "annualized capital for new capacity: VRE, storage, transmission, gas, low-carbon firm power" },
          { sym: "operating cost", meaning: "fuel, variable O&M, startup, and imports (NG and low-carbon fuel) over all hours and weather years" },
        ],
      },
      {
        name: "Power & gas balance",
        eq: "Σ generation + imports + discharge = demand + charge + losses   (each node & hour, power and gas)",
        source: "Network balance constraints, Methods",
        provenance: { section: "Methods (JPoNG)", figure: "FIG. 5C" },
        figure: {
          image: FIG("cost-fig5"),
          label: "FIG. 5C — gas demand vs supply must balance",
          caption: "Fig. 5C shows the gas side of this balance: demand (power + non-power) matched by NG and low-carbon-fuel supply.",
        },
        plain:
          "At every node and every hour, supply must equal demand — separately for electricity and for gas. On the " +
          "power side that means generation plus storage discharge plus imports serve load; on the gas side, NG " +
          "and low-carbon-fuel supply serve building demand plus the gas burned in power plants. Fig. 5C is this " +
          "balance drawn out for the gas system.",
        terms: [
          { sym: "demand", meaning: "the hourly power/gas demand from the bottom-up model, per electrification scenario and weather year" },
          { sym: "storage", meaning: "short-duration battery (Li-ion) charging/discharging — 10.6–14.4 GW built to firm VRE" },
          { sym: "imports", meaning: "NG imports and low-carbon-fuel (LCF) imports that balance the gas system" },
        ],
      },
      {
        name: "Emissions cap & power-gas coupling",
        eq: "Σ (emissions from power + gas) ≤ (1 − target)·(1990 emissions),   gas_to_power links the two systems",
        source: "Emissions constraint + coupling, Methods / Fig. 5A,B",
        provenance: { section: "Methods (JPoNG)", figure: "FIG. 5A" },
        figure: {
          image: FIG("cost-fig5"),
          label: "FIG. 5A,B — the low-carbon fleet the cap forces",
          caption: "The cap is why Fig. 5A,B are dominated by wind and solar, with only small, high-value gas capacity retained.",
        },
        plain:
          "A single economy-wide cap forces total CO₂ from BOTH systems below 80% (or 95%) of the 1990 level. " +
          "Because gas-fired plants draw fuel from the gas system, the two are coupled: cutting building gas frees " +
          "the cap for power, but power still leans on some gas for cold-snap reliability. Tightening the cap from " +
          "80% to 95% reshapes the fleet toward more VRE, storage and low-carbon fuel — and raises cost (Fig. 5D).",
        terms: [
          { sym: "target", meaning: "emissions-reduction goal vs 1990 — the paper evaluates 80% and 95%" },
          { sym: "gas_to_power", meaning: "gas consumed by gas-fired generators — the physical link co-planning must respect" },
          { sym: "LCF", meaning: "low-carbon fuel (synthetic/biogenic methane), a cost-premium substitute for NG that grows under tighter caps" },
        ],
      },
    ],
    assumptions: [
      "Non-residential power and gas demand is held constant across scenarios at the high-electrification projection.",
      "Deep-decarbonization emissions targets of 80% and 95% below 1990, applied economy-wide across power and gas.",
      "20 historical weather years, adjusted for climate change, capture demand and VRE variability and cold-snap peaks.",
      "Low-carbon fuel is a carbon-neutral drop-in available at a cost premium ($10–50/MMBtu) up to a regional supply curve; hydrogen blending is not modeled.",
      "A limited set of building archetypes is used to keep the bottom-up demand model computationally tractable.",
    ],
    validation:
      "Present-day model demand is benchmarked against published ResStock (NREL) runs and historical EIA annual " +
      "values (Fig. S3); the difference is attributed to weather-year sampling and archetype coarseness and is " +
      "shown not to strongly affect the future-scenario conclusions. Results are reported across 20 weather years " +
      "and multiple demand, technology and decarbonization scenarios rather than a single case, and a sensitivity " +
      "case without CCS and optimistic/pessimistic LCF supply curves is evaluated.",
    takeaways: [
      "Co-optimize power AND gas: the systems are coupled through gas-fired generation, so planning them separately misses the cheapest solution.",
      "The objective is least total annualized cost subject to power/gas balance, an emissions cap, and reliability.",
      "Tightening the emissions cap (80%→95%) and higher electrification reshape the fleet toward VRE + storage + low-carbon fuel — and move total cost (Fig. 5D).",
    ],
    glossary: [
      { sym: "JPoNG", meaning: "Joint Power-and-Natural-Gas model — the co-optimization at the study's core" },
      { sym: "VRE", meaning: "variable renewable energy — offshore/onshore wind and solar, the dominant supply" },
      { sym: "LCF", meaning: "low-carbon fuel — synthetic/biogenic methane substitute for natural gas at a cost premium" },
      { sym: "RF / ME / MX / HE / HX", meaning: "the five scenarios: reference, medium-elec, medium+envelope, high-elec, high+envelope" },
      { sym: "envelope improvement", meaning: "insulation + air-sealing that cuts heating load, peak magnitude and duration" },
    ],
    material: [
      { label: "Paper (DOI)", url: "https://doi.org/10.1016/j.crsus.2025.100307" },
    ],
  },

  explainer: {
    foundations: {
      voice: "onyx",
      scenes: [
        { caption: "The background you need first", narration:
          "Four ideas from prior work frame the study — before its own results. Electrifying heat with heat pumps, why that spikes the winter peak, why power and gas must be planned together, and what deep decarbonization forces onto the supply side. Play with each one.",
          visual: { type: "intro" } },
        { caption: "1 — Electrifying heat with heat pumps", narration:
          "Heat pumps replace gas furnaces and move heating load onto the electric grid, at two to four times the efficiency. Drag through the five electrification scenarios, from reference adoption up to high electrification with building-envelope improvements.",
          visual: { type: "demo", foundationIdx: 0 } },
        { caption: "2 — Why the winter peak explodes", narration:
          "In a cold region, that load lands in winter — coldest hours, weakest solar. Peaks size the grid, so this is what drives cost. Explore how the winter peak overtakes summer as electrification deepens.",
          visual: { type: "demo", foundationIdx: 1 } },
        { caption: "3 — Planning power and gas together", narration:
          "Gas-fired plants draw fuel from the gas system, so the two are physically coupled. Electrifying buildings cuts gas there while power still leans on some gas for cold snaps — which is why they must be planned together.",
          visual: { type: "demo", foundationIdx: 2 } },
        { caption: "4 — Decarbonization reshapes supply", narration:
          "An economy-wide emissions cap pushes the fleet toward wind, solar, storage and low-carbon fuel. Tighten the cap and the expensive firming grows — which is what raises the system cost.",
          visual: { type: "demo", foundationIdx: 3 } },
      ],
    },
    model: {
      voice: "onyx",
      scenes: [
        { caption: "What the paper actually did", narration:
          "Two coupled models. A bottom-up model turns each electrification pathway and twenty weather years into hourly power and gas demand. That feeds JPoNG, a co-optimization that builds and runs both systems at least cost. Let's read the key relations.",
          visual: { type: "intro" } },
        { caption: "The objective: least total cost", narration:
          "Choose what to build and how to run it so total annualized cost — capital plus operations for power and gas — is minimized. The bars in Figure 5D are this minimized cost for each scenario.",
          visual: { type: "equation", equationIdx: 0 } },
        { caption: "Power and gas balance", narration:
          "At every node and hour, supply equals demand — separately for electricity and gas. Figure 5C draws out the gas side: building and power demand met by natural gas and low-carbon-fuel supply.",
          visual: { type: "equation", equationIdx: 1 } },
        { caption: "Emissions cap and coupling", narration:
          "A single cap forces total carbon below eighty, or ninety-five, percent of nineteen-ninety. Because gas feeds power plants, the systems are coupled. Tightening the cap pushes the fleet toward renewables and low-carbon fuel — and raises cost.",
          visual: { type: "equation", equationIdx: 2 } },
        { caption: "How it was checked", narration:
          "Present-day demand is benchmarked against ResStock and EIA data, and results are reported across twenty weather years and many scenarios rather than one case, with a sensitivity study on carbon capture and fuel supply.",
          visual: { type: "validation" } },
      ],
    },
  },

  foundations: [
    {
      title: "Electrifying heat: heat pumps & scenarios",
      source: "Electrification scenarios (Fig. 2A, Notes S5)",
      provenance: { section: "Results", figure: "FIG. 2A" },
      figure: {
        image: FIG("cost-fig2"),
        label: "FIG. 2A — heat-pump adoption by scenario",
        caption: "The paper's Fig. 2A: share of housing stock with heat pumps across the five scenarios, split by sizing and envelope improvement. Your demo reproduces the scenario totals.",
      },
      takeaways: [
        "Heat pumps replace fossil heating with electric — the core decarbonization move for buildings.",
        "Five scenarios span reference adoption (RF) to high electrification with envelope improvement (HX).",
        "Envelope improvements (insulation, air-sealing) shrink the heating load a heat pump must serve.",
      ],
      concept:
        "Decarbonizing heat means swapping gas furnaces and boilers for electric heat pumps, which move heat rather " +
        "than burning fuel and are 2–4× as efficient. The paper defines five 2050 pathways: RF (reference/business-" +
        "as-usual adoption), ME and HE (medium and high electrification), and MX and HX (the same plus building-" +
        "envelope improvements). Adoption ranges from a few percent of homes under RF to ~80% under HE/HX. How " +
        "aggressively — and how efficiently — we electrify sets the demand the whole energy system must then serve.",
      equation: "heat delivered = COP × electricity in   (COP ≈ 2–4 for heat pumps)",
      whyItMatters:
        "The electrification pathway is the input that everything downstream — peak demand, capacity, cost — " +
        "responds to; it is the knob this paper turns.",
      demo: {
        kind: "chart", chartKind: "bar", T: 1, dt: 1,
        xLabel: "electrification scenario", yLabel: "housing stock with heat pumps (%)",
        caption: "the paper's Fig. 2A scenario totals — reference to high electrification",
        provenance: { figure: "FIG. 2A" },
        params: [],
        computeJs: `
return { categories: ${JSON.stringify(SCEN)},
  series: [ { label: "housing stock with heat pumps (%)", data: [6, 57, 57, 80, 80] } ] };`,
      },
    },
    {
      title: "Why electrified heat spikes the winter peak",
      source: "Peak demand & weather dependence (Fig. 3B)",
      provenance: { section: "Results", figure: "FIG. 3B" },
      figure: {
        image: FIG("cost-fig3"),
        label: "FIG. 3 — annual (A) & peak (B) residential demand",
        caption: "Fig. 3B: residential peak electricity demand by scenario, summer vs winter. Under high electrification the winter peak jumps far above summer — the demo reproduces the scenario means.",
      },
      takeaways: [
        "Heat pumps add load in WINTER — coldest hours, weakest solar — so the peak, not just the total, jumps.",
        "High electrification raises peak electricity demand 56–158% vs business-as-usual.",
        "It flips New England from a summer-peaking to a winter-peaking system.",
      ],
      concept:
        "Adding heating load to the grid does not just raise total energy — it raises the PEAK, and it moves that " +
        "peak into winter, during cold snaps when demand is highest and solar is weakest. Because peaks size the " +
        "grid (you build for the worst hour), this is what drives capacity and cost. The paper finds high " +
        "residential electrification lifts peak electricity demand by 56–158%, turning a historically summer-" +
        "peaking region into a winter-peaking one — the central planning challenge.",
      equation: "peak load ↑  ⇒  firm capacity ↑  ⇒  system cost ↑",
      whyItMatters:
        "Peak demand — not annual energy — sizes the grid, so the winter peak from electrified heat is the cost " +
        "driver the whole optimization must manage.",
      demo: {
        kind: "chart", chartKind: "bar", T: 1, dt: 1,
        xLabel: "scenario", yLabel: "residential peak electricity demand (GW)",
        caption: "Fig. 3B, digitized — summer vs winter peak by scenario",
        provenance: { figure: "FIG. 3B" },
        params: [],
        computeJs: `
return { categories: ${JSON.stringify(SCEN6)},
  series: [
    { label: "summer peak (GW)", data: [13, 14, 16, 15, 17.5, 15] },
    { label: "winter peak (GW)", data: [12.5, 13, 16.5, 14.5, 31, 24] },
  ] };`,
      },
    },
    {
      title: "Planning power and gas together",
      source: "Joint framework & substitution (Fig. 1, Fig. 5C)",
      provenance: { section: "Introduction / Methods", figure: "FIG. 1" },
      figure: {
        image: FIG("cost-fig1"),
        label: "FIG. 1 — the joint power-gas framework",
        caption: "Fig. 1: the bottom-up demand model feeds JPoNG, which co-optimizes the gas and power systems — coupled by a joint emissions limit and by gas burned in power plants.",
      },
      takeaways: [
        "Gas-fired power plants draw from the gas system — so the two systems are physically coupled.",
        "Electrification cuts building gas but power still needs some gas for cold-snap reliability.",
        "Co-optimizing both finds cheaper solutions than planning either alone.",
      ],
      concept:
        "Electricity and gas are not separate problems. Gas-fired power plants buy fuel from the gas network, and " +
        "electrifying buildings shifts demand from one system to the other. If you plan them independently you miss " +
        "the substitution: cutting building gas can free pipeline and emissions headroom for power, while the power " +
        "system still relies on some gas for the coldest hours. The paper's framework co-optimizes both, coupled by " +
        "a joint emissions limit and by the gas that power plants consume.",
      equation: "gas demand = building gas + gas-to-power  (the coupling term)",
      whyItMatters:
        "Joint planning is the paper's methodological core — it is what makes the least-cost decarbonized pathway " +
        "visible at all.",
      demo: {
        kind: "chart", chartKind: "bar", T: 1, dt: 1,
        xLabel: "scenario", yLabel: "residential annual demand (TWh-equivalent)",
        caption: "Fig. 3A, digitized — power rises and gas falls as electrification deepens",
        provenance: { figure: "FIG. 3A" },
        params: [],
        computeJs: `
return { categories: ${JSON.stringify(SCEN6)},
  series: [
    { label: "power demand (TWh)", data: [53, 57, 69, 63, 86, 72] },
    { label: "gas demand (TWh)", data: [79, 73, 49, 43, 24, 20] },
  ] };`,
      },
    },
    {
      title: "Deep decarbonization & renewables intermittency",
      source: "Emissions targets & least-cost fleet (Fig. 5A,B,D)",
      provenance: { section: "Results", figure: "FIG. 5A" },
      figure: {
        image: FIG("cost-fig5"),
        label: "FIG. 5 — capacity, generation, and cost by scenario",
        caption: "Fig. 5: the decarbonized fleet is dominated by wind and solar (A,B), backed by storage, transmission and low-carbon firm power; cost (D) rises with a tighter cap.",
      },
      takeaways: [
        "An 80% or 95% emissions cap (vs 1990) forces a VRE-dominated fleet — offshore/onshore wind and solar.",
        "Storage (10.6–14.4 GW), transmission and low-carbon firm power manage renewables' intermittency.",
        "Tightening the cap to 95% raises system cost — visible across Fig. 5D.",
      ],
      concept:
        "Under a deep-decarbonization cap, cheap wind and solar carry most of the energy — but they are variable, " +
        "so the system needs firming: short-duration batteries, transmission expansion, and a small amount of " +
        "high-value low-carbon firm power (including some gas with CCS or low-carbon fuel) for the worst cold " +
        "snaps. The tighter the cap (95% vs 80%), the more of this expensive firming and low-carbon fuel is " +
        "needed, which raises cost. Balancing intermittency against reliability at least cost is what the " +
        "optimization resolves.",
      equation: "min cost  s.t.  emissions ≤ cap,  demand met every hour",
      whyItMatters:
        "The emissions cap and VRE intermittency are the constraints that shape the entire supply-side result and " +
        "its cost.",
      demo: {
        kind: "chart", chartKind: "bar", T: 1, dt: 1,
        xLabel: "scenario", yLabel: "annual system cost ($ billion)",
        caption: "Fig. 5D, digitized — annual cost by scenario, 80% vs 95% target",
        provenance: { figure: "FIG. 5D" },
        params: [],
        computeJs: `
return { categories: ${JSON.stringify(SCEN)},
  series: [
    { label: "annual cost — 80% target ($B)", data: [19, 16.5, 15.2, 16.2, 14] },
    { label: "annual cost — 95% target ($B)", data: [27.5, 24, 22, 21.2, 18.8] },
  ] };`,
      },
    },
  ],

  // The digitized reproductions live in the Results lab (below) as interactive
  // panels next to each real figure — the mandated place — so this section is
  // intentionally empty to avoid duplicating them here.
  explorables: [],

  protocol: {
    T: 1, dt: 1,
    description:
      "The results come from a large co-optimization solved offline, not a browser-runnable simulation, so there " +
      "is no live pipeline. Interactivity is the paper's own figures reproduced point-for-point as interactive " +
      "digitized panels in the Results lab, plus the grounded foundation demos.",
  },
  blocks: [],

  resultFigures: [
    {
      figureLabel: "FIG. 3",
      page: 5,
      bbox: { x: 0.075, y: 0.485, w: 0.56, h: 0.45 },
      image: FIG("cost-fig3"),
      title: "Residential annual and peak demand across scenarios",
      explanation:
        "(A) Annual electricity (green) and gas (red) demand per scenario; each box spans the 20 weather years. As " +
        "electrification deepens RF→HX, power rises and gas collapses. (B) Summer (orange) and winter (blue) peak " +
        "electricity demand; the violins widen where the weather-year density is high. The story is the winter " +
        "violin under HE and HX shooting up to ~24–31 GW, far above the ~12.5 GW of today — electrified heat makes " +
        "New England a winter-peaking system.",
      hotspots: [
        { x: 0.82, y: 0.2, label: "Gas collapses", note: "Residential gas demand falls to ~20 TWh under HX." },
        { x: 0.82, y: 0.7, label: "Winter peak spikes", note: "HE winter peak nears 31 GW vs ~12.5 GW today." },
      ],
      panels: [
        {
          subplotLabel: "A · Annual residential demand (TWh) — digitized from Fig. 3A",
          xLabel: "scenario", yLabel: "residential annual demand (TWh)",
          chartKind: "bar",
          computeJs: `
return { categories: ${JSON.stringify(SCEN6)},
  series: [
    { label: "power demand", data: [53, 57, 69, 63, 86, 72] },
    { label: "gas demand", data: [79, 73, 49, 43, 24, 20] },
  ] };`,
        },
        {
          subplotLabel: "B · Peak electricity demand (GW) — digitized from Fig. 3B",
          xLabel: "scenario", yLabel: "residential peak electricity demand (GW)",
          chartKind: "bar",
          computeJs: `
return { categories: ${JSON.stringify(SCEN6)},
  series: [
    { label: "summer peak", data: [13, 14, 16, 15, 17.5, 15] },
    { label: "winter peak", data: [12.5, 13, 16.5, 14.5, 31, 24] },
  ] };`,
        },
      ],
    },
    {
      figureLabel: "FIG. 5",
      page: 8,
      bbox: { x: 0.12, y: 0.11, w: 0.73, h: 0.585 },
      image: FIG("cost-fig5"),
      title: "Least-cost power-gas system outcomes in 2050",
      explanation:
        "Capacity (A), generation (B), gas demand/supply (C) and annual cost (D) across scenarios and the 80%/95% " +
        "targets. Capacity climbs far above 2021's 30 GW, dominated by wind and solar; generation is VRE-led; gas " +
        "shrinks in buildings but persists in power, met increasingly by low-carbon fuel; and cost (D) is lowest " +
        "for high-electrification scenarios and much higher under the 95% target. Panels D and A are reproduced " +
        "point-for-point as the interactive digitized charts below.",
      hotspots: [
        { x: 0.2, y: 0.35, label: "Far above 30 GW", note: "2050 capacity dwarfs 2021's 30 GW — mostly VRE." },
        { x: 0.78, y: 0.35, label: "Cost rises with the cap", note: "95% target costs far more than 80%." },
      ],
      panels: [
        {
          subplotLabel: "D · Annual system cost ($B) — digitized from Fig. 5D",
          xLabel: "scenario", yLabel: "annual system cost ($ billion)",
          chartKind: "bar",
          computeJs: `
return { categories: ${JSON.stringify(SCEN)},
  series: [
    { label: "80% emissions target", data: [19, 16.5, 15.2, 16.2, 14] },
    { label: "95% emissions target", data: [27.5, 24, 22, 21.2, 18.8] },
  ] };`,
        },
        {
          subplotLabel: "A · Installed capacity (GW), 80% target — digitized from Fig. 5A",
          xLabel: "scenario", yLabel: "installed capacity (GW)",
          chartKind: "bar",
          computeJs: `
return { categories: ${JSON.stringify(SCEN)},
  series: [
    { label: "total capacity", data: [83, 86, 83, 93, 88] },
  ] };`,
        },
      ],
    },
  ],

  conclusion:
    "For a cold-climate region like New England, the least-cost path to decarbonized building heat is aggressive " +
    "electrification COMBINED with building-envelope improvements, planned across the power and gas systems " +
    "together. High electrification raises peak and total electricity demand by 56–158% and 41–59% and flips the " +
    "region to winter-peaking, but envelope measures blunt the peak and, with high electrification, deliver 21–29% " +
    "lower total system cost than low electrification. The decarbonized supply is dominated by wind and solar, " +
    "backed by storage, transmission expansion and a small amount of low-carbon firm power; tighter emissions caps " +
    "raise cost, largely through low-carbon fuel. Joint power-gas planning is essential to see these trade-offs.",

  references: [
    "Khorramfar, R. et al. Cost-effective planning of decarbonized power-gas infrastructure… Cell Reports Sustainability 2, 100307 (2025). https://doi.org/10.1016/j.crsus.2025.100307",
    "Von Wald, G. et al. Joint power-and-gas (JPoNG) co-optimization modeling framework (base model this study extends).",
    "Massachusetts Clean Energy and Climate Plan (CECP) for 2050 — electrification scenario targets (ME, HE).",
    "NREL ResStock — residential building stock energy model used to benchmark present-day demand.",
    "US Energy Information Administration (EIA) — historical New England annual energy values for validation.",
  ],
};
