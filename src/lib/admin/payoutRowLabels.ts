/** Plain-language payout status for gray payout rows (server-safe). */
export function formatPayoutRowStatusLabel(payoutStatus: string) {
  switch (payoutStatus) {
    case "paid":
    case "paid_surplus":
      return "completed";
    case "paying":
    case "paying_surplus":
      return "paying";
    case "ready":
    case "waiting":
      return "waiting";
    case "failed":
      return "failed";
    default:
      return payoutStatus;
  }
}
