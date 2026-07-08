import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSession } from "@/lib/enablebanking/client";
import { db } from "@/db";
import { bankSessions, accounts, transactions } from "@/db/schema";
import { eq, and, notInArray, sql } from "drizzle-orm";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(reason: string) {
  return NextResponse.redirect(`${env.appUrl}/?error=${encodeURIComponent(reason)}`);
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code  = searchParams.get("code");
  const state = searchParams.get("state");

  const c = await cookies();
  const saved = c.get("eb_state")?.value;
  c.delete("eb_state");
  const autoSync = c.get("eb_auto_sync")?.value === "1";
  c.delete("eb_auto_sync");

  if (searchParams.get("error")) return fail(searchParams.get("error")!);
  if (!code)  return fail("missing_code");
  if (!state || state !== saved) return fail("state_mismatch");

  try {
    const session = await createSession(code);

    await db
      .insert(bankSessions)
      .values({
        sessionId: session.session_id,
        aspspName: session.aspsp.name,
        aspspCountry: session.aspsp.country,
        psuType: session.psu_type,
        validUntil: session.access?.valid_until
          ? new Date(session.access.valid_until)
          : null,
      })
      .onConflictDoUpdate({
        target: bankSessions.sessionId,
        set: {
          validUntil: session.access?.valid_until
            ? new Date(session.access.valid_until)
            : null,
        },
      });

    const newUids: string[] = [];
    const newIbanToUid = new Map<string, string>(); // iban → new uid

    for (const a of session.accounts ?? []) {
      await db
        .insert(accounts)
        .values({
          uid: a.uid,
          sessionId: session.session_id,
          name: a.name ?? null,
          iban: a.account_id?.iban ?? null,
          currency: a.currency ?? "SEK",
          product: a.product ?? null,
          cashAccountType: a.cash_account_type ?? null,
          usage: a.usage ?? null,
          aspspName: session.aspsp.name,
          aspspCountry: session.aspsp.country,
        })
        .onConflictDoUpdate({
          target: accounts.uid,
          set: {
            sessionId: session.session_id,
            name: a.name ?? null,
            iban: a.account_id?.iban ?? null,
            currency: a.currency ?? "SEK",
          },
        });
      newUids.push(a.uid);
      if (a.account_id?.iban) newIbanToUid.set(a.account_id.iban, a.uid);
    }

    // ── Migrate & clean up stale accounts from old sessions ───────────────────
    // When LF Bank assigns new UIDs on re-authorization, old accounts stay in the
    // DB and the next sync would re-insert duplicate transactions under the new
    // UID. Instead: for each new account, find any old account with the SAME IBAN
    // → migrate its transactions to the new UID (avoiding duplicates), then
    // delete the stale account row.
    if (newUids.length > 0) {
      const staleAccounts = await db
        .select({ uid: accounts.uid, iban: accounts.iban })
        .from(accounts)
        .where(
          and(
            eq(accounts.aspspName, session.aspsp.name),
            eq(accounts.aspspCountry, session.aspsp.country),
            notInArray(accounts.uid, newUids)
          )
        );

      for (const stale of staleAccounts) {
        const newUid = stale.iban ? newIbanToUid.get(stale.iban) : undefined;

        if (newUid) {
          // Same IBAN → migrate all transactions to the new UID, then delete.
          // The sync dedupe is (account_uid, dedupe_key) — after migration,
          // re-synced transactions will hit the existing rows and skip them.
          await db
            .update(transactions)
            .set({ accountUid: newUid })
            .where(eq(transactions.accountUid, stale.uid));
        }

        // Delete the now-empty (or IBAN-unmatched) stale account.
        // If no IBAN match, only delete if there are no transactions remaining.
        const [{ count }] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(transactions)
          .where(eq(transactions.accountUid, stale.uid));

        if (count === 0) {
          await db.delete(accounts).where(eq(accounts.uid, stale.uid));
        }
      }
    }

    const linked = session.accounts?.length ?? 0;
    const returnUrl = `${env.appUrl}/?linked=${linked}${autoSync ? "&autoSync=1" : ""}`;
    return NextResponse.redirect(returnUrl);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return fail(msg.slice(0, 120));
  }
}
