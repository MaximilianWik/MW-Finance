# MWFinance -- Phase 3 Handover

This document gives the complete technical context for starting Phase 3 in a new session.
Read it in full before writing any code.

---

## Project Identity

- **App:** MWFinance -- personal finance terminal for Maximilian Wikstrom
- **Deployment:** Vercel, auto-deploys on push to `main`
- **Production URL:** `mw-finance-six.vercel.app`
- **Repo:** GitHub Desktop is used for commits. Two separate fenced code blocks per commit: subject (one-liner) + body (bulleted). Do NOT use em-dashes in authored prose.
- **DB:** Neon Postgres, managed via the Neon web console
- **Owner:** Maximilian Wikstrom (`max.wik@icloud.com`, `+46707360515`)

---

## Dev Environment Quirks

The RAIWork `bash` tool runs **Windows PowerShell 5.1** on the host, NOT a Linux VM.

Critical implications:
- `&&` does not work as a separator; use `;` or separate bash calls
- `find`, `grep`, `cat` etc. are NOT available; use PowerShell equivalents or `Select-String`, `Get-Content`
- `npm`, `node`, `tsc` are NOT on the PATH in the bash tool. Typecheck must be run manually by the user in their own terminal.
- The `read` and `write` tools from the editor time out on the Windows mount. Use `[IO.File]::ReadAllText` / `[IO.File]::WriteAllText` via PowerShell for all file I/O.
- Always write files as UTF-8 without BOM: `[Text.UTF8Encoding]::new($false)`.
- Use single-quoted PowerShell here-strings `@'...'@` for file content -- backticks and `${}` are literal inside them. Avoid non-ASCII characters in here-string content (use `\uXXXX` in TypeScript/JS strings instead).
- Never edit the same file in parallel (race condition on read->write).

---

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15 App Router |
| Language | TypeScript (strict mode) |
| ORM | Drizzle ORM (`drizzle-orm`, `drizzle-kit`) |
| Database | Neon Postgres (serverless HTTP, `@neondatabase/serverless`) |
| Auth | Enable Banking OAuth2 + RS256 JWT (`jose`) |
| AI | Gemini 2.0 Flash (`@google/generative-ai`) |
| Storage | Vercel Blob (`@vercel/blob`) |
| Notifications | ntfy (HTTP POST) |
| Styling | Tailwind CSS v3 + custom globals.css |
| Deploy | Vercel (auto-deploys from Git `main`) |

---

## Design System

- **Accent color:** `#4ec96a` (green phosphor, `colors.accent` in tailwind.config.js)
- **OK/success:** same `#4ec96a` (`colors.ok`)
- **Danger:** `#e85252` (`colors.danger`)
- **Amber/warning:** `#e8c545` (`colors.amber`)
- **Background:** `#0c0c0f` (`colors.ink`), panels `#101014` (`colors.panel`), inputs `#161619` (`colors.panel2`)
- **Muted text:** `#72728a`, faint `#454552`
- **Accent2 (cyan):** `#5cc8e8` for secondary highlights and links
- Font: JetBrains Mono (monospace only)
- Panel frames: `┌─[ TITLE ]...` ASCII box-drawing, implemented in `.panel` CSS class
- All buttons: `.btn` class. Primary: `.btn-accent`. Danger: `.btn-danger`.
- Status tags: `.tag .tag-ok`, `.tag .tag-warn`, `.tag .tag-danger`, `.tag .tag-muted`
- Progress bars: `AsciiBar` component, accepts `barColor` for category-colored fills
- Form inputs/selects: `.prompt` class (`min-h-[2rem]`, flex, dark border). `.prompt > span.sigil` for `--flag` style labels.
- All filter forms use `flex flex-wrap items-center gap-2` (NOT `items-end`).

---

## Database Schema (Full)

Tables in `src/db/schema.ts`:

