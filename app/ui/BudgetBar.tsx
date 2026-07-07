import { kr } from "@/lib/format";
import { AsciiBar } from "./AsciiBar";
import type { CategoryBudget } from "@/lib/budget";

/** One budget line rendered as terminal output: NAME  spent/budget  [bar] %. */
export function BudgetBar({ row }: { row: CategoryBudget }) {
  const hasBudget = row.budget != null && row.budget > 0;
  const ratio = hasBudget ? (row.pct ?? 0) : 0;
  const over = (row.pct ?? 0) > 1;
  const adjusted = row.adjustment !== 0;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5 text-sm">
      <span className="flex w-40 shrink-0 items-center gap-2 uppercase tracking-term">
        <span style={{ color: row.color }}>■</span>
        <span className="truncate text-ink2">{row.name}</span>
      </span>

      <span className="w-32 shrink-0 text-right tabular-nums text-muted">
        {kr(row.spent)}
        {hasBudget && <span className="text-faint"> / {kr(row.budget)}</span>}
      </span>

      {hasBudget ? (
        <AsciiBar ratio={ratio} width={16} />
      ) : (
        <span className="text-faint">[ no budget ]</span>
      )}

      {adjusted && (
        <span
          className={`tag ${row.adjustment > 0 ? "tag-ok" : "tag-warn"}`}
          title={`Adaptive adjustment ${row.adjustment > 0 ? "+" : ""}${kr(row.adjustment)}`}
        >
          {row.adjustment > 0 ? "+" : ""}
          {Math.round(row.adjustment)}
        </span>
      )}
      {over && <span className="tag tag-danger">[ OVER BUDGET ]</span>}
    </div>
  );
}
