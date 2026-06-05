import type { InvestmentStatus } from "@prisma/client";
import type {
  InvestmentLedgerEventKind,
  InvestmentLedgerSnapshot,
} from "@/services/admin/investmentLedgerSnapshots";

export type InvestmentDisplayKind = "subscription" | "payout";

export type AdminInvestmentDisplayRow = {
  rowKey: string;
  investmentId: string;
  displayKind: InvestmentDisplayKind;
  chronologicalStep: number;
  sortAtIso: string;
  eventKind: InvestmentLedgerEventKind;
  ledger: InvestmentLedgerSnapshot | null;
  /** Surplus change for this row's treasury event (credit on sub, draw on payout). */
  ledgerSurplusDelta: number | null;
  /** Payout row with no payout_outflow yet. */
  ledgerPending: boolean;
  /** Row has ledger but an earlier payout row is still unpaid. */
  ledgerContingent: boolean;
  amountUsdt: number;
  subscribedAtIso: string | null;
  subscribedColumnHint: string | null;
  userEmail: string;
  userName: string | null;
  fundName: string;
  returnPercent90d: number;
  investment: AdminInvestmentRow | null;
  /** Present on payout rows; subscription row data for status and scroll-to-pay. */
  parentInvestment: AdminInvestmentRow | null;
};

export type AdminInvestmentRow = {
  id: string;
  subscribedAtIso: string | null;
  returnPercent90d: number;
  ledgerAfterSubscribe: InvestmentLedgerSnapshot | null;
  ledgerAfterPayout: InvestmentLedgerSnapshot | null;
  ledgerEventKind: InvestmentLedgerEventKind;
  payoutUnlockingInvestmentIds: string[];
  userId: string;
  userEmail: string;
  userName: string | null;
  fundId: string;
  fundName: string;
  amountUsdt: number;
  projectedPayoutUsdt: number;
  status: InvestmentStatus;
  payabilityStatus: string;
  subscribedAt: Date | null;
  maturesAt: Date | null;
  payoutEligibleAt: Date | null;
  payoutUnlockedAt: Date | null;
  payoutReason: string | null;
  payoutTriggeredBy: string | null;
  payoutFailureReason: string | null;
  payoutStatus: string;
  surplusPayoutAvailableAt: Date | null;
  surplusShortfallUsdt: number;
  surplusPayoutReason: string;
  canPayWithSurplus: boolean;
  payoutUnlockers: {
    userId: string;
    name: string | null;
    email: string | null;
  }[];
  redeemedAt: Date | null;
  termDaysLeft: number | null;
  payoutEligibleInDays: number | null;
  canClaim: boolean;
  canPayNow: boolean;
  showPayoutActions: boolean;
  payNowBlockReason: string | null;
  surplusBlockReason: string | null;
  canConfirmRedemption: boolean;
  confirmRedemptionBlockReason: string | null;
  redemptionTxId: string | null;
};

export type AdminInvestmentsListResult = {
  rows: AdminInvestmentRow[];
  displayRows: AdminInvestmentDisplayRow[];
  currentLedger: {
    poolAvailable: number;
    treasurySurplus: number;
    poolLiquidity: number;
    protectedRevenueAvailable: number;
  };
  payoutAvailability: {
    unlockedPayoutCount: number;
    surplusPayoutCount: number;
  };
};
