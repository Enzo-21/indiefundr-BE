import {
  WithdrawalOrderStatus,
  WithdrawalOrderStep,
  type WithdrawalOrder,
} from "@prisma/client";

export type WithdrawalOrderSettlementPhase =
  | "reserved"
  | "fueling"
  | "paying"
  | "confirming"
  | "succeeded"
  | "failed";

export type WithdrawalOrderDisplayStatus = "pending" | "confirmed" | "failed";

export type WithdrawalOrderSettlementView = {
  phase: WithdrawalOrderSettlementPhase;
  displayStatus: WithdrawalOrderDisplayStatus;
  settlementLabel: string;
  failureReason?: string;
};

export function buildWithdrawalOrderSettlementView(
  order: WithdrawalOrder
): WithdrawalOrderSettlementView {
  if (order.status === WithdrawalOrderStatus.completed) {
    return {
      phase: "succeeded",
      displayStatus: "confirmed",
      settlementLabel: "Completed",
    };
  }

  if (order.status === WithdrawalOrderStatus.failed) {
    return {
      phase: "failed",
      displayStatus: "failed",
      settlementLabel: "Failed",
      failureReason: order.failureReason ?? undefined,
    };
  }

  switch (order.step) {
    case WithdrawalOrderStep.awaiting_trx:
      return {
        phase: "reserved",
        displayStatus: "pending",
        settlementLabel: "Submitted",
      };
    case WithdrawalOrderStep.awaiting_usdt:
      return {
        phase: "paying",
        displayStatus: "pending",
        settlementLabel: "Sending USDT",
      };
    case WithdrawalOrderStep.awaiting_review:
      return {
        phase: "confirming",
        displayStatus: "pending",
        settlementLabel: "Confirming on network",
      };
    default:
      return {
        phase: "reserved",
        displayStatus: "pending",
        settlementLabel: "Processing",
      };
  }
}
