# MWFinance — Project Starter

## What This Is

Personal budgeting app connected to Länsförsäkringar Bank via Open Banking API. Auto-categorizes spending, manages budgets in real time, nudges toward saving, and layers in AI-driven insights. Long-term stretch goal: multi-user SaaS.

**Domain/deployment**: `mw-finance-six.vercel.app` (Vercel, web-first — no native/PWA compromise needed)
**Owner**: Maximilian Wikström

---

## Design Philosophy

**Full technically-advanced retro-CLI aesthetic, applied uniformly across the entire app.** No "lighter mode" for softer sections — the terminal/diagnostic-tool look is the whole product, not a skin on top of a conventional dashboard. Inspired by BIOS/UEFI setup screens, `htop`/`btop`, `neofetch`, old BBS systems, IBM diagnostic terminals, Norton Commander dual-pane layouts.

This is a desktop-first website, not a mobile app — so density, box-drawing borders, and multi-column terminal tables are used freely without needing to degrade for small screens. The goal is a tool that looks like it was built by someone who lives in a terminal, not a costume of one.

**Typography**
- Monospace only, everywhere: chrome, labels, body text, chat responses, numbers (JetBrains Mono, IBM Plex Mono, or Berkeley Mono)
- Tabular figures for all financial columns — amounts, balances, percentages always align
- Uppercase + letter-spacing for section headers and system-style labels (`SYSTEM STATUS`, `ACCOUNT SYNC`)

**ASCII Elements**
- ASCII box-drawing (`┌─┐│└─┘`, `╔═╗║╚═╝`) frames every panel, card, and modal — including savings goal images and weekend-suggestion cards, which sit inside a normal image rect wrapped in a titled ASCII frame (e.g. `┌─[ GOAL: TATTOO FUND ]─────┐`)
- ASCII progress bars everywhere numeric progress applies: budgets, savings goals, sync jobs (`[████████░░░░] 67%`)
- Status glyphs instead of icon sets: `[✓]` `[×]` `[!]` `▲▼` `»`
- Diagnostic-style status tags used freely, including for gamification: `[STREAK: 12d]`, `[OVER BUDGET]`, `[ON TRACK]` — no need to soften language into friendlier phrasing
- See ASCII-examples.md file in directory for cybersigilism ASCII art that could be used as background decorations / Headers. 

**Color Palette**
- Dark terminal background (`#0a0e0a` / `#0d1117`)
- One accent phosphor color for primary actions and highlights — green, amber, or cyan
- Status colors desaturated but can be direct: red for over-budget/failed, yellow for warnings, green for on-track — diagnostic honesty over reassurance
- Optional low-opacity scanline/CRT texture, must not compromise legibility

**Layout**
- Every screen is a panel or set of panels framed like terminal windows with titled header bars: `┌─[ ACCOUNT OVERVIEW ]───────────┐`
- Dense, left-aligned information hierarchy — no SaaS-style whitespace padding
- Command-style input everywhere it fits: search, category overrides, "sync now" trigger — styled with a `>` or `$` prompt prefix and blinking cursor
- Tables render as terminal output: monospace alignment, ASCII rule lines between rows, no card-based row styling

**The AI/sync console (Phase 3) is the aesthetic's centerpiece** — a live, scrolling log view for both the nightly Gemini batch job and manual "sync now" triggers:
```
[SYNC] connecting to Enable Banking...           [ OK ]
[SYNC] polling account 3/4...                    [ OK ]
[AI]   categorizing 14 uncategorized txns...
[AI]   > ICA MAXI 249kr        → groceries        [✓]
[AI]   > SPOTIFY 119kr         → subscriptions     [✓]
[AI]   > UNKNOWN MERCHANT 84kr → needs review      [!]
[DONE] sync complete — 4.2s
```
This same console styling extends to the conversational AI assistant (Phase 3) — Claude/Gemini responses render as monospace terminal output with a `>` prompt for user input, not a softened chat-bubble UI.

**Motion**
- Minimal and mechanical: cursor blink, typewriter reveal for key numbers/headers, boot-sequence animation on initial load, linear/stepped easing (no bounce)

**What to avoid**: rounded corners, soft shadows, gradients, glassmorphism, sans-serif fonts, multi-color palettes, Matrix-rain clichés.

---

## Credentials & Environment Variables

