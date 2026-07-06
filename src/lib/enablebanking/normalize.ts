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
 * suitable for the merchant→category cache. Strips card-transaction noise,
 * dates, reference numbers, and store IDs.
 */
export function normalizeMerchant(raw: string | undefined): string | null {
  if (!raw) return null;
  let s = raw.toUpperCase();
  // Common Nordic card-purchase prefixes / noise.
  s = s.replace(/\b(KORTK[ÖO]P|KORTBETALNING|BG|PG|SWISH|AUTOGIRO|KLARNA)\b/g, " ");
  // Dates like 2024-01-02, 24/01, 01.02.
  s = s.replace(/\d{2,4}[-/.]\d{1,2}([-/.]\d{1,4})?/g, " ");
  // Long digit runs (card/ref numbers), trailing store numbers.
  s = s.replace(/\d{4,}/g, " ");
  s = s.replace(/\*+/g, " ");
  // Collapse to letters, spaces, and a few separators.
  s = s.replace(/[^A-ZÅÄÖ0-9 &.-]/g, " ").replace(/\s+/g, " ").trim();
  if (!s) return null;
  // Cap length; keep the leading meaningful tokens.
  return s.slice(0, 60);
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
