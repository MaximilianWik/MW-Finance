import { createHash } from "node:crypto";
import type { EbTransaction } from "./types";
import type { NewTransaction } from "@/db/schema";

/** Best-effort counterparty name for a transaction. */
export function counterparty(tx: EbTransaction): string | undefined {
  if (tx.credit_debit_indicator === "DBIT") {
    return tx.creditor?.name ?? tx.remittance_information?.[0];
  }
  return tx.debtor?.name ?? tx.remittance_information?.[0];
}

/**
 * Normalize a raw counterparty/remittance string into a stable merchant key
 * suitable for the merchant→category cache.
 *
 * Strategy:
 *   1. Standard pass: strip noise (prefixes, dates, long digit runs, store IDs)
 *      and return if something useful remains.
 *   2. Reference pass: if nothing meaningful was left after the standard pass,
 *      treat the string as a payment-reference identifier (Bankgiro, Plusgiro,
 *      invoice refs, etc.). Return the original with minimal cleaning so the
 *      reference number itself becomes the stable key.
 *
 * This matters for Swedish bank payments where the counterparty is identified
 * only by a BG/PG reference number like "6162-839725531".
 */
export function normalizeMerchant(raw: string | undefined): string | null {
  if (!raw) return null;

  let s = raw.toUpperCase();

  // ── Standard pass ──────────────────────────────────────────────────────────
  // Strip common Nordic card-purchase label words.
  let clean = s.replace(/\b(KORTK[ÖO]P|KORTBETALNING|BG|PG|SWISH|AUTOGIRO|KLARNA)\b/g, " ");
  // Strip date-like patterns: 2024-01-02, 24/01, 01.02
  clean = clean.replace(/\d{2,4}[-/.]\d{1,2}([-/.]\d{1,4})?/g, " ");
  // Strip long digit runs (card numbers, reference appendages) ≥ 4 digits.
  clean = clean.replace(/\d{4,}/g, " ");
  // Strip asterisks (obfuscated card numbers like "REVOLUT**4590*")
  clean = clean.replace(/\*+/g, " ");
  // Keep letters, digits ≤3, spaces, and a few separators; collapse whitespace.
  clean = clean.replace(/[^A-ZÅÄÖ0-9 &.-]/g, " ").replace(/\s+/g, " ").trim();

  if (clean.length >= 2) {
    return clean.slice(0, 60);
  }

  // ── Reference pass (fallback) ───────────────────────────────────────────────
  // The raw string has no useful text tokens — it's a reference/identifier
  // (e.g., Bankgiro "6162-839725531", Plusgiro "5862-8082", invoice ref).
  // Strip only the noisiest label words and keep the rest as-is.
  let ref = s
    .replace(/\b(KORTK[ÖO]P|KORTBETALNING|AUTOGIRO|KLARNA)\b/g, " ")
    // Strip card-length digit runs (≥ 13 digits) only — keep shorter refs.
    .replace(/\d{13,}/g, " ")
    .replace(/\*+/g, " ")
    .replace(/[^A-ZÅÄÖ0-9 &./-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (ref.length >= 2) {
    return ref.slice(0, 60);
  }

  return null;
}

function dedupeKey(uid: string, tx: EbTransaction): string {
  if (tx.entry_reference) return `er:${tx.entry_reference}`;
  if (tx.transaction_id) return `tid:${tx.transaction_id}`;
  const h = createHash("sha1")
    .update(
      [
        uid,
        tx.booking_date ?? "",
        tx.transaction_amount.amount,
        tx.transaction_amount.currency,
        tx.credit_debit_indicator,
        (tx.remittance_information ?? []).join("|"),
        counterparty(tx) ?? "",
      ].join("§")
    )
    .digest("hex");
  return `h:${h}`;
}

/** Map an Enable Banking transaction into a row for insertion. */
export function mapTransaction(uid: string, tx: EbTransaction): NewTransaction {
  const abs = tx.transaction_amount.amount;
  const isOut = tx.credit_debit_indicator === "DBIT";
  const signed = isOut ? `-${abs}` : abs;
  const name = counterparty(tx);
  const remittance = (tx.remittance_information ?? []).join(" ").trim() || null;

  return {
    accountUid: uid,
    dedupeKey: dedupeKey(uid, tx),
    bankTransactionId: tx.transaction_id ?? null,
    entryReference: tx.entry_reference ?? null,
    status: tx.status ?? null,
    direction: tx.credit_debit_indicator,
    amount: abs,
    signed,
    currency: tx.transaction_amount.currency,
    bookingDate: tx.booking_date ?? tx.value_date ?? tx.transaction_date ?? null,
    valueDate: tx.value_date ?? null,
    remittance,
    counterpartyName: name ?? null,
    merchant: normalizeMerchant(name ?? remittance ?? undefined),
    mcc: tx.merchant_category_code ?? null,
    categoryId: null,
    categorySource: null,
    raw: tx as unknown as Record<string, unknown>,
  };
}
