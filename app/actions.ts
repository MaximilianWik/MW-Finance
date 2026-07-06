"use server";

import { revalidatePath } from "next/cache";
import { runSync } from "@/lib/sync";

/** Manual "Sync now" trigger from the dashboard. Uses Gemini to categorize
 *  any unknown merchants immediately. */
export async function syncNow() {
  const result = await runSync({ useGemini: true });
  revalidatePath("/");
  return result;
}
