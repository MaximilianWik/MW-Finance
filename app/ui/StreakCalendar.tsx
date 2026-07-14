import { kr } from "@/lib/format";
import type { DayRecord } from "@/lib/game/history";

const CELL = 12;
const GAP  = 2;
const STRIDE = CELL + GAP;
const LABEL_H = 18; // month label row height

function cellFill(r: DayRecord, today: string): string {
  if (!r.date || r.date > today) return "#151518";
  if (r.breach)  return "#c84040";
  if (r.noSpend) return "#4ec96a";
  return "#2a7a42";
}

function cellTooltip(r: DayRecord): string {
  if (!r.date) return "";
  const label = new Date(r.date + "T00:00:00Z").toLocaleDateString("en-GB", {
    day: "numeric", month: "short", timeZone: "UTC",
  });
  if (r.breach)  return `${label} · ${kr(r.spend)} · BREACH (+${kr(r.spend - r.pace)} over pace)`;
  if (r.noSpend) return `${label} · no spend`;
  return `${label} · ${kr(r.spend)} of ${kr(r.pace)} pace`;
}

/**
 * 12-week heatmap grid: green = clean/no-spend, red = breach.
 * Records must start on a Monday (guaranteed by getDayHistory).
 */
export function StreakCalendar({
  records,
  currentStreak,
  bestStreak,
}: {
  records: DayRecord[];
  currentStreak: number;
  bestStreak: number;
}) {
  const today = new Date().toISOString().slice(0, 10);

  // Pad tail so total cells are a multiple of 7 (full weeks).
  const padded = [...records];
  while (padded.length % 7 !== 0) {
    padded.push({ date: "", spend: 0, pace: 0, clean: true, breach: false, noSpend: true });
  }
  const weeks = padded.length / 7;

  const svgW = weeks * STRIDE - GAP;
  const svgH = LABEL_H + 7 * STRIDE - GAP;

  // Month labels: first week of each new month.
  const monthLabels: { col: number; label: string }[] = [];
  for (let w = 0; w < weeks; w++) {
    const rec = padded[w * 7];
    if (!rec.date) continue;
    const d = new Date(rec.date + "T00:00:00Z");
    const prevDate = w > 0 ? padded[(w - 1) * 7].date : "";
    const prevMonth = prevDate
      ? new Date(prevDate + "T00:00:00Z").getUTCMonth()
      : -1;
    if (prevMonth !== d.getUTCMonth()) {
      monthLabels.push({
        col: w,
        label: d.toLocaleString("en-GB", { month: "short", timeZone: "UTC" }),
      });
    }
  }

  const pastRecords = records.filter((r) => !!r.date && r.date <= today);
  const cleanCount  = pastRecords.filter((r) => r.clean).length;
  const breachCount = pastRecords.filter((r) => r.breach).length;

  return (
    <div className="flex flex-col gap-3">
      {/* Streak headline */}
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="text-2xl font-bold tabular-nums text-accent">
          {currentStreak}<span className="ml-1 text-sm font-normal text-muted">d uptime</span>
        </span>
        {bestStreak > currentStreak && (
          <span className="text-sm text-faint">best {bestStreak}d</span>
        )}
        <span className="ml-auto text-[0.65rem] uppercase tracking-term text-faint">
          {cleanCount} clean · {breachCount} breach
        </span>
      </div>

      {/* Grid */}
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${svgW} ${svgH}`}
          width={svgW}
          height={svgH}
          aria-label="84-day containment log"
        >
          {/* Month labels */}
          {monthLabels.map(({ col, label }) => (
            <text
              key={`m${col}`}
              x={col * STRIDE}
              y={LABEL_H - 5}
              fontSize="7.5"
              fill="#454552"
              fontFamily="monospace"
            >
              {label}
            </text>
          ))}

          {/* Cells */}
          {Array.from({ length: weeks }, (_, w) =>
            Array.from({ length: 7 }, (_, d) => {
              const r = padded[w * 7 + d];
              return (
                <rect
                  key={`${w}-${d}`}
                  className="anim-cell"
                  x={w * STRIDE}
                  y={LABEL_H + d * STRIDE}
                  width={CELL}
                  height={CELL}
                  rx={2}
                  fill={cellFill(r, today)}
                  style={{ animationDelay: `${w * 18 + d * 6}ms` }}
                >
                  {r.date && <title>{cellTooltip(r)}</title>}
                </rect>
              );
            })
          )}
        </svg>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.62rem] uppercase tracking-term">
        {[
          { color: "#4ec96a", label: "no spend" },
          { color: "#2a7a42", label: "under pace" },
          { color: "#c84040", label: "breach" },
          { color: "#151518", label: "no data" },
        ].map(({ color, label }) => (
          <span key={label} className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 shrink-0" style={{ background: color }} />
            <span className="text-faint">{label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
