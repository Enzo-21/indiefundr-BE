"use client";

import { useEffect, useRef } from "react";
import type { SerializedTreasuryOnChainReport } from "@/lib/serializers/treasuryAdmin";

type Props = {
  report: SerializedTreasuryOnChainReport;
};

export function TreasuryOnChainDebug({ report }: Props) {
  const logged = useRef(false);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    if (logged.current) return;
    logged.current = true;

    console.log("[admin treasury on-chain]", {
      balances: report.balances,
      chainSummary: report.chainSummary,
      sampleTransactions: report.transactions.slice(0, 5),
    });
  }, []);

  return null;
}
