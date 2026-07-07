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

export class EnableBankingError extends Error {
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

export async function createSession(code: string): Promise<EbSessionResponse> {
  return ebFetch<EbSessionResponse>("/sessions", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

/** One page of transactions from the Enable Banking API. */
async function fetchTransactionPage(
  uid: string,
  dateFrom: string,
  dateTo: string,
  continuationKey?: string
): Promise<EbTransactionsResponse> {
  return ebFetch<EbTransactionsResponse>(`/accounts/${uid}/transactions`, {
    query: {
      date_from: dateFrom,
      date_to: dateTo,
      continuation_key: continuationKey,
    },
  });
}

/**
 * Fetch all transactions for a single date window, following pagination.
 * Throws EnableBankingError on failure — caller decides whether to retry.
 */
async function fetchWindow(
  uid: string,
  dateFrom: string,
  dateTo: string
): Promise<EbTransaction[]> {
  const all: EbTransaction[] = [];
  let continuationKey: string | undefined;

  do {
    const page = await fetchTransactionPage(uid, dateFrom, dateTo, continuationKey);
    all.push(...(page.transactions ?? []));
    continuationKey = page.continuation_key ?? undefined;
  } while (continuationKey);

  return all;
}

/**
 * Fetch all transactions between two dates, splitting large ranges into
 * windows of at most `maxWindowDays` to stay within ASPSP limits.
 *
 * Swedish banks (including Länsförsäkringar) typically cap date ranges at
 * 89 days and refuse requests with date_to = today. Always pass yesterday
 * (or earlier) as dateTo.
 */
export async function getTransactions(
  uid: string,
  dateFrom: string,
  dateTo: string,
  maxWindowDays = 45
): Promise<EbTransaction[]> {
  const all: EbTransaction[] = [];

  const from = new Date(dateFrom + "T00:00:00Z");
  const to   = new Date(dateTo   + "T00:00:00Z");

  if (isNaN(from.getTime()) || isNaN(to.getTime()) || from > to) {
    return [];
  }

  let windowStart = from;

  while (windowStart <= to) {
    const windowEndMs = Math.min(
      windowStart.getTime() + maxWindowDays * 86400_000,
      to.getTime()
    );
    const windowEnd = new Date(windowEndMs);

    const wFrom = windowStart.toISOString().slice(0, 10);
    const wTo   = windowEnd.toISOString().slice(0, 10);

    let txs: EbTransaction[];
    try {
      txs = await fetchWindow(uid, wFrom, wTo);
    } catch (e) {
      if (
        e instanceof EnableBankingError &&
        e.status === 400 &&
        (e.body.includes("ASPSP_ERROR") || e.body.includes("Bad Request"))
      ) {
        // Retry this window split in half. If that also fails, let it throw.
        const halfDays = Math.floor(maxWindowDays / 2);
        if (halfDays >= 7) {
          console.warn(
            `ASPSP_ERROR on window ${wFrom}–${wTo}, retrying with ${halfDays}-day windows`
          );
          const sub = await getTransactions(uid, wFrom, wTo, halfDays);
          all.push(...sub);
          windowStart = new Date(windowEndMs + 86400_000);
          continue;
        }
      }
      throw e;
    }

    all.push(...txs);
    windowStart = new Date(windowEndMs + 86400_000);
  }

  return all;
}

export async function getBalances(uid: string): Promise<EbBalancesResponse> {
  return ebFetch<EbBalancesResponse>(`/accounts/${uid}/balances`);
}
