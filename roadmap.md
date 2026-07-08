# MWFinance -- Roadmap

**Owner:** Maximilian Wikstrom  
**Deployment:** Vercel (`mw-finance-six.vercel.app`)  
**Stack:** Next.js 15 (App Router) + Drizzle ORM + Neon Postgres + Enable Banking + Gemini + ntfy

---

## Design Philosophy

Full retro-CLI aesthetic, applied uniformly. No lighter mode for softer sections -- the terminal/diagnostic-tool look is the whole product.

Inspired by BIOS/UEFI setup screens, `htop`, `neofetch`, old BBS systems, IBM diagnostic terminals, Norton Commander.

Desktop-first. Density, box-drawing borders, and multi-column terminal tables are used freely.

**Typography:** monospace only (JetBrains Mono), tabular figures, uppercase + letter-spacing for labels.

**Color:** single accent phosphor (currently green `#4ec96a`), amber for warnings, red for danger, dim grey for neutral. No gradients, rounded corners, glassmorphism, or soft shadows.

**Elements:** ASCII box-drawing frames every panel. Status glyphs `[OK]` `[FAIL]` `[WARN]` `[DONE]` throughout. ASCII progress bars for budgets and goals. Command-style inputs with `$` / `>` / `--flag` prefixes and blinking cursors.

**Layout:** every screen is a panel set framed like terminal windows with titled header bars `[ PANEL TITLE ]`. Dense, left-aligned. Tables render as terminal output.

---

## Environment Variables

| Variable | Notes |
|---|---|
| `DATABASE_URL` | Neon Postgres connection string |
| `ENABLE_BANKING_PRIVATE_KEY_BASE64` | Base64 PKCS#8 RSA private key (no newlines) |
| `ENABLE_BANKING_APP_ID` | Enable Banking application ID |
| `ENABLE_BANKING_REDIRECT_URL` | Must match the registered callback URL |
| `ENABLE_BANKING_ASPSP_NAME` | e.g. `Lansforsakringar` |
| `ENABLE_BANKING_ASPSP_COUNTRY` | e.g. `SE` |
| `GEMINI_API_KEY` | Google AI Studio, free tier |
| `GEMINI_MODEL` | defaults to `gemini-2.0-flash` |
| `NTFY_SERVER` / `NTFY_TOPIC` | push notifications |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob (goal images) |
| `CRON_SECRET` | Bearer token for `/api/sync` cron guard |
| `APP_URL` | public base URL |

---

## Data Architecture

ORM: Drizzle (`src/db/schema.ts`). DB: Neon Postgres (serverless HTTP driver).  
Money stored as `numeric(14,2)`. All queries cast to float at the boundary.

### Current Schema

```
bank_sessions         -- one per successful Enable Banking consent
accounts              -- linked accounts (uid = Enable Banking account uid)
categories            -- spending categories with color swatch + optional budgets
transactions          -- all fetched transactions, deduped on (account_uid, dedupe_key)
merchant_categories   -- learned merchant->category cache (source: rule|gemini|manual)
recurring_payments    -- auto-detected + manually-marked recurring payments
savings_goals         -- savings targets (images via Vercel Blob)
savings_contributions -- manual or auto-sweep contributions to goals
savings_entries       -- standalone manual savings additions (not linked to a goal)
budget_adjustments    -- adaptive per-month signed deltas on category budgets
settings              -- single-row app config (sweep %, adaptive caps)
sync_runs             -- audit log; also drives the monthly-sweep rollover check
```

New tables vs the Phase 1 baseline: `savings_entries` (Phase 2).  
Key columns added in Phase 2: `transactions.flagged_reason`, `recurring_payments.cadence_days`, `recurring_payments.last_date`, `recurring_payments.occurrences`.

### Categorization Pipeline

1. Self-transfer detection (`src/lib/transfers.ts`) -- highest priority. Matches by counterparty name or account number digits. Sets category = Transfers.
2. MCC code lookup
3. Keyword rules (`src/lib/categorize.ts`) -- merchant/remittance string matching
4. Merchant cache (`merchant_categories` table)
5. Gemini 2.0 Flash (only when `useGemini=true`, i.e. manual sync or weekly cron)
6. Default: Uncategorized

Manual overrides propagate immediately to all transactions sharing the same normalized merchant.

### Salary Cycle (`src/lib/period.ts`)

Budget periods are salary-cycle-based, not calendar-month. A salary transaction is any CRDT Income entry with amount 18,000--30,000 kr (configurable constants `SALARY_MIN` / `SALARY_MAX`). The current cycle runs from the most recent salary to the next one; the open/current cycle is unbounded upward (to=null means "up to today"). Falls back to the calendar month when no salary transactions exist.

---

## Feature Roadmap

### Phase 1 -- Core Loop -- [DONE]

- [x] Enable Banking sync via Vercel cron (4--6h) and manual trigger
- [x] Auto-categorization: MCC + keyword rules -> Gemini fallback -> per-merchant cache
- [x] Manual category override from the ledger -- updates cache, auto-applies to all same-merchant transactions
- [x] Weekly and monthly budget per category -- ASCII progress bars
- [x] Real-time ntfy budget alerts: "Pizza -100kr -> 400kr left of 500kr food budget"
- [x] Account balance tracking with STALE / OK status
- [x] Full terminal/CLI aesthetic with green phosphor accent

