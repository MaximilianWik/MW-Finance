import {
  pgTable,
  text,
  timestamp,
  numeric,
  integer,
  serial,
  jsonb,
  date,
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

// ─── Categories (with optional monthly budget) ──────────────────────────────
export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  emoji: text("emoji").notNull().default("💸"),
  color: text("color").notNull().default("#8a97a6"),
  budgetMonthly: numeric("budget_monthly", { precision: 14, scale: 2 }),
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

// ─── Savings goals (Phase 2 foundation) ─────────────────────────────────────
export const savingsGoals = pgTable("savings_goals", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  targetAmount: numeric("target_amount", { precision: 14, scale: 2 }).notNull(),
  currentAmount: numeric("current_amount", { precision: 14, scale: 2 })
    .notNull()
    .default("0"),
  currency: text("currency").notNull().default("SEK"),
  targetDate: date("target_date"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Recurring payments (Phase 3 foundation) ────────────────────────────────
export const recurringPayments = pgTable("recurring_payments", {
  id: serial("id").primaryKey(),
  merchant: text("merchant").notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("SEK"),
  cadence: text("cadence").notNull().default("monthly"), // weekly | monthly | yearly
  nextDate: date("next_date"),
  categoryId: integer("category_id").references(() => categories.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
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

export type Account = typeof accounts.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
