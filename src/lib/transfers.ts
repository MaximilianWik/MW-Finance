/**
 * Self-transfer detection.
 *
 * A "self-transfer" is money moving between the user's OWN accounts (e.g.
 * main account -> savings / temporary account). These are neither spending
 * nor income, so they must be excluded from spend totals and parked in the
 * `Transfers` category.
 *
 * To recognise a new own-account later, add its identifiers below:
 *   - SELF_ACCOUNT_NUMBERS: the raw account number in any format (compared on
 *     digits only, so "9023.81.072.90" and "90238107290" both match).
 *   - SELF_NAMES: counterparty names that are the user themselves.
 */

// Own account numbers, compared digits-only.
export const SELF_ACCOUNT_NUMBERS = ["90238107290"]; // 9023.81.072.90 - temp account

// Counterparty names that are the user themselves (lower-cased, substring match).
export const SELF_NAMES = ["maximilian wikstr\u00f6m", "maximilian wikstrom"];

/** Digits-only form of a string (null-safe). */
function digits(s: string | null | undefined): string {
  return (s ?? "").replace(/\D+/g, "");
}

export interface SelfTransferInput {
  counterpartyName?: string | null;
  remittance?: string | null;
  merchant?: string | null;
}

/**
 * True when the transaction looks like a transfer between the user's own
 * accounts - either the counterparty is the user, or a known own-account
 * number appears in the counterparty / remittance / merchant text.
 */
export function isSelfTransfer(input: SelfTransferInput): boolean {
  const name = (input.counterpartyName ?? "").toLowerCase().trim();
  if (name && SELF_NAMES.some((n) => name.includes(n))) return true;

  // Check each field's digits independently so an account number can't be
  // formed accidentally by concatenating digits across fields.
  for (const field of [input.counterpartyName, input.remittance, input.merchant]) {
    const d = digits(field);
    if (d && SELF_ACCOUNT_NUMBERS.some((acc) => d.includes(acc))) return true;
  }

  return false;
}