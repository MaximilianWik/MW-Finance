# MWFinance — Handover

**Owner:** Maximilian Wikström  
**Repo:** `MW-Finance`  
**Live:** `mw-finance-six.vercel.app`  
**Stack:** Next.js 15 App Router · Drizzle ORM · Neon Postgres · Enable Banking · Gemini 2.5 Flash · Vercel

---

## Pending DB Migration

One migration must be run in Neon before the investment panel works:

```sql
-- phase4.sql (drizzle/migrations/phase4.sql)
CREATE TABLE IF NOT EXISTS investment_accounts (
  id          serial PRIMARY KEY,
  name        text NOT NULL,
  color       text NOT NULL DEFAULT '#3ea0c8',
  merchant    text,
  seed_balance numeric(14,2) NOT NULL DEFAULT 0,
  seed_date   date,
  currency    text NOT NULL DEFAULT 'SEK',
  sort        integer NOT NULL DEFAULT 100,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
```

All earlier migrations (`phase2.sql`, `phase3.sql`) should already be applied. Safe to re-run all — everything is `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`.

---

## Current Schema

```
bank_sessions           -- Enable Banking consent sessions
accounts                -- linked bank accounts (uid = Enable Banking uid)
categories              -- spending categories; color, budget, budgetSource ('manual'|'ai')
transactions            -- all transactions, deduped on (account_uid, dedupe_key)
merchant_categories     -- learned merchant->category cache (rule|gemini|manual)
recurring_payments      -- auto-detected + manually-marked recurring; variableAmount flag
savings_goals           -- savings targets with Vercel Blob images
savings_contributions   -- contributions to goals
savings_entries         -- standalone manual savings (not goal-linked)
budget_adjustments      -- adaptive per-month signed deltas on category budgets
sync_runs               -- audit log; drives monthly sweep rollover
ai_insights             -- AI-generated observations (run nightly, displayed on overview)
investment_accounts     -- per-account investment tracker (seed + tx delta model)
```

Key columns added across phases:
- `categories.budgetSource` — `'manual'` stamps on any human edit; AI skips those in recalibrate
- `recurring_payments.variableAmount` — `true` for electricity-style bills
- `transactions.flaggedReason` — set by anomaly detection

---

## Environment Variables

| Variable | Notes |
|---|---|
| `DATABASE_URL` | Neon Postgres connection string |
| `ENABLE_BANKING_PRIVATE_KEY_BASE64` | Base64 PKCS#8 RSA private key |
| `ENABLE_BANKING_APP_ID` | Enable Banking app ID |
| `ENABLE_BANKING_REDIRECT_URL` | Must match registered callback URL |
| `ENABLE_BANKING_ASPSP_NAME` | e.g. `Lansforsakringar` |
| `ENABLE_BANKING_ASPSP_COUNTRY` | e.g. `SE` |
| `GEMINI_API_KEY` | Google AI Studio key (needs billing enabled) |
| `GEMINI_MODEL` | defaults to `gemini-2.5-flash` |
| `NTFY_SERVER` / `NTFY_TOPIC` | Push notifications |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob (goal images) |
| `CRON_SECRET` | Bearer token for cron route guard |
| `APP_URL` | Public base URL |
| `SITE_PASSWORD` | Optional: enables password lock. Unset = open (dev mode) |
| `FINNHUB_API_KEY` | Stock quotes (candles/quote routes) |

---

## Architecture

### Categorization pipeline (priority order)

1. Self-transfer detection (`src/lib/transfers.ts`) — category = Transfers
2. MCC code lookup
3. Keyword rules (`src/lib/categorize.ts` — `RULES` array)
4. Merchant cache (`merchant_categories` table)
5. Gemini (`geminiCategorize`) — only when `useGemini=true`
6. Default: Uncategorized

Shared engine: `src/lib/categorize-batch.ts` — used by both sync and on-demand `/api/categorize`.

### Budget periods

Salary-cycle-based, not calendar month. A salary = CRDT Income 18k-30k kr. Current cycle = last salary to today (open-ended). Falls back to calendar month if no salary detected. See `src/lib/period.ts`.

### Investment balance model

`currentBalance = seedBalance + sum(DBIT txns ILIKE %name%) - sum(CRDT txns ILIKE %name%)` since `seedDate`.
"Set balance" stamps today as new `seedDate`, resetting the baseline. Merchant matching is ILIKE `%name%` so "LYSA" matches "LYSA AB", "LYSA FONDFÖRSÄKRING" etc.

