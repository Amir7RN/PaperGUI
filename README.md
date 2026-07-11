# Interactive Paper Playground (PaperGUI)

Turn a static scientific paper (PDF) into a living, interactive computational dashboard —
concept figures explained, methodology formulas on live sliders, and synchronized
baseline-vs-modified plots. Inspired by Wolfram Mathematica's slider-driven modules.

**Live site:** https://amir7rn.github.io/PaperGUI/

## How it works

1. **Landing page** — anyone can open a bundled **sample paper** for free, no account
   needed. Analyzing your **own** PDF requires a (free) account: sign in / sign up from the
   box in the top-right corner. New accounts get **$1.00 of free analysis credit** — no API
   key, no payment info. Every paper you analyze is saved to your account's **"My papers"**
   library so you can reopen it later without spending credit again.
2. **Analysis** — the PDF is sent to a **Supabase Edge Function**, which is the only place
   the Anthropic API key exists. It calls Claude at the level you pick on the landing page —
   **Advanced** `claude-opus-4-8` · **Standard** `claude-sonnet-5` ·
   **Basic** `claude-sonnet-4-6` · **Fast** `claude-haiku-4-5` (~100-page limit) — reads the
   text and figures, and returns a structured `PaperSpec`: metadata, references, cropped
   concept figures (with plain-language explanations), 3–6 sequential methodology blocks
   (equation + slider coefficients + Python/NumPy snippet + JS kernel), and **faithful
   reproductions of the paper's real result figures** — every subplot and overlaid curve,
   each computed from the pipeline so sliders redraw them live. After the response comes
   back, the edge function computes its real USD cost from Anthropic's token usage and
   deducts it from your account's balance.
3. **Workspace** — a generic engine runs the pipeline twice (author baseline + your
   slider state) and renders one synchronized chart per block. The Smart Conclusion box
   quantifies how far your modification has drifted from the paper's claim.

## Architecture — where the API key lives

GitHub Pages is a **static host** with no server, so the frontend can never hold a secret.
Instead, the Anthropic API key lives as a **Supabase Edge Function secret**:

```
Browser (GitHub Pages)  →  Supabase Edge Function (analyze-paper)  →  Anthropic API
        │                          │
        │  Supabase JWT            │  ANTHROPIC_API_KEY (edge function secret,
        │  (proves who you are)    │  never sent to the browser, never in the repo)
        ▼                          ▼
   credits table (RLS: read own row only) ←── written only by the edge function,
   analyses table (RLS: own rows only)         using the service_role key
```

- The key is set once via `supabase secrets set` (below) and is never present in any
  file in this repo, any GitHub secret, or any browser request.
