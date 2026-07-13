# MWFinance

Personal finance terminal — connects to Lansforsakringar Bank via Enable Banking Open Banking API, auto-categorizes transactions with Gemini AI, tracks salary-cycle budgets, manages savings goals, and surfaces behavioral insights. Built with a full retro-CLI aesthetic.

**Stack:** Next.js 15 (App Router) · Drizzle ORM · Neon Postgres · Enable Banking (RS256 JWT) · Gemini 2.5 Flash · ntfy · Tailwind · Vercel

---

## Features

- **Auto-sync** from Lansforsakringar via cron (daily + weekly) or manual trigger. Sync always re-links via BankID first; full streaming log with per-transaction categorization detail and a `[DONE]` summary.
- **Categorization pipeline**: self-transfer detection → MCC codes → keyword rules → merchant cache → Gemini fallback. Manual overrides propagate to all past and future transactions from the same merchant. On-demand backlog recategorization from the ledger.
- **Salary-cycle budgeting**: budget periods run from your last salary to the next one (detected as Income 18k–30k kr), not calendar months.
- **AI budget recalibration**: Gemini analyzes your spending, recurring bills, and habits, then proposes and applies a full budget. Manual edits are respected and never overwritten.
- **Conversational AI assistant**: terminal-style console on `/assistant` — ask questions about your finances, get streamed plain-text responses.
- **Behavioral analysis**: nightly Gemini batch run produces AI insights shown on the overview.
- **Investment tracking**: per-account balance tracker (Lysa, Avanza, LF Fonder). Balance = seed + all deposits (DBIT) minus withdrawals (CRDT) matching the account name in your ledger. Add accounts from the overview panel.
- **Recurring payments**: auto-detected from history (≥3 consistent charges) + manually markable from the ledger. Variable-price recurring (electricity etc.) supported. Bills checklist with paid/due/overdue status on `/insights`.
- **Anomaly detection**: suspicious payments flagged with `[!] ANOMALY`, persisted to `transactions.flagged_reason`.
- **Savings goals** with Vercel Blob images, time-to-goal projections, and monthly auto-sweep of budget surplus.
- **What-if simulator**: adjust category budgets and see projected month-end impact.
- **Adaptive budgeting**: large purchases tighten other categories automatically (net-zero redistribution).
- **SQL boot log**: page loads replay their Drizzle queries as a typewriter boot sequence.
- **Password protection**: optional `SITE_PASSWORD` env var enables a JWT session lock on all mutating routes. Unset = open (local dev).
- **Self-transfer exclusion**: transfers between own accounts are excluded from spending totals, budgets, and comparison tables.

---

## Setup

### Prerequisites

