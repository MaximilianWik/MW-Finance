import {
  pgTable,
  text,
  timestamp,
  numeric,
  integer,
  serial,
  jsonb,
  date,
  boolean,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ─── Bank sessions (one per successful consent) ─────────────────────────────
export const bankSessions = pgTable("bank_sessions", {
  sessionId: text("session_id").primaryKey(),
  aspspName: text("aspsp_name").notNull(),
  aspspCountry: text("aspsp_country").notNull(),
  psuType: text("psu_type").notNull().default("personal"),
  validUntil: timestamp("valid_until", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Accounts (from POST /sessions response) ────────────────────────────────
export const accounts = pgTable("accounts", {
  uid: text("uid").primaryKey(), // Enable Banking account uid — used as {uid} in API paths
  sessionId: text("session_id")
    .notNull()
    .references(() => bankSessions.sessionId, { onDelete: "cascade" }),
  name: text("name"),
  iban: text("iban"),
  currency: text("currency").notNull().default("SEK"),
  product: text("product"),
  cashAccountType: text("cash_account_type"),
  usage: text("usage"),
  aspspName: text("aspsp_name").notNull(),
  aspspCountry: text("aspsp_country").notNull(),
  // Latest known balance, refreshed on sync.
  balance: numeric("balance", { precision: 14, scale: 2 }),
  balanceType: text("balance_type"),
  balanceUpdatedAt: timestamp("balance_updated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Categories (with optional monthly + weekly budget) ─────────────────────
export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  color: text("color").notNull().default("#72728a"),
  budgetMonthly: numeric("budget_monthly", { precision: 14, scale: 2 }),
  budgetWeekly: numeric("budget_weekly", { precision: 14, scale: 2 }),
  budgetSource: text("budget_source"), // ai | manual | null — lets AI recalibration skip manually-set budgets
  // Phase 5 — "Wants" flag. Micro-reflection prompts + goal trade-off chips
  // only fire on discretionary categories (Restaurants, Shopping, Entertainment).
  discretionary: boolean("discretionary").notNull().default(false),
  sort: integer("sort").notNull().default(100),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Transactions ───────────────────────────────────────────────────────────
export const transactions = pgTable(
  "transactions",
  {
    id: serial("id").primaryKey(),
    accountUid: text("account_uid")
      .notNull()
      .references(() => accounts.uid, { onDelete: "cascade" }),
    // Stable dedupe key: bank entry_reference/transaction_id when present, else a
    // content hash. Prevents double-insertion across overlapping sync windows.
    dedupeKey: text("dedupe_key").notNull(),
    bankTransactionId: text("bank_transaction_id"),
    entryReference: text("entry_reference"),
    status: text("status"), // BOOK | PDNG
    direction: text("direction").notNull(), // CRDT | DBIT
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(), // absolute value
    signed: numeric("signed", { precision: 14, scale: 2 }).notNull(), // negative = outflow
    currency: text("currency").notNull(),
    bookingDate: date("booking_date"),
    valueDate: date("value_date"),
    remittance: text("remittance"),
    counterpartyName: text("counterparty_name"),
    merchant: text("merchant"), // normalized key for categorization + cache
    mcc: text("mcc"), // merchant_category_code when the bank provides it
    categoryId: integer("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    categorySource: text("category_source"), // rule | gemini | cache | manual
    flaggedReason: text("flagged_reason"), // suspicious-payment rule that fired
    raw: jsonb("raw"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    dedupeIdx: uniqueIndex("tx_dedupe_idx").on(t.accountUid, t.dedupeKey),
    bookingIdx: index("tx_booking_idx").on(t.bookingDate),
    categoryIdx: index("tx_category_idx").on(t.categoryId),
    merchantIdx: index("tx_merchant_idx").on(t.merchant),
  })
);

// ─── Merchant → category cache (learned, so future matches auto-apply) ──────
export const merchantCategories = pgTable("merchant_categories", {
  merchant: text("merchant").primaryKey(), // normalized merchant key
  categoryId: integer("category_id")
    .notNull()
    .references(() => categories.id, { onDelete: "cascade" }),
  source: text("source").notNull().default("gemini"), // gemini | manual | rule
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Savings goals (Phase 2) ────────────────────────────────────────────────
export const savingsGoals = pgTable("savings_goals", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  targetAmount: numeric("target_amount", { precision: 14, scale: 2 }).notNull(),
  currentAmount: numeric("current_amount", { precision: 14, scale: 2 })
    .notNull()
    .default("0"),
  currency: text("currency").notNull().default("SEK"),
  targetDate: date("target_date"),
  imageUrl: text("image_url"),
  isPrimary: boolean("is_primary").notNull().default(false),
  paused: boolean("paused").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Savings contributions (manual + monthly sweep) ─────────────────────────
export const savingsContributions = pgTable(
  "savings_contributions",
  {
    id: serial("id").primaryKey(),
    goalId: integer("goal_id")
      .notNull()
      .references(() => savingsGoals.id, { onDelete: "cascade" }),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    source: text("source").notNull().default("manual"), // manual | sweep
    month: text("month"), // YYYY-MM when the contribution is attributed to a month
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    goalIdx: index("sc_goal_idx").on(t.goalId),
    monthIdx: index("sc_month_idx").on(t.month),
  })
);

// ─── Budget adjustments (adaptive redistribution per month) ─────────────────
export const budgetAdjustments = pgTable(
  "budget_adjustments",
  {
    id: serial("id").primaryKey(),
    categoryId: integer("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    month: text("month").notNull(), // YYYY-MM
    delta: numeric("delta", { precision: 14, scale: 2 }).notNull(), // signed kr
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    catMonthIdx: index("ba_cat_month_idx").on(t.categoryId, t.month),
    monthIdx: index("ba_month_idx").on(t.month),
  })
);

// ─── App-wide settings (single row keyed by "singleton") ────────────────────
export const settings = pgTable("settings", {
  key: text("key").primaryKey().default("singleton"),
  sweepPercent: numeric("sweep_percent", { precision: 5, scale: 2 })
    .notNull()
    .default("80"),
  adaptiveCapPercent: numeric("adaptive_cap_percent", { precision: 5, scale: 2 })
    .notNull()
    .default("20"),
  adaptiveTriggerPercent: numeric("adaptive_trigger_percent", { precision: 5, scale: 2 })
    .notNull()
    .default("90"),
  // Phase 5 — used to translate spend into hours-of-work. NULL = derive from
  // detected salary (median salary ÷ 160h).
  hourlyRate: numeric("hourly_rate", { precision: 10, scale: 2 }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Recurring payments (Phase 2 — detected from history + manual) ──────────
export const recurringPayments = pgTable("recurring_payments", {
  id: serial("id").primaryKey(),
  merchant: text("merchant").notNull().unique(),
  notes: text("notes"), // user-supplied display name / memo
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("SEK"),
  cadence: text("cadence").notNull().default("monthly"), // weekly | monthly | yearly
  cadenceDays: integer("cadence_days"), // median gap between occurrences
  lastDate: date("last_date"),
  nextDate: date("next_date"),
  occurrences: integer("occurrences").notNull().default(0),
  categoryId: integer("category_id").references(() => categories.id, {
    onDelete: "set null",
  }),
  manual: boolean("manual").notNull().default(false), // true = user-created, not auto-detected
  variableAmount: boolean("variable_amount").notNull().default(false), // true = variable-price recurring (e.g. electricity)
  active: boolean("active").notNull().default(true),  // false = soft-deleted by user
  lastAlertedAt: timestamp("last_alerted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Sync log (audit + "what's new since last run") ─────────────────────────
export const syncRuns = pgTable("sync_runs", {
  id: serial("id").primaryKey(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  newTransactions: integer("new_transactions").notNull().default(0),
  ok: integer("ok").notNull().default(1), // 1 ok, 0 failed
  error: text("error"),
});

// --- Savings entries (Phase 2 - manual additions to the all-time savings total) ---
export const savingsEntries = pgTable(
  "savings_entries",
  {
    id: serial("id").primaryKey(),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    note: text("note"),
    occurredOn: date("occurred_on").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    occurredIdx: index("se_occurred_idx").on(t.occurredOn),
  })
);

// ─── AI insights (Phase 3 — behavioral patterns, savings suggestions, trends) ─
export const aiInsights = pgTable(
  "ai_insights",
  {
    id: serial("id").primaryKey(),
    kind: text("kind").notNull(),                       // pattern | suggestion | anomaly | trend
    severity: text("severity").notNull().default("info"), // info | warn | danger
    title: text("title").notNull(),
    body: text("body").notNull(),
    data: jsonb("data"),                                // arbitrary supporting numbers/refs
    categoryId: integer("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    dismissed: boolean("dismissed").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    kindIdx: index("ai_insights_kind_idx").on(t.kind),
    dismissedIdx: index("ai_insights_dismissed_idx").on(t.dismissed),
  })
);

// ─── Investment accounts (Phase 4 — per-account balance tracking) ───────────
// Balance = seed_balance + Σ DBIT txns to merchant since seed_date
//                        − Σ CRDT txns from merchant since seed_date
// Setting a new balance resets seed_balance and stamps seed_date = today.
export const investmentAccounts = pgTable("investment_accounts", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  color: text("color").notNull().default("#3ea0c8"),
  merchant: text("merchant"),          // normalized merchant key; null = manual-only
  seedBalance: numeric("seed_balance", { precision: 14, scale: 2 }).notNull().default("0"),
  seedDate: date("seed_date"),         // only count txns AFTER this date; null = all history
  // Live-price peg (Phase 4b): link the account to a stock ticker so its value
  // scales with the live quote. base_price is captured at the peg moment; the
  // displayed value = seed_balance × (live_price / base_price). shares is display-only.
  ticker: text("ticker"),              // e.g. "GME"; null = not price-linked
  basePrice: numeric("base_price", { precision: 14, scale: 4 }),  // quote at peg moment
  shares: numeric("shares", { precision: 14, scale: 4 }),         // display-only holding size
  currency: text("currency").notNull().default("SEK"),
  sort: integer("sort").notNull().default(100),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type InvestmentAccount = typeof investmentAccounts.$inferSelect;

// ─── Micro-reflections (Phase 5 — "still glad you got this?") ───────────────
// One verdict per discretionary purchase. transaction_id is the PK so a
// reflection is naturally unique per transaction (re-answering overwrites).
export const reflections = pgTable("reflections", {
  transactionId: integer("transaction_id")
    .primaryKey()
    .references(() => transactions.id, { onDelete: "cascade" }),
  verdict: text("verdict").notNull(), // glad | regret | meh
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Account = typeof accounts.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
export type SavingsGoal = typeof savingsGoals.$inferSelect;
export type NewSavingsGoal = typeof savingsGoals.$inferInsert;
export type SavingsContribution = typeof savingsContributions.$inferSelect;
export type BudgetAdjustment = typeof budgetAdjustments.$inferSelect;
export type RecurringPayment = typeof recurringPayments.$inferSelect;
export type Settings = typeof settings.$inferSelect;
export type SavingsEntry = typeof savingsEntries.$inferSelect;
export type NewSavingsEntry = typeof savingsEntries.$inferInsert;
export type AiInsight = typeof aiInsights.$inferSelect;
export type NewAiInsight = typeof aiInsights.$inferInsert;
export type Reflection = typeof reflections.$inferSelect;
export type NewReflection = typeof reflections.$inferInsert;
