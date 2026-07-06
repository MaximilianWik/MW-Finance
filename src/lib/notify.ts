import { env } from "@/lib/env";

export interface NtfyOptions {
  title?: string;
  tags?: string[]; // emoji shortcodes, e.g. ["money_with_wings"]
  priority?: 1 | 2 | 3 | 4 | 5;
  click?: string; // URL opened when the notification is tapped
}

/** Send a push notification via ntfy. Never throws — logs and returns bool. */
export async function sendNtfy(message: string, opts: NtfyOptions = {}): Promise<boolean> {
  try {
    const headers: Record<string, string> = { "Content-Type": "text/plain; charset=utf-8" };
    if (opts.title) headers["X-Title"] = opts.title;
    if (opts.tags?.length) headers["X-Tags"] = opts.tags.join(",");
    if (opts.priority) headers["X-Priority"] = String(opts.priority);
    if (opts.click) headers["X-Click"] = opts.click;

    const res = await fetch(`${env.ntfy.server}/${env.ntfy.topic}`, {
      method: "POST",
      headers,
      body: message,
      cache: "no-store",
    });
    if (!res.ok) {
      console.error("ntfy failed:", res.status, await res.text());
      return false;
    }
    return true;
  } catch (e) {
    console.error("ntfy error:", e);
    return false;
  }
}

const kr = (n: number) =>
  `${Math.round(n).toLocaleString("sv-SE")} kr`;

/**
 * Budget-remaining message, e.g.:
 *   "Pizza −100 kr → 400 kr left of 500 kr Restaurants budget"
 */
export function budgetMessage(params: {
  merchant: string;
  spent: number; // absolute amount of this transaction
  remaining: number; // remaining budget after this transaction
  budget: number;
  category: string;
}): string {
  const { merchant, spent, remaining, budget, category } = params;
  const rem = remaining < 0 ? `${kr(remaining)} over` : `${kr(remaining)} left`;
  return `${merchant} −${kr(spent)} → ${rem} of ${kr(budget)} ${category} budget`;
}
