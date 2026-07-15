"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { transactions, eventSuggestions } from "@/db/schema";
import { runSync } from "@/lib/sync";

/** Manual "Sync now" trigger from the dashboard. Uses Gemini to categorize
 *  any unknown merchants immediately. */
export async function syncNow() {
  const result = await runSync({ useGemini: true });
  revalidatePath("/");
  return result;
}

/** Clear the flagged_reason on a transaction, removing it from the anomaly card. */
export async function dismissAnomaly(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!id) return;
  await db.update(transactions).set({ flaggedReason: null }).where(eq(transactions.id, id));
  revalidatePath("/");
}

/** Soft-dismiss an event suggestion so it stops showing (and won't resurface). */
export async function dismissEvent(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!id) return;
  await db.update(eventSuggestions).set({ dismissed: true }).where(eq(eventSuggestions.id, id));
  revalidatePath("/weekend");
}
