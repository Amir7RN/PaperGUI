# Prompt for Claude Opus (max effort) — Fast first pass, live references, universal panels, two-stage figure digitization, per-action credit pricing

## How to work

This is a mature, already-evolved codebase (not a fresh build) — `supabase/functions/_shared/paperSpec.js`, `src/api.js`, `src/Workspace.jsx`, `src/digitizer.js`, `src/DigitizerEditor.jsx`, `src/DigitizedPanels.jsx`, `src/narrate.js`, `src/SectionChat.jsx` / `sectionChat.js`, `supabase/functions/analyze-paper/index.ts`, `supabase/functions/narrate/index.ts`, the `credits`/`analyses` Supabase tables, and sample papers `samplePaper.js` through `samplePaper9.js` (several deliberately cover box plots, violin plots, and stacked/histogram-grid figures). Before changing anything:

1. Read the current state of every file above end to end. Do not assume prior behavior from commit messages or comments — verify against the live code.
2. If any requirement below is ambiguous once you see the actual code, ask me before building the wrong thing. I do not want a build-test-revert cycle — I'm running this as one paid, max-effort pass and I want it right the first time.
3. Before declaring done, test the full flow against at least three of the existing sample papers, including one with box/violin subplots and one with a multi-panel bar/histogram grid, and describe what you verified.

This is a genuine architecture change: move from "analyze everything up front" to "fast, cheap first pass now; everything expensive is an explicit, priced, on-demand action afterward."

---

## 1. Fast first pass — only the cheap, structural stuff, nothing expensive

When a paper is submitted (PDF upload **or DOI**), the first pass must return as fast as possible and must NOT generate result-figure digitizations or interactive panels. It only produces:

- The mindmap (concept graph).
- The story/infographic overview.
- The full reference list, extracted but **not yet resolved** (see §2 — resolution is lazy, on click).
- The paper's actual section text (Introduction, Background/Related Work, Method, Results narrative, Discussion, Conclusion) as real, extracted, selectable text — not a paraphrase, not images. Tables and algorithm blocks are part of this (see §3).

If DOI-only input is supported (or should be added): resolve the DOI to an open-access PDF via an open-access resolver (e.g. Unpaywall) when one exists; if no legally accessible full text exists, fall back to metadata + abstract only for that paper, and say so in the UI rather than silently producing partial output.

Everything else — building an interactive panel, digitizing a result figure — is a separate, explicit, user-triggered, individually-priced action performed after this fast pass (see §6). Advanced tier during the first pass must NOT auto-generate all panels or all result figures; it should only mean "highest-quality fast pass," not "do everything."

## 2. References must be obviously clickable and resolve live against the real cited paper

Current behavior (a plain text highlight) is ambiguous — fix the visual affordance first: references should render as distinct, clearly clickable chips/links (not just colored text), both inline in the body text and in any reference list.

On click, resolve the reference **live**, on demand (cache the result so a second click on the same reference is free):

1. Parse the reference string (authors/title/year) and look it up via a free scholarly metadata API — Semantic Scholar API and/or OpenAlex are good candidates because both expose abstracts for a large fraction of the literature; fall back to Crossref for metadata and a general web search for the abstract if neither has it. Handle the case where the paper cannot be found at all — show that plainly, don't fabricate.
2. Once resolved, generate a short, contextual explanation combining: (a) what the cited paper is about, from its real abstract, and (b) **why the current paper cites it here** — grounded in the actual sentence/paragraph in the current paper that contains this citation, not a generic restatement of the abstract. The output should read like: "This is [paper] by [authors] — [what it did, from its abstract]. The current paper cites it here because [specific reason drawn from the citing sentence]."
3. Show this as a compact popover/card at the click location, with a link out to the source (DOI/Semantic Scholar/OpenAlex page) if the reader wants to go further.

## 3. Tables and algorithms must be extracted as real text, not images