### Auth / middleware

`middleware.ts` guards all mutating API routes (`POST/PATCH/DELETE /api/*`). If `SITE_PASSWORD` is unset, everything passes. If set, requires a `mwf_session` JWT cookie (set by `/api/auth/unlock`). `AuthProvider` in `app/layout.tsx` intercepts `fetch` globally — on 401 it shows `PasswordModal`, retries after unlock, transparent to all components.

### SQL boot log

`src/db/query-log.ts` uses `AsyncLocalStorage` to capture Drizzle queries per server request. `withQueryLog()` wraps page data-fetching. `<QueryLog>` replays them as a typewriter boot sequence on page load.

### Streaming pattern

Sync, categorize, budget recalibrate, and AI assistant all stream `text/event-stream`-style `ReadableStream` responses. Consumer is `useTypewriter` hook (`app/ui/typewriter.tsx`) which renders lines as they arrive via `TerminalLog`. Final line is always `[DONE]`.

---

## API Routes

| Route | Methods | Notes |
|---|---|---|
| `/api/sync` | GET (cron), POST | Daily sync; Bearer-guarded |
| `/api/sync/manual` | POST | Streaming sync; returns `ReadableStream` |
| `/api/categorize` | POST | Streaming backlog re-categorization |
| `/api/categories` | GET, POST, PATCH, DELETE | PATCH stamps `budgetSource='manual'`; DELETE guards core categories |
| `/api/transactions` | GET | Full query with joins; supports filters |
| `/api/recurring` | GET, POST, PATCH | PATCH accepts `categoryId`, `manual`, `variable` |
| `/api/budget/recalibrate` | POST | Streaming AI budget proposal + apply |
| `/api/investments` | GET, POST, PATCH, DELETE | Investment accounts with computed balances |
| `/api/assistant` | POST | Streaming Gemini conversational assistant |
| `/api/analysis/run` | POST | Nightly AI behavioral analysis batch |
| `/api/insights/ai` | GET | Fetch stored AI insights |
| `/api/goals` | GET, POST | Savings goals |
| `/api/goals/[id]/contributions` | POST | Add contribution |
| `/api/goals/[id]/image` | POST | Vercel Blob upload |
| `/api/savings` | GET, POST | Standalone savings entries |
| `/api/simulate` | POST | What-if simulation |
| `/api/auth/start` | GET | Enable Banking OAuth start |
| `/api/auth/unlock` | POST | Password unlock; sets `mwf_session` cookie |
| `/api/callback` | GET | Enable Banking OAuth callback |
| `/api/maintenance/reclassify` | POST | Bulk transfer reclassification |
| `/api/candles` | GET | Finnhub OHLCV candles |
| `/api/quote` | GET | Finnhub real-time quote |

### Cron schedule (`vercel.json`)

| Time | Route |
|---|---|
| 06:00 daily | `/api/sync` |
| 06:00 every Monday | `/api/sync` |
| 06:30 daily | `/api/analysis/run` |

---

## Pages

| Route | Notes |
|---|---|
| `/` | Overview: sync status, budget summary, AI insights, investments, recent ledger |
| `/transactions` | Full ledger with filters, AI categorize panel |
| `/budgets` | Budget bars (table layout), AI recalibrate panel, salary cycle nav |
| `/insights` | Salary-period comparison, bills checklist, recurring payments table |
| `/goals` | Savings goals list |
| `/goals/[id]` | Goal detail + contributions |
| `/simulate` | What-if budget simulation |
| `/assistant` | Conversational AI terminal |

---

## Key Files

