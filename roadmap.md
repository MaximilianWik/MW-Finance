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

### Phase 1 — Core Loop (build first) — ✅ DONE
- ✅ Enable Banking sync: poll transactions every 4–6h via Vercel cron, store in Postgres. Renders as terminal-panel `[ ACCOUNT SYNC ]` with `[ OK ]`/`[ STALE ]` status per account.
- ✅ Auto-categorization: MCC + keyword rules → Gemini fallback → per-merchant cache.
- ✅ Manual override for uncategorized transactions — remembers + auto-matches future occurrences. Override UI is a `>` command-style row action (`CategoryCommand`), not a dropdown.
- ✅ Weekly and monthly budget per category — rendered as ASCII progress bars (`[████████░░░░] 67%`) per category.
- ✅ Real-time spend notifications via ntfy: "Pizza –100 kr → 400 kr left of 500 kr food budget".

### Phase 2 — Behavior Layer — ✅ DONE (ingestion deferred)
- ✅ Recurring payment detection (amount + cadence consistency) + missing-payment alert — bills checklist panel with `[✓]`/`[ ]`/`[!]` glyphs on `/insights`.
- ✅ Suspicious payment flagging — `[!] ANOMALY` tag, red accent, priority-5 push; persisted to `transactions.flagged_reason`.
- ✅ Savings goals with attached images (Vercel Blob), auto-sweep of prior-month slack → primary goal — image in a titled ASCII frame with progress bar beneath.
- ✅ Time-to-goal projections (3-month rolling velocity).
- ✅ Live/adaptive budgeting: a large purchase tightens other categories (`budget_adjustments`, net-zero redistribution).
- ✅ "What-if" simulation — rendered as a terminal diff view (`- groceries: 500kr` / `+ groceries: 420kr`) on `/simulate`.
- ✅ Early-warning trajectory — `[WARN] TRAJECTORY` push past day 10 when projected > 110% of budget.
- ✅ Month-over-month and week-over-week comparisons — terminal tables with aligned Δkr / Δ% columns on `/insights`.
- ✅ Checklist for recurring payments (paid / due / overdue / upcoming this month) — `[✓]`/`[!]` styling.
- ✅ Salary-cycle budget periods — budget "month" runs from last LÖN salary to the next (detected as Income 18k–30k kr), not calendar month. Falls back to calendar when no salary detected.
- ✅ Ledger LÖN period filter — dropdown listing each detected salary cycle; queries by `from`/`to` date range.
- ✅ Category drill-down — click any budget row to expand its transactions for the current period inline.
- ✅ Savings total panel (`SavingsPanel`) — all-time running total (auto from Savings category + manual entries), inline add form on the overview.
- ✅ Savings category — `LYSA` keyword rule; seeded at sort 95 between Income and Transfers.
- ✅ Recurring propagation live tag — `[✓] RECURRING` derived live via `EXISTS` on `recurring_payments.merchant`; tag is a clickable `UnmarkRecurring` button that soft-deletes the entry without a separate UI.
- ✅ Self-transfer detection (`src/lib/transfers.ts`) — matches by counterparty name substring or account-number digits. Applied first in `categorizeInserted`. Transfers excluded from: in/out ledger totals, monthly budget `totalSpent`, comparison tables, and budget row display.
- ✅ Merchant category propagation — manual category override now propagates immediately to all past and future transactions sharing the same normalized merchant.
- ✅ Recent Ledger on overview is a client component calling `/api/transactions` — same code path as the full ledger, so recurring flags, category edits, and mark/unmark all work identically.
- ✅ BudgetBar category-colored progress bars — bar fill color matches the category color swatch.
- ✅ Insights color logic — spending increases shown red (bad); Savings decrease shown red (reversed semantics); Transfers hidden from comparison tables and totals.
- ✅ Sync now always re-links via BankID first — `autoSync` cookie survives the redirect; on return, `SyncButton` auto-triggers sync and shows full logs. Sync logs include per-source categorization counts (rule / cache / ai / default) and per-transaction detail for small batches.
- ✅ Green phosphor accent color (`#4ec96a`) throughout — replaced amber.
- ✅ Dark native select/option styling (`color-scheme: dark` per element, explicit `option` background).
- ✅ Consistent prompt form layout (`min-h-[2rem]`, `items-center`) — eliminates sigil/input misalignment.
- ⏸ Receipt ingestion (Kivra/ICA/photo) and email parsing — **deferred**. No public consumer API for Kivra/ICA; photo OCR + email parsing intentionally out of scope for now.

