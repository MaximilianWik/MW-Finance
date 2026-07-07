import { kr, pct } from "@/lib/format";
import type { CategoryBudget } from "@/lib/budget";

export function BudgetBar({ row }: { row: CategoryBudget }) {
  const hasBudget = row.budget != null && row.budget > 0;
  const ratio = hasBudget ? Math.min(row.pct ?? 0, 1) : 0;
  const over = (row.pct ?? 0) > 1;
  const barColor = over ? "#f87171" : (row.pct ?? 0) > 0.85 ? "#fbbf24" : row.color;
  const adjusted = row.adjustment !== 0;

  return (
    <div className="py-2">
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="flex items-center gap-2">
          <span>{row.emoji}</span>
          <span className="text-white">{row.name}</span>
          {adjusted && (
            <span
              title={`Adjusted by ${row.adjustment > 0 ? "+" : ""}${kr(row.adjustment)} this month`}
              className={
                "rounded px-1 text-[10px] uppercase " +
                (row.adjustment > 0
                  ? "bg-emerald-400/20 text-emerald-400"
                  : "bg-amber-400/20 text-amber-400")
              }
            >
              {row.adjustment > 0 ? "+" : ""}
              {Math.round(row.adjustment)}
            </span>
          )}
        </span>
        <span className="text-muted">
          {kr(row.spent)}
          {hasBudget && (
            <>
              {" "}
              / {kr(row.budget)}{" "}
              <span className={over ? "text-danger" : "text-muted"}>
                ({pct(row.pct)})
              </span>
            </>
          )}
        </span>
      </div>
      {hasBudget && (
        <div className="h-2 w-full overflow-hidden rounded-full bg-edge">
          <div
            className="bar-fill h-full rounded-full"
            style={{ width: `${Math.max(ratio * 100, 2)}%`, background: barColor }}
          />
        </div>
      )}
    </div>
  );
}
