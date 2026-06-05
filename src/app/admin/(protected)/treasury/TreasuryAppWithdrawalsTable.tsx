"use client";

import { useState } from "react";
import type { SerializedTreasuryOnChainReport } from "@/lib/serializers/treasuryAdmin";
import {
  badgeVariantForHistoryStatus,
  badgeVariantForWithdrawalSync,
} from "@/lib/admin/statusBadges";
import { formatUsdtDisplay } from "@/lib/money/formatUsdt";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type ChainTx = SerializedTreasuryOnChainReport["transactions"][number];

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

type Props = {
  transactions: ChainTx[];
};

export function TreasuryAppWithdrawalsTable({ transactions }: Props) {
  const [expandedTx, setExpandedTx] = useState<string | null>(null);

  const withdrawals = transactions.filter(
    (tx) => tx.category === "app_withdrawal" && tx.type === "out"
  );

  if (withdrawals.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No app revenue withdrawals detected on-chain. Outbound USDT to addresses
        outside user wallets is classified automatically when it occurs.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>Amount</TableHead>
          <TableHead>Counterparty</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Ledger</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {withdrawals.map((tx) => (
          <TableRow key={tx.txId}>
            <TableCell>{formatDate(tx.date)}</TableCell>
            <TableCell>−{formatUsdtDisplay(tx.amount)} USDT</TableCell>
            <TableCell
              className="max-w-[140px] cursor-pointer truncate font-mono text-xs"
              title={tx.counterparty}
              onClick={() =>
                setExpandedTx(expandedTx === tx.txId ? null : tx.txId)
              }
            >
              {expandedTx === tx.txId
                ? tx.counterparty
                : `${tx.counterparty.slice(0, 8)}…`}
            </TableCell>
            <TableCell>
              <Badge variant={badgeVariantForHistoryStatus(tx.status)}>
                {tx.status}
              </Badge>
            </TableCell>
            <TableCell>
              <Badge variant={badgeVariantForWithdrawalSync(tx.ledgerRecorded)}>
                {tx.ledgerRecorded ? "In ledger" : "Pending sync"}
              </Badge>
            </TableCell>
            <TableCell className="text-right">
              <a
                href={tx.tronscanUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-8 items-center justify-center rounded-md border border-input bg-background px-3 text-xs font-medium hover:bg-accent hover:text-accent-foreground"
              >
                TronScan
              </a>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