| Variable | Value / Notes |
|---|---|
| `DATABASE_URL` | Neon Postgres connection string |
| `ENABLE_BANKING_PRIVATE_KEY_BASE64` | Base64 of the RSA private key PEM |
| `ENABLE_BANKING_APP_ID` | `secret` |
| `ENABLE_BANKING_REDIRECT_URL` | `https://mw-finance-six.vercel.app/api/callback` |
| `ENABLE_BANKING_ASPSP_NAME` / `ENABLE_BANKING_ASPSP_COUNTRY` | e.g. `Länsförsäkringar` / `SE` |
| `GEMINI_API_KEY` | From [aistudio.google.com](https://aistudio.google.com) — free, no billing required |
| `GEMINI_MODEL` | defaults to `gemini-2.0-flash` |
| `NTFY_SERVER` / `NTFY_TOPIC` | push notifications (server defaults to `https://ntfy.sh`) |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob — auto-injected when a Blob store is connected to the project |
| `CRON_SECRET` | Bearer token guarding `/api/sync` (Vercel cron) |
| `APP_URL` | public base URL, used in ntfy click-through links |

---

## Enable Banking Integration

**Auth model**: JWT-based — every API request requires a JWT signed with the RSA private key. This is NOT a simple API key/secret pair.

**Flow overview**:
1. Sign a JWT with the private key (RS256, standard claims + Enable Banking-specific fields)
2. Exchange for a session/access token via Enable Banking's auth endpoint
3. Use that token to call the Accounts and Transactions APIs

**Key API resources to implement**:
- `GET /accounts` — list linked accounts
- `GET /accounts/{id}/transactions` — fetch transactions for a date range
- `GET /accounts/{id}/balances` — current balances

**Docs**: https://enablebanking.com/docs/api/reference/

**Polling vs webhook**: Enable Banking's restricted mode uses polling (no webhook push). Schedule transaction syncs via Vercel cron (e.g. every 4–6 hours) — each scheduled run and each manual "sync now" click should stream into the live console view described above.

**Fallback for investment platforms** (LF funds, Avanza, Lysa): no clean unified API — plan for manual entry (amount + %) as default. Check Avanza's unofficial API separately.

---

## Tech Stack

**Decided:**
- Hosting: Vercel
- Runtime: Node.js serverless functions (Vercel API routes)
- Database: Postgres (transactions, categories, budgets, goals)
- AI: Gemini API (Google AI Studio, free tier) — batch/weekly runs, not per-transaction. Model: Gemini 2.0 Flash.
- Notifications: ntfy or Pushover for push alerts; Resend for weekly email digests

**Open (decide at project start):**
- Frontend framework: Next.js (recommended — colocates API routes) vs standalone React + separate API
- Platform target: **web-only**, desktop-first — no PWA/native compromise needed, so the full dense terminal layout can be designed without a mobile fallback mode
- ORM: Prisma vs Drizzle vs raw SQL

---

## Data Architecture

ORM: **Drizzle** (`src/db/schema.ts`). DB: **Neon Postgres** (serverless HTTP driver). Money stored as `numeric(14,2)`; API/query layers cast to float for the client. All category "icons" removed — the terminal aesthetic uses status glyphs + a per-category color swatch (`■`), never emoji.

### Live SQL schema (as deployed)

```sql
-- Bank consent sessions (one per successful Enable Banking consent)
bank_sessions(
  session_id text PK, aspsp_name text, aspsp_country text,
  psu_type text default 'personal', valid_until timestamptz, created_at timestamptz)

-- Linked accounts (keyed by Enable Banking account uid)
accounts(
  uid text PK, session_id text FK→bank_sessions,
  name text, iban text, currency text default 'SEK', product text,
  cash_account_type text, usage text, aspsp_name text, aspsp_country text,
  balance numeric(14,2), balance_type text, balance_updated_at timestamptz,
  created_at timestamptz)

-- Categories (NO emoji column — color swatch only)
categories(
  id serial PK, name text UNIQUE, color text default '#6f926f',
  budget_monthly numeric(14,2), budget_weekly numeric(14,2),
  sort int default 100, created_at timestamptz)

-- Transactions
transactions(
  id serial PK, account_uid text FK→accounts,
  dedupe_key text, bank_transaction_id text, entry_reference text,
  status text, direction text ('CRDT'|'DBIT'),
  amount numeric(14,2), signed numeric(14,2), currency text,
  booking_date date, value_date date, remittance text,
  counterparty_name text, merchant text, mcc text,
  category_id int FK→categories, category_source text,
  flagged_reason text,          -- suspicious-payment rule that fired
  raw jsonb, created_at timestamptz,
  UNIQUE(account_uid, dedupe_key),
  INDEX(booking_date), INDEX(category_id), INDEX(merchant))

-- Learned merchant→category cache
merchant_categories(
  merchant text PK, category_id int FK→categories,
  source text default 'gemini', updated_at timestamptz)

-- Recurring payments (detected from history)
recurring_payments(
  id serial PK, merchant text UNIQUE, amount numeric(14,2),
  currency text default 'SEK', cadence text default 'monthly',
  cadence_days int, last_date date, next_date date, occurrences int default 0,
  category_id int FK→categories, last_alerted_at timestamptz,
  created_at timestamptz, updated_at timestamptz)

-- Savings goals + contributions
savings_goals(
  id serial PK, name text, target_amount numeric(14,2),
  current_amount numeric(14,2) default 0, currency text default 'SEK',
  target_date date, image_url text,          -- Vercel Blob public URL
  is_primary boolean default false,           -- receives the monthly sweep
  paused boolean default false, created_at timestamptz)

savings_contributions(
  id serial PK, goal_id int FK→savings_goals, amount numeric(14,2),
  source text default 'manual' ('manual'|'sweep'), month text (YYYY-MM),
  note text, created_at timestamptz,
  INDEX(goal_id), INDEX(month))

-- Adaptive budgeting: signed per-month deltas; effective budget =
-- categories.budget_monthly + SUM(budget_adjustments.delta) for that month
budget_adjustments(
  id serial PK, category_id int FK→categories, month text (YYYY-MM),
  delta numeric(14,2), reason text, created_at timestamptz,
  INDEX(category_id, month), INDEX(month))

-- Single-row settings (sweep %, adaptive cap %, adaptive trigger %)
settings(
  key text PK default 'singleton',
  sweep_percent numeric(5,2) default 80,
  adaptive_cap_percent numeric(5,2) default 20,
  adaptive_trigger_percent numeric(5,2) default 90,
  updated_at timestamptz)

-- Sync audit log (also drives the monthly-sweep rollover check)
sync_runs(
  id serial PK, started_at timestamptz, finished_at timestamptz,
  new_transactions int default 0, ok int default 1, error text)
```

Migrations: `npm run db:push` (Drizzle) for a fresh DB. Incremental Phase-2 changes are captured in `drizzle/migrations/phase2.sql` (idempotent). The emoji-removal change is a one-off `ALTER TABLE categories DROP COLUMN emoji;` (see below).

### Blob storage (goal images)

Vercel Blob (`@vercel/blob`). Uploads via `POST /api/goals/:id/image` (multipart). The client downscales to ≤1024px JPEG before upload; the server caps at 5 MB and rejects non-images.

- Key convention: `goals/{goalId}-{timestamp}.{ext}` (public access, no random suffix)
- The returned public URL is persisted to `savings_goals.image_url`
- Requires env `BLOB_READ_WRITE_TOKEN` (auto-injected when a Blob store is connected to the Vercel project)

Categorization pipeline: rule-based first (MCC + merchant/remittance keyword rules), fall back to Gemini 2.0 Flash for ambiguous merchants, cache the result per merchant in `merchant_categories` — avoids burning free-tier rate limits on the same merchant twice. Manual overrides write `category_source='manual'` and update the cache so future occurrences auto-apply.

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
- ⏸ Receipt ingestion (Kivra/ICA/photo) and email parsing — **deferred**. No public consumer API for Kivra/ICA; photo OCR + email parsing intentionally out of scope for now.

### Phase 3 — Intelligence (Gemini API)
- Conversational assistant: explains the app, walks through your finances — rendered as terminal console output with `>` prompt for input, monospace response text, no chat bubbles
- Personalized savings suggestions based on learned habits
- Behavioral analysis: identify harmful spending patterns, suggest concrete fixes
- Anomaly detection for invoices/payments that look off
- Run as a scheduled batch job (nightly or weekly) — not live per transaction. Offer manual trigger on top.
- Model: `gemini-2.0-flash` — free tier covers personal-scale batch runs indefinitely
- AI payment categorization: runs in the batch job and also whenever user presses "sync now." **This is the aesthetic's centerpiece** — a live scrolling console log showing each transaction being categorized in real time (see example log under Design Philosophy above), with per-line `[✓]`/`[!]` results and a final `[DONE]` summary with elapsed time.

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
- Levels, streaks, achievements tied to staying under budget — rendered as terminal-style badges/log entries rather than icon-badge graphics, each badge unique in color and design, progressivly more dramatic and cool looking.
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

---

## Notifications Setup

Trigger from Vercel serverless function or cron job when budget logic flags something.

| Option | Type | Cost | Setup |
|---|---|---|---|
| **ntfy** | Push | Free, open source | POST to topic URL; delivered via ntfy iOS app |
| **Resend** | Email | Free tier generous | One-click Vercel integration; `resend.emails.send(...)` |

Recommendation: ntfy or Pushover for time-sensitive alerts (budget overages, anomalies); Resend for weekly digests. Email digest layout should carry the same monospace/terminal styling as the web app for visual consistency (most email clients render monospace fonts fine; keep box-drawing minimal since email HTML rendering is less predictable).

---

## Open Decisions (resolve before or at project start)

1. **Frontend framework**: Next.js vs React + separate API layer
2. **Platform target**: web-only, desktop-first (confirmed — no PWA/native compromise)
3. **ORM**: Prisma vs Drizzle vs raw SQL
4. **Categorization from day one**: pure rules vs rules + Gemini API fallback
5. **Storage sensitivity**: local-only vs cloud — and what threat model matters to you (financial data)
6. **Gemini batch cadence**: daily vs weekly AI runs — weekly is fine for personal use and stays well within free tier limits