import { sendNtfy } from "@/lib/notify";
import { env } from "@/lib/env";
import { kr } from "@/lib/format";
import { loadCategoryState } from "./adaptive";

/**
 * Projected end-of-month spend per budgeted category = current spend scaled
 * by days_in_month / days_elapsed. If projected > effective × threshold and
 * we're past day 10, fire an early-warning ntfy (once per category per day).
 *
 * We keep a super-simple in-memory dedupe by category + date to avoid flooding
 * ntfy when sync runs several times per day. Cross-invocation dedupe would
 * need a real store; the risk here is only cosmetic (a few extra pushes).
 */

const MIN_DAY_OF_MONTH = 10;
const PROJECTED_OVER = 1.1; // 110 %

interface TrajectoryWarning {
  categoryId: number;
  name: string;
  emoji: string;
  spent: number;
  projected: number;
  effective: number;
}

const alertedToday = new Set<string>(); // `${YYYY-MM-DD}:${categoryId}`

export async function checkTrajectory(today = new Date()): Promise<TrajectoryWarning[]> {
  const isoDay = today.toISOString().slice(0, 10);
  const month = isoDay.slice(0, 7);
  const [yStr, mStr, dStr] = isoDay.split("-");
  const day = parseInt(dStr, 10);
  const daysInMonth = new Date(
    Date.UTC(parseInt(yStr, 10), parseInt(mStr, 10), 0)
  ).getUTCDate();

  if (day < MIN_DAY_OF_MONTH) return [];

  const state = await loadCategoryState(month);
  const warnings: TrajectoryWarning[] = [];

  for (const s of state) {
    if (s.effective <= 0 || s.spent <= 0) continue;
    const projected = s.spent * (daysInMonth / day);
    if (projected <= s.effective * PROJECTED_OVER) continue;

    warnings.push({
      categoryId: s.categoryId,
      name: s.name,
      emoji: s.emoji,
      spent: s.spent,
      projected,
      effective: s.effective,
    });

    const key = `${isoDay}:${s.categoryId}`;
    if (alertedToday.has(key)) continue;
    alertedToday.add(key);

    await sendNtfy(
      `${s.emoji} ${s.name} on pace for ${kr(projected)} · budget ${kr(s.effective)}`,
      {
        title: "Trajectory warning",
        tags: ["chart_with_upwards_trend"],
        priority: 3,
        click: env.appUrl + "/insights",
      }
    );
  }

  return warnings;
}