- Node 20+
- [Neon](https://neon.tech) Postgres database (free tier works)
- [Enable Banking](https://enablebanking.com) application:
  - Create an app, generate an RSA key pair
  - Register redirect URL `http://localhost:3000/api/callback` (and your prod domain)
  - Note your Application ID
- [Gemini API key](https://aistudio.google.com/apikey) — billing must be enabled (free tier quota is 0)
- [ntfy](https://ntfy.sh) app on your phone

### Install

```powershell
npm install
Copy-Item .env.example .env.local
# fill in .env.local
```

### Enable Banking private key

The key must be PKCS#8, base64-encoded with no line wraps:

```powershell
# Convert PKCS#1 to PKCS#8 if needed:
openssl pkcs8 -topk8 -nocrypt -in your-key.pem -out pkcs8.pem
# Base64-encode (no line wraps):
[Convert]::ToBase64String([IO.File]::ReadAllBytes("pkcs8.pem")) | Set-Content key.b64
```

Paste `key.b64` content into `ENABLE_BANKING_PRIVATE_KEY_BASE64`.

### Database

```powershell
npm run db:push     # create tables from Drizzle schema
npm run db:seed     # insert default categories + budgets
```

Then apply all phase migrations in the Neon SQL editor (safe to re-run — all idempotent):

- `drizzle/migrations/phase2.sql` — savings_entries, Phase 2 columns
- `drizzle/migrations/phase3.sql` — ai_insights, budgetSource, variableAmount
- `drizzle/migrations/phase4.sql` — investment_accounts

### Run

```powershell
npm run dev
# open http://localhost:3000
# click "$ sync now" -> BankID re-link -> auto-syncs on return
```

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | yes | Neon Postgres connection string |
| `ENABLE_BANKING_PRIVATE_KEY_BASE64` | yes | Base64 PKCS#8 RSA private key |
| `ENABLE_BANKING_APP_ID` | yes | Enable Banking application ID |
| `ENABLE_BANKING_REDIRECT_URL` | yes | Must match Enable Banking panel |
| `ENABLE_BANKING_ASPSP_NAME` | yes | e.g. `Lansforsakringar` |
| `ENABLE_BANKING_ASPSP_COUNTRY` | yes | e.g. `SE` |
| `GEMINI_API_KEY` | yes | Google AI Studio — billing must be enabled |
| `GEMINI_MODEL` | no | defaults to `gemini-2.5-flash` |
| `NTFY_SERVER` | no | defaults to `https://ntfy.sh` |
| `NTFY_TOPIC` | yes | your private ntfy topic |
| `BLOB_READ_WRITE_TOKEN` | yes | Vercel Blob (goal images) |
| `CRON_SECRET` | yes | Bearer token for `/api/sync` cron guard |
| `APP_URL` | yes | public base URL e.g. `https://mw-finance-six.vercel.app` |
| `SITE_PASSWORD` | no | enables password lock on all mutations; unset = open |
| `FINNHUB_API_KEY` | no | stock quotes (candles/quote routes) |

---

## Key Source Files

| File | Role |
|---|---|
| `src/db/schema.ts` | Drizzle schema (all tables + type exports) |
| `src/db/seed.ts` | Category seed data (14 categories) |
| `src/db/query-log.ts` | AsyncLocalStorage SQL collector; `withQueryLog()` |
| `src/lib/env.ts` | Centralized, typed env access (lazy, server-only) |
| `src/lib/enablebanking/normalize.ts` | Raw transaction → DB row (dedupe key, merchant normalize) |
| `src/lib/categorize.ts` | MCC + keyword rules + Gemini batch classifier |
| `src/lib/categorize-batch.ts` | Shared batch engine used by sync + `/api/categorize` |
| `src/lib/transfers.ts` | Self-transfer detection by counterparty name / account number |
| `src/lib/sync.ts` | Full sync orchestration (fetch → categorize → notify → behavior) |
| `src/lib/budget.ts` | Monthly budget status; salary-cycle period |
| `src/lib/period.ts` | Salary-cycle period detection (`getSalaryCycle`, `getAllSalaryCycles`) |
| `src/lib/comparison.ts` | Salary-period and month-over-month comparison |
| `src/lib/savings.ts` | Goals, contributions, monthly sweep |
| `src/lib/behavior/` | Recurring detection, anomaly flagging, adaptive budgets, trajectory |
| `src/lib/gemini/client.ts` | `geminiModel()` factory |
| `src/lib/gemini/context.ts` | `buildFinancialContext()` — assembles full context for AI calls |
| `src/lib/gemini/assistant.ts` | `streamAssistant()` — conversational chat |
| `src/lib/gemini/budget.ts` | `proposeBudget()` / `applyBudgetProposal()` |
| `src/lib/gemini/analysis.ts` | `runBehaviorAnalysis()` nightly batch |
| `app/ui/typewriter.tsx` | `useTypewriter` hook, `TerminalLog`, `Spinner`, `lineColor` |
| `app/ui/SyncButton.tsx` | Sync trigger with live streaming log |
| `app/ui/LedgerPanel.tsx` | Full ledger with filters, recurring tags, category overrides |
| `app/ui/BudgetBar.tsx` | Table-row budget bar with category color |
| `app/ui/RecalibratePanel.tsx` | AI budget recalibrate with guidance textarea |
| `app/ui/InvestmentsPanel.tsx` | Investment accounts panel (add, edit, delete, live balance) |
| `app/ui/AssistantConsole.tsx` | AI assistant terminal UI |
| `app/ui/QueryLog.tsx` | SQL boot sequence typewriter |
| `app/ui/AuthProvider.tsx` | Global fetch 401 interceptor + PasswordModal |
| `middleware.ts` | JWT session guard for all mutating API routes |

---

## API Routes

| Route | Methods | Description |
|---|---|---|
| `/api/auth/start` | GET | Begin BankID consent (`?autoSync=1` to auto-sync on return) |
| `/api/auth/unlock` | POST | Password unlock — sets `mwf_session` JWT cookie |
| `/api/callback` | GET | Exchange OAuth code, persist session + accounts |
| `/api/sync` | GET, POST | Cron target; Bearer-guarded by `CRON_SECRET` |
| `/api/sync/manual` | POST | Streaming manual sync; returns `ReadableStream` |
| `/api/categorize` | POST | Streaming backlog re-categorization |
| `/api/transactions` | GET, PATCH | List with filters; PATCH = category override (propagates) |
| `/api/categories` | GET, POST, PATCH, DELETE | List / create / edit budgets / delete |
| `/api/recurring` | GET, POST, PATCH | Manage recurring payments (variable flag, category, notes) |
| `/api/budget/recalibrate` | POST | Streaming AI budget proposal + apply |
| `/api/investments` | GET, POST, PATCH, DELETE | Investment accounts with computed live balances |
| `/api/assistant` | POST | Streaming Gemini conversational assistant |
| `/api/analysis/run` | POST | Nightly AI behavioral analysis batch |
| `/api/insights/ai` | GET | Fetch stored AI insights |
| `/api/savings` | GET, POST, DELETE | Standalone savings entries |
| `/api/goals` | GET, POST | Savings goals |
| `/api/goals/[id]/contributions` | GET, POST | Goal contributions |
| `/api/goals/[id]/image` | POST | Upload goal image (Vercel Blob) |
| `/api/simulate` | POST | What-if budget simulation |
| `/api/candles` | GET | Finnhub OHLCV candles |
| `/api/quote` | GET | Finnhub real-time quote |
| `/api/maintenance/reclassify` | POST | Backfill: re-run self-transfer detection on all transactions |

---

## Deploy to Vercel

1. Push to Git and import into Vercel.
2. Add all env vars from `.env.example` in Project → Settings → Environment Variables. Set `APP_URL` and `ENABLE_BANKING_REDIRECT_URL` to your prod domain; register that URL in Enable Banking.
3. `vercel.json` cron schedule:
   - `/api/sync` — daily 06:00
   - `/api/sync` — every Monday 06:00
   - `/api/analysis/run` — daily 06:30
   - Vercel injects `Authorization: Bearer $CRON_SECRET` automatically.
4. Apply all DB migrations against prod Neon (see Database section above).

---

## Scripts

```
npm run dev          dev server
npm run build        production build
npm run typecheck    tsc --noEmit
npm run db:push      push Drizzle schema to Neon
npm run db:seed      seed default categories
npm run db:studio    Drizzle Studio (DB browser)
```

---

## Security

- `.env.local` and `*.pem` are gitignored. Never commit secrets.
- RSA private key lives only in env. Rotate via the Enable Banking panel.
- `/api/sync` is protected by `CRON_SECRET` bearer check.
- Set `SITE_PASSWORD` to enable session-cookie auth on all mutating routes in production.
- Use an unguessable `NTFY_TOPIC` — anyone who knows it can read your push alerts.
