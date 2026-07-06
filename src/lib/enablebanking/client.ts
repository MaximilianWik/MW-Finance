import { env } from "@/lib/env";
import { getAuthToken } from "./jwt";
import type {
  EbAuthResponse,
  EbSessionResponse,
  EbTransaction,
  EbTransactionsResponse,
  EbBalancesResponse,
} from "./types";

const BASE = "https://api.enablebanking.com";

class EnableBankingError extends Error {
  constructor(
    public status: number,
    public body: string,
    message: string
  ) {
    super(message);
    this.name = "EnableBankingError";
  }
}

async function ebFetch<T>(
  path: string,
  init: RequestInit & { query?: Record<string, string | undefined> } = {}
): Promise<T> {
  const token = await getAuthToken();
  const url = new URL(BASE + path);
  if (init.query) {
    for (const [k, v] of Object.entries(init.query)) {
      if (v != null) url.searchParams.set(k, v);
    }
  }
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });

  const text = await res.text();
  if (!res.ok) {
    throw new EnableBankingError(
      res.status,
      text,
      `Enable Banking ${init.method ?? "GET"} ${path} → ${res.status}: ${text.slice(0, 500)}`
    );
  }
  return (text ? JSON.parse(text) : {}) as T;
}

/**
 * Begin the consent flow. Returns the URL to redirect the user's browser to.
 * `state` is your CSRF token, echoed back on the callback.
 */
export async function startAuth(state: string): Promise<EbAuthResponse> {
  const validUntil = new Date(
    Date.now() + env.enableBanking.consentDays * 24 * 60 * 60 * 1000
  ).toISOString();

  return ebFetch<EbAuthResponse>("/auth", {
    method: "POST",
    body: JSON.stringify({
      access: { valid_until: validUntil },
      aspsp: {
        name: env.enableBanking.aspspName,
        country: env.enableBanking.aspspCountry,
      },
      state,
      redirect_url: env.enableBanking.redirectUrl,
      psu_type: env.enableBanking.psuType,
    }),
  });
}

/** Exchange the authorization `code` from the callback for a session + accounts. */
export async function createSession(code: string): Promise<EbSessionResponse> {
  return ebFetch<EbSessionResponse>("/sessions", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

/**
 * Fetch all transactions for an account between two dates, following
 * `continuation_key` pagination until exhausted.
 */
export async function getTransactions(
  uid: string,
  dateFrom: string,
  dateTo?: string
): Promise<EbTransaction[]> {
  const all: EbTransaction[] = [];
  let continuationKey: string | undefined;

  do {
    const page: EbTransactionsResponse = await ebFetch<EbTransactionsResponse>(
      `/accounts/${uid}/transactions`,
      {
        query: {
          date_from: dateFrom,
          date_to: dateTo,
          continuation_key: continuationKey,
        },
      }
    );
    all.push(...(page.transactions ?? []));
    continuationKey = page.continuation_key ?? undefined;
  } while (continuationKey);

  return all;
}

/** Fetch current balances for an account. */
export async function getBalances(uid: string): Promise<EbBalancesResponse> {
  return ebFetch<EbBalancesResponse>(`/accounts/${uid}/balances`);
}

export { EnableBankingError };
