import { krSigned, shortDate } from "@/lib/format";
import { CategorySelect, type CatOption } from "./CategorySelect";

export interface TxRowData {
  id: number;
  direction: string;
  signed: number;
  counterpartyName: string | null;
  remittance: string | null;
  bookingDate: string | null;
  categoryId: number | null;
}

export function TxRow({ tx, options }: { tx: TxRowData; options: CatOption[] }) {
  const inflow = tx.signed >= 0;
  return (
    <li className="flex items-center gap-3 border-b border-edge/60 py-3 last:border-0">
      <div className="w-10 shrink-0 text-center text-[11px] text-muted">
        {shortDate(tx.bookingDate)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-white">
          {tx.counterpartyName ?? tx.remittance ?? "Transaction"}
        </div>
        <CategorySelect txId={tx.id} categoryId={tx.categoryId} options={options} />
      </div>
      <div className={`shrink-0 text-sm tabular-nums ${inflow ? "text-accent" : "text-white"}`}>
        {krSigned(tx.signed)}
      </div>
    </li>
  );
}
