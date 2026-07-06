# Interactive Paper Playground (PaperGUI)

Turn a static scientific paper (PDF) into a living, interactive computational dashboard —
concept figures explained, methodology formulas on live sliders, and synchronized
baseline-vs-modified plots. Inspired by Wolfram Mathematica's slider-driven modules.

**Live site:** https://amir7rn.github.io/PaperGUI/

## How it works

1. **Landing page** — load the bundled sample paper (no key needed), or upload a PDF.
2. **Analysis** — the PDF is sent from *your browser* directly to the Anthropic API
   at the analysis level you pick on the landing page:
   **Advanced** `claude-opus-4-8` · **Standard** `claude-sonnet-5` ·
   **Basic** `claude-sonnet-4-6` · **Fast** `claude-haiku-4-5` (~100-page limit).
   Claude reads the text and figures and returns a structured
   `PaperSpec`: metadata, references, concept figures (with plain-language explanations),
   and 3–6 sequential methodology blocks, each with its governing equation, slider
   coefficients (defaults = the paper's reported values), a Python/NumPy snippet, and a
   JS compute kernel.
3. **Workspace** — a generic engine runs the pipeline twice (author baseline + your
   slider state) and renders one synchronized chart per block. The Smart Conclusion box
   quantifies how far your modification has drifted from the paper's claim.

## API key — read this

GitHub Pages is a **static host**: there is no server to hide a secret, so the app never
ships with a key and you must **never commit one to this repo** (a key pushed to GitHub is
considered leaked and gets revoked). Instead:

- Click **API key** (top right) and paste your key from https://platform.claude.com
- It is stored only in your browser's `localStorage` and sent only to `api.anthropic.com`.
- Analysis is billed to your own account (one Opus 4.8 call per paper).

## Run locally

```bash
npm install
npm run dev   # opens http://localhost:5173
```

## Deploy

Pushing to `main` triggers `.github/workflows/deploy.yml`, which builds the site and
publishes it to GitHub Pages. One-time setup in the repo:
**Settings → Pages → Build and deployment → Source: GitHub Actions.**

## Notes & limits

- PDF limit: 32 MB / ~100–600 pages (Anthropic API limits).
- The generated compute kernels (`computeJs`) are produced by Claude from the uploaded
  paper and executed in your own browser with access only to `Math` and a small helpers
  object; the app test-runs the pipeline before showing the workspace.
- Concept figures are rendered client-side with pdf.js from the pages Claude identifies.

## Stack

React 18 · Vite 6 · Tailwind CSS 4 · Recharts · lucide-react · @anthropic-ai/sdk · pdfjs-dist
