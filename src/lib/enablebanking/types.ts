// Typed subset of the Enable Banking API responses we consume.
// Field names are snake_case exactly as the production API returns them.

export interface EbAmount {
  amount: string; // decimal as string, e.g. "12.34"
  currency: string; // ISO 4217
}

export interface EbAuthResponse {
  url: string; // redirect the user here
  authorization_id: string;
  psu_id_hash?: string;
}

export interface EbAccountId {
  iban?: string;
  other?: { identification?: string; scheme_name?: string };
}

export interface EbAccount {
  uid: string; // used as {uid} in subsequent calls
  account_id?: EbAccountId;
  name?: string;
  details?: string;
  usage?: string; // PRIV | ORGA
  cash_account_type?: string; // CACC …
  product?: string;
  currency?: string;
}

export interface EbSessionResponse {
  session_id: string;
  aspsp: { name: string; country: string };
  psu_type: string;
  access: { valid_until?: string };
  accounts: EbAccount[];
}

export interface EbParty {
  name?: string;
}

export interface EbTransaction {
  transaction_id?: string;
  entry_reference?: string;
  status?: string; // BOOK | PDNG
  credit_debit_indicator: "CRDT" | "DBIT";
  transaction_amount: EbAmount;
  booking_date?: string; // YYYY-MM-DD
  value_date?: string;
  transaction_date?: string;
  remittance_information?: string[];
  creditor?: EbParty;
  debtor?: EbParty;
  creditor_account?: EbAccountId;
  debtor_account?: EbAccountId;
  merchant_category_code?: string;
  bank_transaction_code?: { code?: string; sub_code?: string; description?: string };
}

export interface EbTransactionsResponse {
  transactions: EbTransaction[];
  continuation_key?: string | null;
}

export interface EbBalance {
  balance_amount: EbAmount;
  balance_type?: string; // CLBD | XPCD …
  name?: string;
  reference_date?: string;
  last_change_date_time?: string;
}

export interface EbBalancesResponse {
  balances: EbBalance[];
}
