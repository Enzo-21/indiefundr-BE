import type { LedgerSnapshot } from "./ledger";

export type TreasuryLedgerHints = {
  poolAvailable: string[];
  treasurySurplus: string[];
  protectedRevenueAvailable: string[];
};

export function buildTreasuryLedgerHints(
  ledger: Pick<
    LedgerSnapshot,
    | "poolAvailable"
    | "treasurySurplus"
    | "poolLiquidity"
    | "protectedRevenueAvailable"
  >
): TreasuryLedgerHints {
  const poolAvailable: string[] = [
    "Gross unpaid treasury pool after recorded payouts and platform withdrawals.",
    "Surplus and withdrawable liquidity are labels inside this pool, not separate on-chain balances.",
    "Each subscription adds 25–100 USDT to the pool depending on the investor's tier.",
  ];

  const protectedRevenueAvailable = [
    "Withdrawable liquidity = pool − treasury surplus (matches simulation CSV).",
    "Not capped per subscription; surplus slice on subscribe builds the non-withdrawable buffer.",
    "Platform withdrawals debit pool and increase total withdrawn on the ledger.",
  ];

  const treasurySurplus = [
    "Non-withdrawable payout buffer inside the pool (not a separate on-chain wallet).",
    "Credited on each subscription: triad surplus ÷ 3 (e.g. Aggressive: +3.33 USDT per sub).",
    "FIFO surplus payouts debit pool and surplus by the full projected payout when surplus ≥ payout.",
    "surplus_draw also applies for mixed funding when the pool is below pool_min.",
  ];

  return {
    poolAvailable,
    protectedRevenueAvailable,
    treasurySurplus,
  };
}
