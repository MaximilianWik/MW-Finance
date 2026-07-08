# MWFinance

Personal finance terminal -- connects to Lansforsakringar Bank via Enable Banking Open Banking API, auto-categorizes transactions, tracks salary-cycle budgets, manages savings goals, and surfaces behavioral insights. Built with a full retro-CLI aesthetic.

**Stack:** Next.js 15 (App Router) -- Drizzle ORM -- Neon Postgres -- Enable Banking (RS256 JWT) -- Gemini 2.0 Flash -- ntfy -- Tailwind -- Vercel

---

## Features

- **Auto-sync** from Lansforsakringar via cron (every 6h) or manual trigger. Sync always re-links via BankID first; full log output with categorization breakdown and per-transaction detail.
- **Categorization** pipeline: self-transfer detection -> MCC codes -> keyword rules -> merchant cache -> Gemini fallback. Manual overrides propagate to all past and future transactions from the same merchant.
- **Salary-cycle budgeting**: budget periods run from your last salary to the next one (detected as Income 18k--30k kr), not calendar months.
- **Category drill-down**: click any budget row to see its transactions for the current period.
- **Recurring payments**: auto-detected from history (>=3 consistent charges) + manually markable from the ledger. Bills checklist with paid/due/overdue status on /insights.
- **Savings goals** with Vercel Blob images, time-to-goal projections, and monthly auto-sweep of budget surplus.
- **Insights**: month-over-month and week-over-week comparison tables. Spending increases shown in red; Savings decrease in red (reversed). Transfers excluded.
- **Self-transfer exclusion**: transfers between own accounts (matched by counterparty name or account number) are always categorized as Transfers and excluded from spending totals and budgets.
- **What-if simulator**: adjust category budgets and see projected month-end impact.
- **Adaptive budgeting**: large purchases tighten other categories automatically.
- **Anomaly detection**: suspicious payments flagged with [!] ANOMALY.
- **Ledger LÖN period filter**: filter transactions by salary cycle.

---

## Setup

### Prerequisites

- Node 20+
- [Neon](https://neon.tech) Postgres database (free tier)
- [Enable Banking](https://enablebanking.com) application:
  - Create an app, generate an RSA key pair
  - Register redirect URL `http://localhost:3000/api/callback` (and your prod domain)
  - Note your Application ID
- [Gemini API key](https://aistudio.google.com/apikey) (free tier)
- [ntfy](https://ntfy.sh) app on your phone

### Install

```powershell
npm install
Copy-Item .env.example .env.local
# fill in .env.local -- see comments there
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

For a fresh environment, also apply `drizzle/migrations/phase2.sql` in the Neon SQL editor
(adds `savings_entries` and Phase 2 columns if `db:push` does not pick them up).

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
| `GEMINI_API_KEY` | yes | Google AI Studio |
| `GEMINI_MODEL` | no | defaults to `gemini-2.0-flash` |
| `NTFY_SERVER` | no | defaults to `https://ntfy.sh` |
| `NTFY_TOPIC` | yes | your private ntfy topic |
| `BLOB_READ_WRITE_TOKEN` | yes | Vercel Blob (goal images) |
| `CRON_SECRET` | yes | Bearer token for `/api/sync` cron |
| `APP_URL` | yes | public base URL e.g. `https://mw-finance-six.vercel.app` |

---

## Key Source Files

| File | Role |
|---|---|
| `src/db/schema.ts` | Drizzle schema (all tables) |
| `src/db/seed.ts` | Category seed data |
| `src/lib/enablebanking/jwt.ts` | RS256 JWT signer (cached) |
| `src/lib/enablebanking/client.ts` | Enable Banking API client |
| `src/lib/enablebanking/normalize.ts` | Raw transaction -> DB row (dedupe key, merchant normalize) |
| `src/lib/categorize.ts` | MCC + keyword rules, Gemini batch classifier |
| `src/lib/transfers.ts` | Self-transfer detection by counterparty name / account number |
| `src/lib/sync.ts` | Full sync orchestration (fetch -> categorize -> notify -> behavior) |
| `src/lib/budget.ts` | Monthly budget status; uses salary-cycle period |
| `src/lib/period.ts` | Salary-cycle period detection (getSalaryCycle, getAllSalaryCycles) |
| `src/lib/comparison.ts` | Month-over-month and week-over-week spend comparison |
| `src/lib/savings.ts` | Goals, contributions, monthly sweep, savings total |
| `src/lib/queries.ts` | Shared query helpers (accounts, transactions, listTransactions) |
| `src/lib/behavior/` | Recurring detection, anomaly flagging, adaptive budgets, trajectory |
| `app/ui/SyncButton.tsx` | Sync console -- always re-links first, auto-runs on BankID return |
| `app/ui/LedgerPanel.tsx` | Full-featured ledger with filters, query log, LÖN period select |
| `app/ui/RecentLedger.tsx` | Overview recent transactions (client component, same API as ledger) |
| `app/ui/BudgetBar.tsx` | Budget row with category-colored bar and click-to-drill |
| `app/ui/SavingsPanel.tsx` | All-time savings total + manual entry form |
| `app/ui/RecurringActions.tsx` | MarkRecurring and UnmarkRecurring buttons |

---

## API Routes

| Route | Method | Description |
|---|---|---|
| `/api/auth/start` | GET | Begin BankID consent (`?autoSync=1` to auto-sync on return) |
| `/api/callback` | GET | Exchange OAuth code, persist session + accounts |
| `/api/sync` | GET/POST | Cron target. Guarded by `Authorization: Bearer $CRON_SECRET`. `?gemini=1` enables Gemini. |
| `/api/sync/manual` | POST | Dashboard sync trigger (no auth, personal app) |
| `/api/transactions` | GET | List with filters: `month`, `from`, `to`, `categoryId`, `q`, `limit` |
| `/api/transactions` | PATCH | Category override -- propagates to all same-merchant transactions |
| `/api/categories` | GET/PATCH/POST | List / edit budgets / create |
| `/api/recurring` | GET/POST/PATCH/DELETE | Manage recurring payments (DELETE accepts `?id=` or `?merchant=`) |
| `/api/savings` | GET/POST/DELETE | Savings total + manual entries |
| `/api/goals` | GET/POST | Savings goals |
| `/api/goals/[id]/contributions` | GET/POST | Goal contributions |
| `/api/goals/[id]/image` | POST | Upload goal image (Vercel Blob) |
| `/api/simulate` | POST | What-if budget simulation |
| `/api/maintenance/reclassify` | POST | One-time backfill: re-run self-transfer detection on all transactions |

---

## Deploy to Vercel

1. Push to Git and import into Vercel.
2. Add all env vars from `.env.example` in Project -> Settings -> Environment Variables. Set `APP_URL` and `ENABLE_BANKING_REDIRECT_URL` to your prod domain; register that URL in Enable Banking.
3. `vercel.json` defines cron jobs:
   - `/api/sync` every 6h
   - `/api/sync?gemini=1` weekly (Monday 06:00)
   - Vercel injects `Authorization: Bearer $CRON_SECRET` automatically.
   - **Sub-daily crons require Vercel Pro.** On Hobby, change to daily (`0 6 * * *`).
4. Apply DB migrations once against the prod `DATABASE_URL`:
   ```powershell
   # Set DATABASE_URL to prod connection string, then:
   npm run db:push
   npm run db:seed
   ```
   Also run the Phase 2 SQL from `drizzle/migrations/phase2.sql` in the Neon SQL console.

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
- Use an unguessable `NTFY_TOPIC` -- anyone who knows it can read your budget alerts.