```
bank_sessions           session_id PK, aspsp_name, aspsp_country, psu_type, valid_until
accounts                uid PK, session_id FK, name, iban, currency, balance, ...
categories              id PK, name UNIQUE, color, budget_monthly, budget_weekly, sort
transactions            id PK, account_uid FK, dedupe_key UNIQUE(account_uid, dedupe_key),
                        direction (CRDT|DBIT), amount, signed, currency, booking_date,
                        remittance, counterparty_name, merchant, mcc,
                        category_id FK, category_source (rule|gemini|cache|manual|default),
                        flagged_reason, raw jsonb
merchant_categories     merchant PK, category_id FK, source, updated_at
recurring_payments      id PK, merchant UNIQUE, amount, cadence, cadence_days, last_date,
                        next_date, occurrences, category_id FK, manual, active
savings_goals           id PK, name, target_amount, current_amount, currency,
                        target_date, image_url, is_primary, paused
savings_contributions   id PK, goal_id FK, amount, source (manual|sweep), month (YYYY-MM), note
savings_entries         id PK, amount, note, occurred_on date, created_at
budget_adjustments      id PK, category_id FK, month (YYYY-MM), delta, reason
settings                key PK default 'singleton', sweep_percent, adaptive_cap_percent,
                        adaptive_trigger_percent
sync_runs               id PK, started_at, finished_at, new_transactions, ok, error
```

Seeded categories (in sort order):
Groceries, Restaurants, Transport, Shopping, Bills & Utilities, Entertainment,
Health, Cash & ATM, Income, Savings (sort 95), Transfers (sort 100), Uncategorized (sort 999)

---

## File Structure

```
app/
  page.tsx              Overview dashboard (server component)
  layout.tsx            Root layout with TopNav and BottomNav
  budgets/page.tsx      Budget page (monthly + weekly panels, edit)
  goals/page.tsx        Savings goals list
  goals/[id]/page.tsx   Single goal detail
  insights/page.tsx     MoM/WoW comparison, bills checklist, recurring list
  simulate/page.tsx     What-if simulator
  transactions/page.tsx Full ledger with all filters
  actions.ts            Server actions (category override)
  globals.css           Tailwind base + component classes
  api/
    auth/start/         GET: begin BankID consent, set autoSync cookie if ?autoSync=1
    callback/           GET: exchange OAuth code, persist session, redirect
    sync/               GET|POST: cron target (guarded by CRON_SECRET)
    sync/manual/        POST: dashboard trigger (no auth)
    transactions/       GET: list with filters; PATCH: category override + propagation
    categories/         GET/PATCH/POST
    recurring/          GET/POST/PATCH/DELETE (supports ?merchant= for DELETE)
    savings/            GET/POST/DELETE (savings_entries)
    goals/              GET/POST
    goals/[id]/         PATCH/DELETE
    goals/[id]/contributions/   GET/POST
    goals/[id]/image/   POST (Vercel Blob upload)
    simulate/           POST
    maintenance/reclassify/  POST: backfill self-transfer categorization
  ui/
    SyncButton.tsx      Always re-links first; detects ?autoSync=1 on return
    LedgerPanel.tsx     Full ledger (filters, query log, LÖN period dropdown, recurring)
    RecentLedger.tsx    Overview recent ledger (client, calls /api/transactions)
    BudgetBar.tsx       Budget row with category-colored AsciiBar, click-to-drill
    BudgetEditor.tsx    Inline budget limit editor
    SavingsPanel.tsx    All-time savings total + manual entry form
    AsciiBar.tsx        Progress bar; barColor prop for category color override
    TxRow.tsx           Single transaction row (server component)
    CategoryCommand.tsx Inline category override picker
    CategorySelect.tsx  Dropdown category selector
    RecurringActions.tsx  MarkRecurring, UnmarkRecurring, BillRow
    StatusTag.tsx       [OK] / [FAIL] / [WARN] status tags
    Panel.tsx           Titled ASCII-framed panel
    TopNav.tsx          Site navigation
    BottomNav.tsx       Mobile navigation
    ...
src/
  db/
    schema.ts           Drizzle table definitions + type exports
    index.ts            Lazy Neon DB initialization
    seed.ts             Category seed script
  lib/
    budget.ts           getMonthlyBudgetStatus (salary-cycle period), getWeeklyBudgetStatus
    categorize.ts       CATEGORY_NAMES, ruleCategory, geminiCategorize
    comparison.ts       getMonthComparison, getWeekComparison
    env.ts              Validated env vars
    format.ts           kr(), krSigned(), shortDate(), pct()
    notify.ts           ntfy push
    period.ts           getSalaryCycle, getAllSalaryCycles (salary-based budget periods)
    queries.ts          getAccounts, getCategories, listTransactions
    savings.ts          Goals, contributions, sweep, getSavingsTotal, addSavingsEntry
    simulate.ts         What-if budget simulation
    sync.ts             runSync (full orchestration)
    transfers.ts        isSelfTransfer (SELF_NAMES, SELF_ACCOUNT_NUMBERS)
    behavior/
      index.ts          runBehaviorPipeline
      adaptive.ts       Adaptive budget redistribution
      checklist.ts      Bills checklist computation
      missing.ts        Missing payment detection
      recurring.ts      Auto-detect recurring payments
      suspicious.ts     Anomaly flagging
      trajectory.ts     Spend trajectory projection
    enablebanking/
      client.ts         API client (startAuth, createSession, getTransactions, getBalances)
      jwt.ts            RS256 JWT signer (cached key)
      normalize.ts      Raw tx -> DB row (normalizeMerchant, mapTransaction)
      types.ts          Enable Banking API types
drizzle/
  migrations/
    phase2.sql          Idempotent Phase 2 migration (savings_entries + Phase 2 columns)
drizzle.config.ts
tailwind.config.js      Color palette (accent: #4ec96a, ok: #4ec96a, danger, amber, etc.)
vercel.json             Cron schedule definitions
```

