import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSession } from "@/lib/enablebanking/client";
import { db } from "@/db";
import { bankSessions, accounts } from "@/db/schema";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(reason: string) {
  return NextResponse.redirect(`${env.appUrl}/?error=${encodeURIComponent(reason)}`);
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  const c = await cookies();
  const saved = c.get("eb_state")?.value;
  c.delete("eb_state");

  if (searchParams.get("error")) return fail(searchParams.get("error")!);
  if (!code) return fail("missing_code");
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
    }

    return NextResponse.redirect(`${env.appUrl}/?linked=${session.accounts?.length ?? 0}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return fail(msg.slice(0, 120));
  }
}
