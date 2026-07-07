import { krSigned, shortDate } from "@/lib/format";
import { CategoryCommand, type CatOption } from "./CategoryCommand";

export interface TxRowData {
  id: number;
  direction: string;
  signed: number;
  counterpartyName: string | null;
  remittance: string | null;
  bookingDate: string | null;
  categoryId: number | null;
  flaggedReason?: string | null;
}

/** One row of the terminal ledger table. Expects a <tbody> parent. */
export function TxRow({ tx, options }: { tx: TxRowData; options: CatOption[] }) {
  const inflow = tx.signed >= 0;
  const flagged = !!tx.flaggedReason;
  return (
    <tr className={flagged ? "bg-danger/5" : undefined}>
      <td className="w-16 whitespace-nowrap text-muted">{shortDate(tx.bookingDate)}</td>
      <td className="max-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate text-ink2">
            {tx.counterpartyName ?? tx.remittance ?? "—"}
          </span>
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
      <td className={`w-28 text-right ${inflow ? "text-accent" : "text-ink2"}`}>
        {krSigned(tx.signed)}
      </td>
    </tr>
  );
}
