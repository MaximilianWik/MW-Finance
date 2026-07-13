import { db } from "@/db";
import { transactions } from "@/db/schema";
import { inArray } from "drizzle-orm";
import { detectAndPersistRecurrings } from "./recurring";
import { checkMissingRecurrings } from "./missing";
import { flagSuspicious } from "./suspicious";
import { evaluateAdaptiveForCategories } from "./adaptive";
import { checkTrajectory } from "./trajectory";
import { runMonthlySweep } from "@/lib/savings";
import { runGameEval } from "@/lib/game/eval";
import type { NewTransaction } from "@/db/schema";

/**
 * Runs the behavior-layer pipeline against the rows inserted by a sync.
 * Every step catches its own errors so a single failure never poisons the
 * whole batch.
 */
export async function runBehaviorPipeline(
  inserted: NewTransaction[],
  onLog?: (line: string) => void
) {
  const results = {
    recurringsDetected: 0,
    missing: 0,
    flagged: 0,
    adaptive: 0,
    trajectory: 0,
    sweepMonth: null as string | null,
    gameBreach: false,
  };

  // Detect recurrings from ALL history (not just this batch). Cheap and lets
  // us catch a first-detection as soon as the 3rd occurrence lands.
  try {
    const detected = await detectAndPersistRecurrings();
    results.recurringsDetected = detected.length;
  } catch (e) {
    console.error("recurring detection failed:", e);
  }

  // Missing-payment alerts.
  try {
    const missed = await checkMissingRecurrings();
    results.missing = missed.length;
  } catch (e) {
    console.error("missing-payment check failed:", e);
  }

  // Suspicious-payment flags for the new rows.
  try {
    const flagged = await flagSuspicious(inserted, onLog);
    results.flagged = flagged.length;
  } catch (e) {
    console.error("suspicious flagging failed:", e);
  }

  // Adaptive redistribution: fetch categoryId for each newly-inserted DBIT
  // and evaluate each affected category once.
  try {
    const ids = inserted
      .filter((r) => r.direction === "DBIT" && r.id != null)
      .map((r) => r.id as number);
    if (ids.length > 0) {
      const rows = await db
        .select({ categoryId: transactions.categoryId })
        .from(transactions)
        .where(inArray(transactions.id, ids));
      const catIds = rows
        .map((r) => r.categoryId)
        .filter((n): n is number => n != null);
      const adaptive = await evaluateAdaptiveForCategories(catIds);
      results.adaptive = adaptive.length;
    }
  } catch (e) {
    console.error("adaptive redistribution failed:", e);
  }

  // Trajectory warnings (past day 10).
  try {
    const warnings = await checkTrajectory();
    results.trajectory = warnings.length;
  } catch (e) {
    console.error("trajectory check failed:", e);
  }

  // Monthly sweep: only fires on the first sync of a new month.
  try {
    const sweep = await runMonthlySweep();
    if (sweep.executed) results.sweepMonth = sweep.month;
  } catch (e) {
    console.error("monthly sweep failed:", e);
  }

  // Reactor Core eval: streak, weekly challenges, achievements, breach alerts.
  try {
    const game = await runGameEval(onLog);
    results.gameBreach = game.breach;
  } catch (e) {
    console.error("game eval failed:", e);
  }

  return results;
}
