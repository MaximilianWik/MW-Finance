import { GoogleGenerativeAI } from "@google/generative-ai";
import { env } from "@/lib/env";

// Canonical category names — must exist in the seeded `categories` table.
export const CATEGORY_NAMES = [
  "Groceries",
  "Restaurants",
  "Transport",
  "Shopping",
  "Bills & Utilities",
  "Entertainment",
  "Health",
  "Cash & ATM",
  "Income",
  "Savings",
  "Investments",
  "Transfers",
  "Swish",
  "Uncategorized",
] as const;

export type CategoryName = (typeof CATEGORY_NAMES)[number];

export interface CategorizeInput {
  merchant: string | null;
  mcc: string | null;
  remittance: string | null;
  direction: "CRDT" | "DBIT";
  counterpartyName?: string | null;
}

// ─── MCC → category (merchant category code, when the bank supplies it) ──────
function mccCategory(mcc: string | null): CategoryName | null {
  if (!mcc) return null;
  const n = parseInt(mcc, 10);
  if (Number.isNaN(n)) return null;
  if (n === 5411 || n === 5422 || n === 5451 || n === 5462 || n === 5499) return "Groceries";
  if ((n >= 5811 && n <= 5814) || n === 5462) return "Restaurants";
  if (n === 5541 || n === 5542 || n === 5983) return "Transport"; // fuel
  if (n === 4111 || n === 4121 || n === 4131 || n === 4789 || n === 4011) return "Transport";
  if (n === 5912 || n === 8011 || n === 8021 || n === 8062 || n === 8099) return "Health";
  if (n === 7832 || n === 7841 || n === 7922 || n === 7996 || n === 7997) return "Entertainment";
  if (n === 4814 || n === 4899 || n === 4900) return "Bills & Utilities";
  if (n === 6011) return "Cash & ATM"; // ATM withdrawal
  if (n >= 5600 && n <= 5699) return "Shopping"; // apparel
  if (n >= 5300 && n <= 5399) return "Shopping"; // wholesale/dept
  return null;
}

// ─── Keyword rules on the normalized merchant / remittance ──────────────────
// Order matters — first match wins. High-priority overrides (Swish, Investments,
// insurance) sit above the generic buckets so they beat both the Income/Transfer
// rules and Gemini.
const RULES: Array<{ re: RegExp; cat: CategoryName }> = [
  // Swish (any direction) — must precede Income ("SWISH INBETALNING") + Transfers.
  { re: /\bSWISH\b/, cat: "Swish" },
  // Fund / brokerage activity — buys AND sale deposits. NOT savings.
  { re: /\b(LF ?FONDER|FONDER|FONDKONTO|FONDK[ÖO]P|FONDSPAR|AVANZA|NORDNET|SAVR|AKTIEINVEST)\b/, cat: "Investments" },
  // Swedish insurers → Bills & Utilities (insurance is a bill, not savings).
  { re: /\b(FOLKSAM|SKANDIA|TRYGG.?HANSA|MODERNA F[ÖO]RS|DINA F[ÖO]RS|HEDVIG|TRE KRONOR|GJENSIDIGE|WATERCIRCLES)\b/, cat: "Bills & Utilities" },
  { re: /\bLYSA\b/, cat: "Savings" },
  { re: /\b(ICA|COOP|HEMK[ÖO]P|WILLYS|LIDL|CITY ?GROSS|MAXI|TEMPO|MATHEM|HEMKOP)\b/, cat: "Groceries" },
  { re: /\b(MCDONALD|BURGER KING|MAX|SUBWAY|PIZZA|SUSHI|O.?LEARYS|ESPRESSO|BARISTA|CAF[EÉ]|RESTAURANG|FOODORA|WOLT|UBER ?EATS|JURESKOGS|BASTARD ?BURGER|VIGGO|TACO ?BAR|SIBYLLA)\b/, cat: "Restaurants" },
  { re: /\b(SL |SL$|V[AÄ]STTRAFIK|SK[AÅ]NETRAFIKEN|SJ |SJ$|MTR|UBER|BOLT|TAXI|CIRCLE ?K|OKQ8|PREEM|ST1|INGO|SHELL|TESLA SUPERCHARGER)\b/, cat: "Transport" },
  { re: /\b(H&M|HM |ZARA|CLAS OHLSON|ELGIGANTEN|MEDIAMARKT|IKEA|ZALANDO|AMAZON|APOTEA|XXL|STADIUM|INTERSPORT|CDON|BOOZT)\b/, cat: "Shopping" },
  { re: /\b(SPOTIFY|NETFLIX|HBO|MAX |DISNEY|VIAPLAY|YOUTUBE|C ?MORE|STEAM|PLAYSTATION|XBOX|BIO ?|SF ?BIO|FILMSTADEN)\b/, cat: "Entertainment" },
  { re: /\b(APOTEK|APOTEA|KRONANS|LLOYDS|V[AÅ]RDCENTRAL|TANDL[AÄ]KARE|FOLKTANDV[AÅ]RDEN)\b/, cat: "Health" },
  { re: /\b(VATTENFALL|ELLEVIO|E.?ON|FORTUM|TELIA|TELE2|TRE |COMHEM|BREDBAND|F[ÖO]RS[AÄ]KRING|HYRA|CSN|SKATTEVERKET|BOSTAD)\b/, cat: "Bills & Utilities" },
  { re: /\b(UTTAG|ATM|BANKOMAT|CONTANTER|CASH)\b/, cat: "Cash & ATM" },
  { re: /\b(L[ÖO]N|LON |SALARY|LÖNEUTBETALNING|INSATTNING)\b/, cat: "Income" },
  { re: /\b(EGEN[ ]?[ÖO]VERF[ÖO]RING|[ÖO]VERF[ÖO]RING|SPARKONTO|TRANSFER)\b/, cat: "Transfers" },
];