- Every account gets a `credits` row with a **one-time $1.00 balance**. The edge function
  checks it before calling Claude, and after the call computes the *real* cost from
  `response.usage` (input + output tokens × that model's per-token price) and deducts it.
  There's no artificial "N requests" cap — it's metered spend, which is why an Advanced
  (Opus) analysis can burn the whole balance in one paper while Standard/Basic (Sonnet)
  typically stretches to ~2 papers, and Fast (Haiku) further than that.
- Every finished analysis is written to the `analyses` table (the "My papers" library) so
  it can be reopened for free. Row-Level Security scopes both tables to their owner: a
  signed-in user can only read their own balance and their own saved papers, and can never
  write the `credits` balance — only the edge function (via the `service_role` key, which
  lives in Supabase's own secret store, not in this repo) can debit it.

## One-time setup

The landing page and the sample papers work with **no backend at all**. The steps below are
what enable **sign-up and analyzing your own PDFs**. If any is missing you'll see errors
like *"Invalid path specified in request URL"* (bad/empty `VITE_SUPABASE_URL`) or
*"Could not find the table 'public.credits'"* (migrations not applied).

### 1. Require email confirmation (abuse prevention)

**Authentication → Providers → Email** → turn on **"Confirm email"**. This is the only
thing stopping someone from farming unlimited $1 credits with throwaway addresses; it's
not bulletproof (disposable-email services exist), but it's the right cheap first line of
defense. Add CAPTCHA (**Authentication → Attack Protection**) later if you see abuse.

### 2. Run the database migrations

**SQL Editor** → paste the contents of each file in `supabase/migrations/`, **in filename
order**, and Run:

- `20260711000000_credits.sql` — the `credits` table, its read-own-row RLS policy, and a
  trigger that grants every new signup a $1.00 balance automatically.
- `20260711010000_analyses.sql` — the `analyses` table (the "My papers" library) with
  per-owner insert/read/delete RLS.

(Or, with the Supabase CLI: `supabase link --project-ref <ref>` then `supabase db push`.)

### 3. Deploy the edge function and set the API key secret

Install the [Supabase CLI](https://supabase.com/docs/guides/cli), then from this repo:

```bash
supabase login
supabase link --project-ref <your-project-ref>   # find it in Project Settings → General

supabase functions deploy analyze-paper

supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are already available to every edge
function automatically — you don't set those yourself.

### 4. Point the frontend at your project

Copy the project's **URL** and **anon public key** (Project Settings → API → Project
API keys) into **GitHub repo → Settings → Secrets and variables → Actions**. Paste the raw
values — **no surrounding quotes, no trailing slash, no stray newline** (a malformed URL is
what produces *"Invalid path specified in request URL"*):

- `VITE_SUPABASE_URL`  → `https://xxxx.supabase.co`
- `VITE_SUPABASE_ANON_KEY`  → `eyJ...`

The anon key is a **public** key by design — safe to ship in a static site; RLS is what
actually protects the tables. **Never** put the `service_role` key anywhere in this repo or
its GitHub secrets — the edge function already has it via its own runtime env.

Re-run the deploy (push any commit, or **Actions → Deploy → Run workflow**) once both
secrets are set.

For local dev, put the same URL + anon key in a `.env` file (git-ignored):

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

### Analysis quality vs. the hosting time limit

Supabase Edge Functions are hard-killed at **150s** (free plan) / **400s** (Pro).
The analyzer already splits each run into three shorter phases to fit, but the
**Advanced (Opus)** tier is the tight one: at standard speed Opus only fits the
150s free-tier window at **`effort: "low"`** (set in `MODEL_TIERS`, `_shared/paperSpec.js`).

- **Free Supabase:** leave Advanced at `low`. If a phase still overruns, the
  client auto-retries it on the next-faster tier so the run always completes.
- **Supabase Pro (400s):** raise Advanced's `effort` to `"high"` for the
  full-quality Opus reproduction — the reliable way to get the "wow" output.
- **Fast mode** (`speed: "fast"`, ~2.5× faster Opus) is only usable if your
  Anthropic org has fast-mode access; without it the API returns a 429
  (`0 fast mode input tokens per minute`). It is not enabled here.

### Operational notes

- **Selling credit (manual Venmo / Cash App flow):** fill in your handles in
  `src/payments.js` (they're empty by default, which hides the option) and push.
  The **Add credit** button then shows buyers your handle and tells them to put
  their account email in the payment note. When a payment arrives, apply it:
  ```sql
  update public.credits set balance_usd = balance_usd + 10.00
  where user_id = (select id from auth.users where email = 'buyer@example.com');
  ```
  Price your margin into the amounts (e.g. sell $10 of "credit" that costs you
  ~$7 of Anthropic usage). Later, replace with Stripe Payment Links if you want
  it automated.
- **Top up or reset a user's balance:** in the SQL Editor,
  `update public.credits set balance_usd = 1.00 where user_id = '<uuid>';`
  (find the uuid via `select id, email from auth.users where email = '...';`).
- **Change the starting balance for new signups:** edit the `default 1.00` in the
  migration's `credits` table definition (or `alter table public.credits alter column
  balance_usd set default 2.00;` directly in the SQL Editor) — this only affects
  accounts created afterward.
- **Redeploying the function** after editing `supabase/functions/analyze-paper/index.ts`
  or `supabase/functions/_shared/paperSpec.js`: `supabase functions deploy analyze-paper`.

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
- Balance is checked-then-deducted around each request rather than pre-authorized/held —
  fine for normal usage, but firing two analyses in the same instant could very slightly
  overspend the $1 before the first deduction lands. Not worth the complexity to close for
  a hobby-scale free tier.

## Stack

React 18 · Vite 6 · Tailwind CSS 4 · Recharts · lucide-react · pdfjs-dist · Supabase
(Auth, Postgres, Edge Functions) · @anthropic-ai/sdk (server-side, in the edge function)