---

## Critical Patterns

### Salary Cycle Period (`src/lib/period.ts`)
Budget "months" are salary-cycle-based. A salary = any CRDT + Income category + amount between SALARY_MIN (18000) and SALARY_MAX (30000) kr. `getSalaryCycle(ref)` finds the most recent salary <= ref as `from`, the next salary as implied `to` (day before it). Open/ongoing cycle has `to=null`. Falls back to calendar month when no salary exists. `getAllSalaryCycles()` returns all cycles (latest first) for the ledger filter dropdown.

### Self-Transfer Detection (`src/lib/transfers.ts`)
`isSelfTransfer({counterpartyName, remittance, merchant})` returns true for own-account transfers. Matches by name substring (`SELF_NAMES`, case-insensitive) or by account number digits (`SELF_ACCOUNT_NUMBERS` = `['90238107290']`). This runs FIRST in `categorizeInserted` (highest priority). Transfers excluded from budget totals (budget.ts), ledger in/out totals (NOT EXISTS subquery in route + queries.ts), and comparison tables (comparison.ts filter).

### neon-http Boolean Coercion
The neon-http driver in the Next.js server-component path returns Postgres `boolean` results as truthy strings rather than real JS booleans. The fix: cast EXISTS subqueries to `::int` and coerce with `Number(x) === 1`. See `transactions route + queries.ts listTransactions` for the `recurring` flag. Both do: `sql<number>\`(exists (...))::int\`` then `rows.map(r => ({...r, recurring: Number(r.recurring) === 1}))`.

### Merchant Category Propagation
`PATCH /api/transactions` (category override) updates the clicked row, writes the merchant cache, and then does `db.update(transactions).where(eq(merchant, ...))` to update ALL transactions sharing that merchant. This means one override fixes past and future rows.

### Sync Always Re-Links
`SyncButton` click -> navigates to `/api/auth/start?autoSync=1` -> BankID -> callback sets `?autoSync=1` on return URL -> `useEffect` in SyncButton detects it, strips from URL, calls `run()`. See `app/ui/SyncButton.tsx`, `app/api/auth/start/route.ts`, `app/api/callback/route.ts`.

### Category Color on Progress Bar
`BudgetBar` passes `barColor={row.color}` to `AsciiBar`. `AsciiBar` uses inline `style={{ color: barColor }}` for the filled portion when `barColor` is provided, overriding the ratio-derived Tailwind class.

### Comparison Table Color Logic
`insights/page.tsx` `trendColor(delta, reversed)`. Normal: positive delta (spent more) = red, negative = green. Reversed (Savings): positive delta = green, negative = red. Transfers filtered out in `comparison.ts` before totals are computed.

---

## Phase 3 Specification

