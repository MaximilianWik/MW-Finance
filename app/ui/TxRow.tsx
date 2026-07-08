import { krSigned, shortDate } from "@/lib/format";
import { CategoryCommand, type CatOption } from "./CategoryCommand";
import { MarkRecurring, UnmarkRecurring } from "./RecurringActions";

export interface TxRowData {
  id: number;
  direction: string;
  signed: number;
  counterpartyName: string | null;
  remittance: string | null;
  merchant: string | null;
  bookingDate: string | null;
  categoryId: number | null;
  flaggedReason?: string | null;
  recurring?: boolean;
}

/** One row of the terminal ledger table. Expects a <tbody> parent. */
export function TxRow({ tx, options }: { tx: TxRowData; options: CatOption[] }) {
  const inflow = tx.signed >= 0;
  const flagged = !!tx.flaggedReason;
  const displayName = tx.counterpartyName ?? tx.remittance ?? "—";

  return (
    <tr className={`group/row ${flagged ? "bg-danger/5" : ""}`}>
      <td className="w-16 whitespace-nowrap text-muted">{shortDate(tx.bookingDate)}</td>
      <td className="max-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate text-ink2">{displayName}</span>
          {flagged && (
            <span className="tag tag-danger shrink-0" title={tx.flaggedReason ?? ""}>
              [!] ANOMALY
            </span>
          )}
        </div>
      </td>
      <td className="w-40">
        <CategoryCommand txId={tx.id} categoryId={tx.categoryId} options={options} />
      </td>
      {/* Recurring: tag when merchant matches an active recurring payment,
          otherwise offer to mark DBIT rows as recurring. */}
      <td className="w-24 text-center">
        {tx.recurring ? (
          <UnmarkRecurring merchant={tx.merchant} />
        ) : tx.direction === "DBIT" ? (
          <div className="flex flex-col items-center gap-0.5">
            <MarkRecurring txId={tx.id} merchant={displayName} />
            <MarkRecurring txId={tx.id} merchant={displayName} variable />
          </div>
        ) : null}
      </td>
      <td className={`w-28 text-right ${inflow ? "text-accent" : "text-ink2"}`}>
        {krSigned(tx.signed)}
      </td>
    </tr>
  );
}
