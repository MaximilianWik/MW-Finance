# MWFinance

Personal finance PWA - links your bank via **Enable Banking**, pulls transactions,
auto-categorizes them (rules → Gemini → learned merchant cache), tracks per-category
monthly budgets, and pushes budget alerts to your phone via **ntfy**.

**Stack:** Next.js 15 (App Router) · Drizzle ORM · Neon Postgres · jose (RS256 JWT) ·
Gemini · ntfy · Tailwind · deploy on Vercel.


---

## 1. Prerequisites

- Node 20+ and npm
- A [Neon](https://neon.tech) Postgres database (free tier)
- An [Enable Banking](https://enablebanking.com) application (sandbox is free):
  - Create an app in the control panel, upload/generate an **RSA key pair**
  - Note your **Application ID** (becomes the JWT `kid`)
  - Register redirect URL `http://localhost:3000/api/callback` (and your prod URL)
- A [Gemini API key](https://aistudio.google.com/apikey) (free tier)
- The [ntfy](https://ntfy.sh) app on your phone, subscribed to a private topic

---

## 2. Setup

```powershell
npm install
Copy-Item .env.example .env.local
```

Fill in `.env.local` (see comments in `.env.example`). Key points:

### Enable Banking private key
The key must be **PKCS#8** and stored **base64-encoded** (single line, avoids newline
breakage in env vars). If your key is PKCS#1 (`BEGIN RSA PRIVATE KEY`), convert first:

```powershell
openssl pkcs8 -topk8 -nocrypt -in your-app-id.pem -out pkcs8.pem
# then base64-encode it (no line wraps):
[Convert]::ToBase64String([IO.File]::ReadAllBytes("pkcs8.pem")) | Set-Content key.b64
```

Paste the contents of `key.b64` into `ENABLE_BANKING_PRIVATE_KEY_BASE64`.

### Database
```powershell
npm run db:push     # create tables from the Drizzle schema
npm run db:seed     # insert the 11 default categories + budgets
```

---

## 3. Run

```powershell
npm run dev
```

Open http://localhost:3000 → **Link bank** → authenticate at your bank → you're
redirected back → hit **Sync now**.

---

## 4. How it works

| Piece | File |
|---|---|
| JWT signer (RS256, cached) | `src/lib/enablebanking/jwt.ts` |
| API client (`/auth`, `/sessions`, transactions w/ `continuation_key`, balances) | `src/lib/enablebanking/client.ts` |
| Raw tx → DB row (dedupe key, merchant normalize, signed amount) | `src/lib/enablebanking/normalize.ts` |
| Categorization (MCC + keyword rules → cache → Gemini) | `src/lib/categorize.ts` |
| Sync orchestration (fetch → dedupe-insert → categorize → notify) | `src/lib/sync.ts` |
| Budget math | `src/lib/budget.ts` |
| ntfy push | `src/lib/notify.ts` |
| Drizzle schema | `src/db/schema.ts` |

**Categorization order:** deterministic MCC/keyword rules → learned merchant cache →
Gemini fallback (only for still-unknown merchants). A manual override in the UI writes
the merchant→category cache, so every future transaction from that merchant auto-applies.

**Gemini cadence:** the 6-hourly sync does **not** call Gemini (stays in free tier).
A separate weekly cron (`/api/sync?gemini=1`, Mondays) classifies accumulated unknowns.
Manual **Sync now** always runs Gemini for immediate results.

**Dedupe:** unique index on `(account_uid, dedupe_key)` where `dedupe_key` prefers the
bank's `entry_reference`/`transaction_id`, else a content hash. Overlapping sync windows
never double-insert.

---

## 5. API routes

| Route | Purpose |
|---|---|
| `GET /api/auth/start` | Begin bank consent; sets CSRF state cookie; redirects to bank |
| `GET /api/callback` | Exchange `code` → session; persist session + accounts |
| `GET\|POST /api/sync` | Cron target. Guarded by `Authorization: Bearer $CRON_SECRET`. `?gemini=1` enables Gemini |
| `GET /api/transactions` | List (filters: `month`, `categoryId`, `accountUid`, `q`, `limit`) |
| `PATCH /api/transactions` | Manual category override (`{id, categoryId}`) + updates merchant cache |
| `GET/PATCH/POST /api/categories` | List / edit budget / create category |

---

## 6. Deploy to Vercel

1. Push this repo to Git and import into Vercel.
2. Add every var from `.env.example` in **Project → Settings → Environment Variables**
   (set `APP_URL` and `ENABLE_BANKING_REDIRECT_URL` to your prod domain, and register
   that redirect URL in the Enable Banking panel).
3. `vercel.json` defines the cron jobs:
   - `/api/sync` every 6h
   - `/api/sync?gemini=1` weekly (Mon 06:00)
   - Vercel sends `Authorization: Bearer $CRON_SECRET` automatically when `CRON_SECRET`
     is set in env. **Sub-daily crons require the Vercel Pro plan** — on Hobby, change
     the schedule to daily (`0 6 * * *`) or trigger `/api/sync` from an external cron.
4. Run `npm run db:push` and `npm run db:seed` against the production `DATABASE_URL`
   once (locally, pointing at prod).

### Install as an app
On iPhone: open the site in Safari → Share → **Add to Home Screen**. The PWA manifest
and service worker (`public/`) make it launch full-screen. Budget alerts arrive via the
ntfy app (subscribe to your `NTFY_TOPIC`).

---

## 7. Scripts

```
npm run dev         # dev server
npm run build       # production build
npm run typecheck   # tsc --noEmit
npm run db:push     # push schema to Neon
npm run db:seed     # seed default categories
npm run db:studio   # Drizzle Studio
```

---

## 8. Security notes

- `.env.local` and `*.pem` are gitignored. Never commit secrets.
- The RSA private key lives only in env (base64). Rotate via the Enable Banking panel.
- `/api/sync` is unauthenticated-safe only because of the `CRON_SECRET` bearer check.
- Pick an unguessable `NTFY_TOPIC` — anyone who knows it can read your alerts.

Phase 1 scope: accounts, balances, transactions, categorization, budgets, notifications.
The schema already includes `savings_goals` and `recurring_payments` tables as
foundations for later phases.