/** Deterministic rule-based category, or null if nothing matched. */
export function ruleCategory(input: CategorizeInput): CategoryName | null {
  const mcc = mccCategory(input.mcc);
  if (mcc) return mcc;

  // Include the raw counterparty name: normalizeMerchant strips words like
  // "SWISH", so the merchant key alone can't be trusted to carry them.
  const hay = `${input.merchant ?? ""} ${input.remittance ?? ""} ${input.counterpartyName ?? ""}`.toUpperCase();
  for (const r of RULES) {
    if (r.re.test(hay)) return r.cat;
  }
  return null;
}

// ─── Gemini fallback (batched) ───────────────────────────────────────────────
/**
 * Ask Gemini to classify a batch of unknown merchant strings into one of the
 * canonical categories. Returns a map merchant→CategoryName. Merchants Gemini
 * can't confidently place are omitted (caller treats as Uncategorized).
 */
export async function geminiCategorize(
  merchants: string[]
): Promise<Record<string, CategoryName>> {
  if (merchants.length === 0) return {};

  const genAI = new GoogleGenerativeAI(env.gemini.apiKey);
  const model = genAI.getGenerativeModel({
    model: env.gemini.model,
    generationConfig: { responseMimeType: "application/json", temperature: 0 },
  });

  const prompt = [
    "You classify Swedish bank-transaction merchant names into spending categories.",
    `Allowed categories (use EXACTLY these strings): ${CATEGORY_NAMES.join(", ")}.`,
    'Return a JSON object mapping each input merchant to one category, e.g. {"ICA MAXI":"Groceries"}.',
    "",
    "DOMAIN RULES (apply strictly):",
    "- Swish payments (any direction) → Swish.",
    "- Swedish insurers (Folksam, Skandia, Trygg-Hansa, Moderna, Dina, Hedvig, Trygg) → Bills & Utilities. Insurance is NOT Savings.",
    "- Fund / brokerage activity (Avanza, Nordnet, LF Fonder, 'fonder', fund purchases or sales) → Investments. Money received from SELLING funds is Investments, NEVER Savings.",
    "- Use Savings ONLY for deliberate savings deposits (e.g. Lysa, Sparkonto). Never for investment sales or insurance.",
    "- Restaurants include Swedish food/burger chains (Jureskogs, Bastard Burgers, Max, Sibylla, O'Learys, etc.).",
    "- Salary (Lön) → Income.",
    "- Card-terminal noise/prefixes like 'A194 SE ARN' or trailing country codes ('STOCKHOLM SE') should be IGNORED; classify by the recognizable merchant name inside the string.",
    "",
    'If genuinely unsure, use "Uncategorized". Do not invent categories. Output JSON only.',
    "",
    "Merchants:",
    ...merchants.map((m) => `- ${m}`),
  ].join("\n");

  try {
    const res = await model.generateContent(prompt);
    const txt = res.response.text();
    const parsed = JSON.parse(txt) as Record<string, string>;
    const valid = new Set<string>(CATEGORY_NAMES);
    const out: Record<string, CategoryName> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (valid.has(v)) out[k] = v as CategoryName;
    }
    return out;
  } catch (e) {
    console.error("geminiCategorize failed:", e);
    return {};
  }
}