From the roadmap, Phase 3 adds a Gemini-powered conversational assistant and behavioral analysis layer.

**Core deliverables:**

1. **Conversational assistant** on `/assistant`:
   - User types questions about their finances
   - Gemini receives the question + relevant financial context (spending summary, recent transactions, budget status, goals)
   - Response rendered as terminal console output: monospace, `>` prompt for input, `[AI] ...` prefixed lines for the response
   - No chat bubbles -- full CLI aesthetic matching the existing sync console
   
2. **Behavioral analysis batch job:**
   - Weekly or on-demand trigger (extend the existing sync/manual pattern)
   - Analyzes recent transactions for patterns: impulse spending, category trends, missed savings opportunities
   - Produces structured insights stored to a new `ai_insights` table
   - Surfaces key insights on the overview or insights page as terminal log entries
   
3. **Personalized savings suggestions:**
   - Based on detected patterns and surplus identification
   - Rendered as terminal-style suggestion cards
   
4. **Enhanced anomaly detection** (extend existing `flagged_reason`):
   - Cross-reference with recurring patterns to flag unexpected charges
   - Merchant-level anomaly: price changed significantly from previous occurrences

**Model:** `gemini-2.0-flash` (already in env as `GEMINI_MODEL`). Free tier.

**Key constraint:** AI responses must match the terminal aesthetic exactly. No soft language, no chat bubbles. Everything is `[AI] line content` format. The existing sync log renderer in `SyncButton` is the reference implementation.

**Suggested new files:**
- `src/lib/gemini/assistant.ts` -- chat/completion wrapper with financial context injection
- `src/lib/gemini/analysis.ts` -- batch behavioral analysis
- `app/assistant/page.tsx` -- conversational UI
- `app/api/assistant/route.ts` -- streaming or batch endpoint
- DB: new `ai_insights` table for persisting analysis results

---

## Known Issues and Tech Debt

- `npm run typecheck` cannot be run from the bash tool (no Node on PATH). Must be run manually by the user.
- The Phase 2 SQL migration (`drizzle/migrations/phase2.sql`) and `npm run db:seed` must be applied manually by the user against Neon.
- `POST /api/maintenance/reclassify` should be called once after deployment to backfill self-transfer categorization on historical transactions.
- The salary cycle constants `SALARY_MIN` / `SALARY_MAX` (18000-30000) are hardcoded in `src/lib/period.ts`. If salary changes outside this range, the period detection will break silently and fall back to calendar month.
- Recurring auto-detection (`behavior/recurring.ts`) requires >= 3 consistent charges. New accounts start with no recurring entries until enough history accumulates.
- The Vercel cron (`/api/sync` every 6h) requires Vercel Pro for sub-daily frequency. On Hobby plan, change to daily.
- Enable Banking ASPSP consent (Lansforsakringar) expires frequently, which is why sync always re-links first.

---

## Deployment Checklist

1. Push to Git -> Vercel auto-deploys
2. Verify env vars in Vercel project settings
3. Run `npm run db:push` and `npm run db:seed` against prod Neon DB (locally, with `DATABASE_URL` pointing to prod)
4. Apply `drizzle/migrations/phase2.sql` in Neon SQL console
5. Call `POST /api/maintenance/reclassify` once (or add a button to the UI)
6. Verify sync works: click "$ sync now" -> BankID -> confirm transactions appear

---

## Useful One-Liners (PowerShell)

```powershell
# read a file
[IO.File]::ReadAllText((Join-Path $PWD.Path "path\to\file"), [Text.Encoding]::UTF8)

# write a file (UTF-8, no BOM)
[IO.File]::WriteAllText((Join-Path $PWD.Path "path\to\file"), $content, [Text.UTF8Encoding]::new($false))

# targeted find-and-replace (use single-quoted here-strings for old/new)
$old = @'exact old text'@
$new = @'exact new text'@
$f = Join-Path $PWD.Path "path\to\file"
$c = [IO.File]::ReadAllText($f, [Text.Encoding]::UTF8)
$c = $c.Replace($old, $new)
[IO.File]::WriteAllText($f, $c, [Text.UTF8Encoding]::new($false))

# check match count before replacing
([regex]::Matches($c, [regex]::Escape($old))).Count
```