Audit the current figure/section extraction pipeline. Tables and algorithm blocks are currently coming through as image crops in at least some papers I tested. Fix the extraction so tables and algorithms are OCR'd/parsed into structured, selectable text (e.g. a real `<table>` or a preformatted text block for algorithms/pseudocode) and flow through the same text pipeline as regular paragraphs — including being selectable for the panel-building interaction in §4. Only fall back to an image crop when text extraction genuinely fails (e.g. a scanned table with no usable OCR), and mark that case clearly as a fallback rather than treating it as the default path.

## 4. "Build an interactive panel" must work on selected text in every section, not just Method

Today the highlight-to-panel interaction is scoped to the Method section only. Extend it to the entire paper — Introduction, Background/Related Work, Method, Results narrative, Discussion, Conclusion, and the now-selectable tables/algorithms from §3.

Behavior: user selects any span of text anywhere in the paper → gets the option to build a panel. The panel's job is to make the underlying idea interactive and explorable — why the authors are presenting this specific idea, for whatever concept/field it touches — synthesized fresh for whatever was selected, not limited to a fixed pre-built library of topics. This is a per-selection, on-demand, priced action (see §6), not something generated automatically during the fast pass.

## 5. Result-figure digitization: offline draft first, online API only to refine — and only on request

We already have an offline, no-API-token figure-type classifier/digitizer (`src/digitizer.js` and related files) that runs locally for free but isn't accurate or clean enough on its own — chart type, subplot count, and layout (e.g. stacked vs. grouped bars) have been wrong often enough that I've had to manually correct results repeatedly. Replace the current one-shot approach with a two-stage pipeline, triggered only when the user explicitly asks to digitize a specific figure:

- **Stage A — offline, free.** Run the existing local classifier/digitizer against the figure crop to produce a first-draft structure: plot type (line/bar/box/violin/scatter/histogram), subplot count and layout, series count, and a rough data guess. Zero API cost.
- **Stage B — online, paid, corrective.** Send Stage A's draft structure together with the actual original figure image to the online model (vision) with an explicit instruction to verify and correct the draft against the real image — correct plot type, correct subplot count/arrangement, correct whether series are stacked or grouped, correct axis semantics — rather than generating a reproduction from scratch. The model's job here is verification and correction of a good first guess, which should be materially more reliable than generating blind.

This entire flow (both stages) runs per-figure, only when the user requests that specific figure, never automatically for all figures during the fast pass.

## 6. Everything expensive is on-demand, individually priced, and shown as a cost estimate before the user commits

Keep the existing dollar-based credit balance (top-up in dollars, real usage metered and deducted after the call, per the current `credits` table and `usageCostUsd` logic) — do not replace it with a count-based system. Add, on top of it:

- Before the user triggers a panel build (§4) or a result-figure digitization (§5), show an **estimated cost in dollars** for that specific action (e.g. "Build this panel — est. $0.10–$0.20" / "Digitize this figure — est. $1.00–$1.50"), based on the tier/model and expected token usage for that kind of call.
- After the action runs, deduct the real metered cost from the balance (existing behavior) and show it next to the estimate so the user can see how close the estimate was.
- This lets a user with, say, a 20-figure paper choose to digitize only the 4 figures they actually care about instead of paying for all of them — the fast pass never forces that spend.

## Acceptance criteria

- Uploading a paper (or submitting a DOI) returns mindmap + story + reference list + full selectable section text — including tables/algorithms as text — quickly, with zero panels and zero digitized figures generated automatically.
- Clicking any reference (inline or in the list) is visually obvious as clickable, and produces a live-resolved explanation of the cited paper and why it's cited here, cached after first resolution.
- Selecting text anywhere in the paper (any section, plus tables/algorithms) offers "build a panel," and it works, not just in Method.
- Requesting digitization of a specific result figure runs the offline draft first, then the online correction pass against the real image, and produces a plot-type-correct, subplot-count-correct reproduction — verified against sample papers with box plots, violin plots, and multi-panel stacked/grouped bar figures, with no manual back-and-forth required.
- Every panel build and every figure digitization shows a dollar cost estimate before running and deducts the real metered cost after, against the existing balance system.
