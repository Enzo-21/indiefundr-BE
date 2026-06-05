import { formatUsdtDisplay } from "@/lib/money/formatUsdt";
import { getTronscanTxUrl } from "@/lib/wallets/helpers";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type RecordedWithdrawalRow = {
  _id: string;
  amountUsdt: number;
  slotsConsumed: number;
  txRef: string | null;
  note: string | null;
  createdBy: string;
  createdAt: Date | string;
};

function formatDate(d: Date | string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(typeof d === "string" ? new Date(d) : d);
}

type Props = {
  withdrawals: RecordedWithdrawalRow[];
  totalWithdrawn: number;
};

export function TreasuryRecordedWithdrawalsTable({
  withdrawals,
  totalWithdrawn,
}: Props) {
  const sum = withdrawals.reduce((acc, row) => acc + row.amountUsdt, 0);

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        The internal ledger &quot;Withdrawn&quot; total (
        {formatUsdtDisplay(totalWithdrawn)} USDT) is the sum of these persisted
        records — not the on-chain category badge alone. Use the on-chain table
        below to reclassify transfers between app withdrawal and untracked
        outflow.
      </p>
      {withdrawals.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No app revenue withdrawals recorded yet.
        </p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            {withdrawals.length} record{withdrawals.length === 1 ? "" : "s"} ·
            sum {formatUsdtDisplay(sum)} USDT
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Tx ref</TableHead>
                <TableHead>Created by</TableHead>
                <TableHead>Note</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {withdrawals.map((row) => (
                <TableRow key={row._id}>
                  <TableCell>{formatDate(row.createdAt)}</TableCell>
                  <TableCell>
                    {formatUsdtDisplay(row.amountUsdt)} USDT
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {row.txRef ? (
                      <a
                        href={getTronscanTxUrl(row.txRef)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline-offset-2 hover:underline"
                      >
                        {row.txRef.slice(0, 10)}…
                      </a>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-xs">{row.createdBy}</TableCell>
                  <TableCell className="max-w-[200px] truncate text-xs">
                    {row.note ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}
    </div>
  );
}