```
src/
  db/
    schema.ts             -- all table definitions + type exports
    index.ts              -- Drizzle singleton (lazy init, SQL query logger)
    seed.ts               -- default categories (12 + Investments + Swish)
    query-log.ts          -- AsyncLocalStorage SQL collector + withQueryLog()
  lib/
    env.ts                -- centralized env access (lazy, typed)
    sync.ts               -- runSync({ useGemini?, onLog? })
    categorize.ts         -- RULES + CATEGORY_NAMES + geminiCategorize()
    categorize-batch.ts   -- shared batch engine used by sync + /api/categorize
    period.ts             -- getSalaryCycle(), getAllSalaryCycles()
    budget.ts             -- getMonthlyBudgetStatus()
    comparison.ts         -- getSalaryComparison(), getMonthComparison()
    savings.ts            -- getPrimaryGoal(), getGoals()
    transfers.ts          -- isSelfTransfer()
    format.ts             -- kr(), krSigned(), shortDate(), pct()
    gemini/
      client.ts           -- geminiModel() factory
      context.ts          -- buildFinancialContext(), formatContext()
      assistant.ts        -- streamAssistant()
      budget.ts           -- proposeBudget(), applyBudgetProposal()
      analysis.ts         -- runBehaviorAnalysis()
    behavior/
      index.ts            -- runBehaviorPipeline(onLog?)
      recurring.ts        -- detectAndPersistRecurrings()
      suspicious.ts       -- flagSuspicious(onLog?)
    enablebanking/
      normalize.ts        -- normalizeMerchant(), counterparty(), mapTransaction()
app/
  ui/
    typewriter.tsx          -- useTypewriter hook, TerminalLog, Spinner, lineColor
    AiConsole.tsx           -- generic streaming console (getBody prop)
    SyncButton.tsx          -- sync trigger with live log
    BudgetBar.tsx           -- table-row budget bar (column-aligned)
    BudgetEditor.tsx        -- category editor with color picker + delete
    RecalibratePanel.tsx    -- AI budget recalibrate with guidance textarea
    LedgerPanel.tsx         -- full client ledger
    RecentLedger.tsx        -- overview ledger (last 10)
    TxRow.tsx               -- transaction row (recurring, variable, anomaly tags)
    CategoryCommand.tsx     -- terminal-style category override
    RecurringActions.tsx    -- MarkRecurring, UnmarkRecurring, BillRow
    RecurringNote.tsx       -- inline recurring note editor
    RecurringCategory.tsx   -- inline recurring category editor
    RecurringTypeToggle.tsx -- fixed/variable toggle
    InvestmentsPanel.tsx    -- investment accounts with live balance computation
    AssistantConsole.tsx    -- AI assistant terminal UI
    AiInsights.tsx          -- AI insight cards
    BudgetCycleNav.tsx      -- salary cycle period navigator
    QueryLog.tsx            -- SQL boot sequence typewriter
    AuthProvider.tsx        -- global fetch 401 interceptor + PasswordModal trigger
    PasswordModal.tsx       -- unlock modal
    TopNav.tsx              -- navigation strip
middleware.ts               -- JWT session guard for all mutating API routes
```

---

## Known Quirks

- **`normalizeMerchant` strips "SWISH"** from the merchant key. Swish transactions must be matched against raw `counterpartyName`, not `merchant`. Category rules for Swish use a special case in `categorize.ts`.
- **Never parallel `edit` the same file** — writes race (last writer wins, silent data loss). Sequence edits or do a single `write` overwrite.
- **`tsc -b --force`** after deletion-style edits — incremental `.tsbuildinfo` cache can mask errors that CI catches on a fresh build.
- **Gemini model must be `gemini-2.5-flash`** (`gemini-2.0-flash` deprecated). Set via `GEMINI_MODEL` env or default in `env.ts`.
- **Gemini billing must be enabled** in Google AI Studio — free tier with `limit: 0` returns empty responses.
- **Node/npm not available in the VM sandbox** — builds and dev server must run on the Windows host.
- **Enable Banking re-auth every 90 days** — `$ re-link bank` button on overview triggers `/api/auth/start`.

---

## Phase Status

| Phase | Status |
|---|---|
| 1 — Core loop (sync, categorize, budgets, ledger) | Complete |
| 2 — Behavior layer (recurring, anomaly, savings, adaptive budgets, salary cycles) | Complete |
| 3 — Gemini intelligence (assistant, AI budget, behavioral analysis, streaming logs) | Complete |
| 4 — Net worth / investments | Partial (see below) |
| 5 — Gamification | Not started |

### Phase 4 progress

- [x] `investment_accounts` table + `phase4.sql` migration
- [x] `/api/investments` — GET (computed balances), POST, PATCH (reset seed), DELETE
- [x] `InvestmentsPanel` on overview — per-account balance, delta annotation, add/edit/delete
- [ ] Klarna debt tracking (balance, due dates, payoff scenarios)
- [ ] Missed deposit reminder + estimated missed gains (ntfy push)
- [ ] Insurance / subscription tracker table

### Phase 5 highlights (not started)

- Streak counter (`[STREAK: 12d]` uptime-style, breaks on overspend)
- "Hours worked" price converter on transactions
- Goal trade-off display ("= 8% of tattoo fund")
- Weekly challenges feeding savings pot
- Terminal-style badge system with progressively dramatic designs