### Phase 2 -- Behavior Layer -- [DONE]

**Originally scoped:**
- [x] Recurring payment auto-detection (amount + cadence consistency, >=3 occurrences)
- [x] Missing-payment alerts -- bills checklist with [OK]/[!]/OVERDUE glyphs on /insights
- [x] Suspicious payment flagging -- [!] ANOMALY tag, `flagged_reason` persisted
- [x] Savings goals with Vercel Blob images, time-to-goal projection (3-month velocity)
- [x] Auto-sweep of prior-month slack to primary savings goal
- [x] Live/adaptive budgeting: large purchase tightens other categories
- [x] What-if simulation on /simulate
- [x] Early-warning trajectory push past day 10 when projected >110% of budget
- [x] Month-over-month and week-over-week spend comparison on /insights
- [x] Bills checklist (paid / due / overdue / upcoming)

**Additional features built in this session:**
- [x] Category drill-down: click any budget row to expand its transactions for the period
- [x] Savings total panel (SavingsPanel) with manual entry form on the overview
- [x] Savings category with LYSA keyword rule
- [x] Recurring propagation: [check] RECURRING tag live-derived via EXISTS on active recurring_payments.merchant; tag is a button that unmarks by soft-deleting the recurring entry
- [x] Self-transfer detection and handling: `src/lib/transfers.ts` matches counterparty name and account number; Transfers excluded from in/out totals and all budget calculations
- [x] One-time reclassify endpoint: POST /api/maintenance/reclassify
- [x] Salary-cycle budget periods: budget "month" runs from last salary to next salary, not calendar month
- [x] Ledger --lon period filter: dropdown listing each detected salary cycle
- [x] Sync now always re-links via BankID first (ASPSP consent requires it); autoSync cookie flow carries intent through the redirect; auto-triggers sync and shows logs on return
- [x] Extensive sync logs: per-source categorization counts (rule/cache/ai/default), per-transaction detail for small batches
- [x] Recent Ledger on overview is a client component calling /api/transactions -- same code path as the full ledger, so recurring flags, category edits, and mark/unmark all work identically
- [x] Insights color logic: spending increases = red (bad), Savings decrease = red (reversed), Transfers hidden from comparison tables and totals
- [x] Merchant category propagation: manual override updates ALL transactions with that merchant (past + future)
- [x] Progress bar color matches the category color swatch
- [x] Green accent color throughout (was amber)
- [x] Dark native select/option styling
- [x] Consistent prompt box layout (min-h-[2rem], items-center)

**Deferred:**
- [ ] Receipt ingestion (Kivra/ICA/photo) and email parsing -- no viable API, out of scope

### Phase 3 -- Intelligence (Gemini API) -- [NEXT]

All AI interactions use the same console-style log rendering already built for sync:
`[AI] > ...` lines with `[check]`/`[!]` results and a `[DONE]` summary.

- [ ] Conversational Gemini assistant on a dedicated /assistant page: explains spending, answers questions about your finances. Rendered as terminal console output with `>` prompt and monospace response, not chat bubbles.
- [ ] Personalized savings suggestions based on learned habits
- [ ] Behavioral pattern analysis: identify harmful spending patterns, suggest concrete fixes
- [ ] Weekly batch job (nightly or triggered manually) that runs across all recent transactions, generates a summary, and pushes key insights via ntfy
- [ ] Manual trigger with live streaming console output (extend the existing SyncButton pattern)
- [ ] Model: `gemini-2.0-flash` -- free tier covers personal-scale runs

### Phase 4 -- Net Worth

- [ ] Investment tracking: LF funds, Avanza, Lysa (auto if API available, manual fallback)
- [ ] Missed Lysa deposit reminder + missed-gains estimate
- [ ] Debt tracking (Klarna): balance, due dates, payoff scenarios
- [ ] Insurance and subscription audit table

### Phase 5 -- Gamification

Terminal-native treatment. Direct status tags, no softened language.

- [ ] Convert prices to hours-worked equivalent
- [ ] Live trade-off vs savings goal ("this 200kr dinner = 8% of your tattoo fund")
- [ ] 24-hour cooling-off nudge for discretionary purchases above a threshold
- [ ] Pay yourself first: auto-sweep on income arrival
- [ ] Loss-aversion streaks: protect the streak, not earn it. Counter styled like uptime.
- [ ] Variable/surprise bonuses for good weeks
- [ ] Levels, achievements, badges -- terminal-styled, progressively more dramatic

### Phase 6 -- Lifestyle Extras

- [ ] Weekend/event suggestions: web search for cheap Stockholm events, rendered as ASCII-framed cards with image, title, date/time, and one-tap calendar add

### Phase 7 -- SaaS (optional)

- [ ] Multi-tenant auth and data isolation
- [ ] Move to Enable Banking production mode (requires KYB)
- [ ] Subscription model

---

## Tech Stack (Resolved)

| Decision | Choice |
|---|---|
| Frontend | Next.js 15 App Router |
| Platform | Web-only, desktop-first |
| ORM | Drizzle ORM |
| Database | Neon Postgres (serverless HTTP) |
| Categorization | Rules + Gemini fallback + merchant cache |
| Gemini cadence | Weekly batch (free tier safe) + manual trigger |
| Notifications | ntfy for alerts, possibly Resend for weekly digest |
| Storage | Vercel Blob for goal images |