### Phase 3 — Intelligence (Gemini API)
- Conversational assistant: explains the app, walks through your finances — rendered as terminal console output with `>` prompt for input, monospace response text, no chat bubbles
- Personalized savings suggestions based on learned habits
- Behavioral analysis: identify harmful spending patterns, suggest concrete fixes
- Anomaly detection for invoices/payments that look off
- Run as a scheduled batch job (nightly or weekly) — not live per transaction. Offer manual trigger on top.
- Model: `gemini-2.0-flash` — free tier covers personal-scale batch runs indefinitely
- AI payment categorization: runs in the batch job and also whenever user presses "sync now." **This is the aesthetic's centerpiece** — a live scrolling console log showing each transaction being categorized in real time (see example log under Design Philosophy above), with per-line `[✓]`/`[!]` results and a final `[DONE]` summary with elapsed time.
- AI should be the one setting the actual budget. It has to identify income, understand the spending categories, habits, understand recurring payments, bills etc. Then there should be a button for AI to recalibrate budget as it learns more and recurring payments/bills are added/removed. Add new categories, understand user-added categories. Be aware of manual changes to budgets. This should also be an aesthetic centerpiece where the AI's reasoning is displayed and then logs of setting the budget.
- The AI should power the live/adaptive budgeting: a large purchase tightens other categories (`budget_adjustments`, net-zero redistribution). And suspicious payment flagging — `[!] ANOMALY` tag, red accent, priority-5 push; persisted to `transactions.flagged_reason`.
- There should also be a way to mark all payments to a certain receiver as recurring for variable-price recurring payments — for example electricity is recurring but at a variable price; this should be recognized and handled correctly.
- ✅ When a certain unknown transaction from a receiver has been categorized, this should be remembered for upcoming transactions from that same sender/receiver and auto-applied to that category. e.g. a transaction of –9 000 kr to "cleo langell" marked as Bills → every future transaction to cleo langell is automatically marked as Bills. **(Done in Phase 2 PATCH propagation.)**

### Phase 4 — Net Worth View
- Investment tracking: LF funds, Avanza, Lysa — pulled automatically if possible, manually entered otherwise
- Missed Lysa deposit reminder + "missed gains" estimate based on historical performance
- Debt tracking (Klarna): balance, due dates, payoff scenarios
- Insurance and subscription tracker (insurances, a-kassa, Akavia, phone plan, etc.) — doubles as a subscription audit, rendered as a terminal table

### Phase 5 — Gamification (layer on top of phases 1–4, not instead of them)

> Points/badges alone wear off within weeks. What actually works: immediate feedback + friction on impulse spend + loss aversion. Gamification amplifies these — it does not replace them.

Full diagnostic-terminal treatment applies here too — no softened visual language needed. Streaks, overspend, and missed goals can use direct status tags (`[STREAK: 12d]`, `[BROKEN]`, `[OVER BUDGET]`) rather than friendlier phrasing.

**Make spending feel real**
- Convert prices to hours-worked equivalent ("this shirt = 3.2 hours of work")
- Show live trade-offs against goals: "this 200 kr dinner = 8% of your tattoo fund"
- Post-purchase micro-reflection: one-tap prompt after a Wants purchase — "still glad you got this?" (awareness, not guilt)

**Add friction to impulse spend, not to saving**
- 24-hour cooling-off nudge for discretionary purchases over a set threshold — don't block it, just delay the notification
- "Pay yourself first": auto-sweep savings the moment income lands, before it's visible as spendable
- Round-up savings: round purchases up to nearest 10 kr, sweep the difference

**Loss aversion over reward framing**
- Frame streaks as something to protect ("don't break your 12-day streak") rather than earn — `[STREAK: 12d]` counter styled like an uptime counter
- Category surpluses roll into a visible "saved this week" pot — losing it via overspend feels like losing real money
- Variable/surprise bonuses for good weeks (more engaging long-term than fixed, predictable rewards)

**Mechanics**
- Levels, streaks, achievements tied to staying under budget — rendered as terminal-style badges/log entries rather than icon-badge graphics, each badge unique in color and design, progressively more dramatic and cool looking.
- Weekly challenges ("no-spend Tuesday," "cook at home 4x this week") — completion feeds directly into savings pot
- Visual indicators of what the saved total could buy

### Phase 6 — Lifestyle Extras
- Weekend/date suggestions: web search ahead of the weekend filtered to free/cheap Stockholm events (concerts, etc.) — show title, link, date/time, optional image; one-tap add to calendar. Each suggestion rendered as an ASCII-framed card wrapping a normal event image.

### Phase 7 — SaaS (if you go there)
Much bigger lift than the personal version:
- Proper multi-tenant auth and data isolation
- Move off Enable Banking Restricted mode to full production (requires KYB/company verification)
- Stricter data-handling and compliance (financial data + multiple users)
- Subscription model
- Design system stays consistent, but a lighter onboarding flow (still monospace/terminal-styled) may be worth testing for first-time non-technical users, since a cold SaaS signup audience won't share Max's tolerance for density that a personal single-user tool can assume