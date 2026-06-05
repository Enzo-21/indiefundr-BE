"use client";

import { useState } from "react";
import type { SerializedTreasuryOnChainReport } from "@/lib/serializers/treasuryAdmin";
import {
  badgeVariantForClassificationSource,
  badgeVariantForHistoryStatus,
  badgeVariantForTreasuryCategory,
} from "@/lib/admin/statusBadges";
import { formatUsdtDisplay } from "@/lib/money/formatUsdt";
import { TreasuryChainTxClassifyButtons } from "./TreasuryChainTxClassifyButtons";
import { TreasuryExternalInflowButtons } from "./TreasuryExternalInflowButtons";
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

function categoryLabel(category: ChainTx["category"]) {
  switch (category) {
    case "user_payment":
      return "User payment";
    case "user_payout":
      return "User payout";
    case "app_withdrawal":
      return "App withdrawal";
    case "treasury_outflow_untracked":
      return "Treasury outflow (untracked)";
    case "external_in":
      return "External deposit";
    case "wallet_match_unconfirmed":
      return "Wallet match only";
    default:
      return category;
  }
}

function sourceLabel(source: ChainTx["classificationSource"]) {
  switch (source) {
    case "app_tx":
      return "App tx";
    case "address_only":
      return "Address only";
    case "external":
      return "External";
    default:
      return source;
  }
}

type Props = {
  transactions: ChainTx[];
};

export function TreasuryChainTxTable({ transactions }: Props) {
  const [expandedTx, setExpandedTx] = useState<string | null>(null);

  if (transactions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No on-chain USDT transfers found for the treasury wallet.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>Category</TableHead>
          <TableHead>Source</TableHead>
          <TableHead>Amount</TableHead>
          <TableHead>Counterparty</TableHead>
          <TableHead>User / detail</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {transactions.map((tx) => (
          <TableRow key={tx.txId}>
            <TableCell>{formatDate(tx.date)}</TableCell>
            <TableCell>
              <Badge variant={badgeVariantForTreasuryCategory(tx.category)}>
                {categoryLabel(tx.category)}
              </Badge>
              {tx.adminCategoryOverride ? (
                <Badge variant="neutral" className="ml-1 text-[10px]">
                  Override
                </Badge>
              ) : null}
              {tx.ledgerRecorded ? (
                <Badge variant="success" className="ml-1 text-[10px]">
                  In ledger
                </Badge>
              ) : null}
              {tx.inflowTreatment === "surplus" ? (
                <Badge variant="neutral" className="ml-1 text-[10px]">
                  Surplus
                </Badge>
              ) : tx.inflowTreatment === "withdrawable" ? (
                <Badge variant="success" className="ml-1 text-[10px]">
                  Withdrawable
                </Badge>
              ) : null}
            </TableCell>
            <TableCell>
              <Badge
                variant={badgeVariantForClassificationSource(
                  tx.classificationSource
                )}
              >
                {sourceLabel(tx.classificationSource)}
              </Badge>
            </TableCell>
            <TableCell>
              {tx.type === "in" ? "+" : "−"}
              {formatUsdtDisplay(tx.amount)} USDT
            </TableCell>
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
            <TableCell className="max-w-[200px]">
              <div className="truncate text-sm">{tx.detail}</div>
              {tx.userEmail ? (
                <div className="truncate text-xs text-muted-foreground">
                  {tx.userEmail}
                </div>
              ) : null}
            </TableCell>
            <TableCell>
              <Badge variant={badgeVariantForHistoryStatus(tx.status)}>
                {tx.status}
              </Badge>
            </TableCell>
            <TableCell className="text-right">
              <div className="flex flex-col items-end gap-2">
                <TreasuryChainTxClassifyButtons tx={tx} />
                <TreasuryExternalInflowButtons
                  txId={tx.txId}
                  amountUsdt={tx.amount}
                  inflowTreatment={tx.inflowTreatment}
                  inflowActionsEligible={tx.inflowActionsEligible}
                />
                <a
                  href={tx.tronscanUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-8 items-center justify-center rounded-md border border-input bg-background px-3 text-xs font-medium hover:bg-accent hover:text-accent-foreground"
                >
                  TronScan
                </a>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
