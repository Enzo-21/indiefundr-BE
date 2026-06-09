import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { assertAdminSession } from "@/lib/auth/assertAdminSession";
import { AuthError } from "@/lib/auth/errors";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SubscriptionRowActions } from "./SubscriptionRowActions";
import { SubscriptionsOrderStatusBar } from "./SubscriptionsOrderStatusBar";
import { formatRelativeSince } from "@/lib/admin/formatRelativeSince";
import { formatUsdtDisplay } from "@/lib/money/formatUsdt";
import { listAdminOrderQueue } from "@/services/admin/purchaseOrderFulfillment";

export const dynamic = "force-dynamic";

function formatBalance(value: number | null) {
  if (value == null) {
    return "—";
  }
  return formatUsdtDisplay(value, value < 1 ? 4 : 2);
}

export default async function AdminSubscriptionsPage() {
  noStore();

  try {
    await assertAdminSession();
  } catch (error) {
    const message =
      error instanceof AuthError
        ? error.msg
        : "You are not authorized to view subscriptions.";
    return (
      <Alert variant="destructive">
        <AlertDescription>{message}</AlertDescription>
      </Alert>
    );
  }

  let rows;
  let pendingInvestmentCount = 0;
  let pendingWithdrawalCount = 0;
  let pendingReferralCount = 0;
  try {
    rows = await listAdminOrderQueue();
    pendingInvestmentCount = rows.filter(
      (row) => row.orderType === "subscribe"
    ).length;
    pendingWithdrawalCount = rows.filter(
      (row) => row.orderType === "withdraw"
    ).length;
    pendingReferralCount = rows.filter(
      (row) => row.orderType === "referral"
    ).length;
  } catch (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          {error instanceof Error
            ? error.message
            : "Failed to load order queue."}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Orders</h1>
        <p className="text-sm text-muted-foreground">
          Pending investment, withdrawal, and referral payout orders. Investment
          and withdrawal flows support TRX top-up and USDT payment. Referral
          orders pay treasury USDT to user wallets when both parties have
          invested (or principal recovery when two recovery slots qualify).
        </p>
        <div className="mt-3">
          <SubscriptionsOrderStatusBar
            pendingInvestmentCount={pendingInvestmentCount}
            pendingWithdrawalCount={pendingWithdrawalCount}
            pendingReferralCount={pendingReferralCount}
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Normalized date</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Fund / destination</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Wallet</TableHead>
              <TableHead>TRX</TableHead>
              <TableHead>USDT</TableHead>
              <TableHead>Reserved</TableHead>
              <TableHead>Tx links</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} className="text-center text-muted-foreground">
                  No pending orders.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.orderId}>
                  <TableCell>
                    <div className="text-sm font-medium">{row.userName}</div>
                    <div className="text-xs text-muted-foreground">
                      {row.userEmail}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">{formatRelativeSince(row.normalizedDateIso)}</div>
                    <div className="font-mono text-xs text-muted-foreground">
                      {row.normalizedDateIso}
                    </div>
                  </TableCell>
                  <TableCell>
                    {row.orderType === "withdraw"
                      ? "Withdrawal"
                      : row.orderType === "referral"
                        ? "Referral"
                        : "Investment"}
                  </TableCell>
                  <TableCell className="max-w-[200px]">
                    {row.orderType === "withdraw" ? (
                      <span className="break-all font-mono text-xs">
                        {row.destinationAddress}
                      </span>
                    ) : row.orderType === "referral" ? (
                      <div className="text-sm">
                        <div>{row.kindLabel}</div>
                        {row.referralInviteId ? (
                          <div className="font-mono text-xs text-muted-foreground">
                            invite {row.referralInviteId.slice(-6)}
                          </div>
                        ) : null}
                        {row.investmentId ? (
                          <div className="font-mono text-xs text-muted-foreground">
                            investment {row.investmentId.slice(-6)}
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      row.fundName
                    )}
                  </TableCell>
                  <TableCell>
                    {formatUsdtDisplay(row.costUsdt)} USDT
                  </TableCell>
                  <TableCell className="max-w-[140px] truncate font-mono text-xs">
                    {row.walletAddress}
                  </TableCell>
                  <TableCell>
                    {row.orderType === "referral"
                      ? "—"
                      : formatBalance(row.trxBalance)}
                  </TableCell>
                  <TableCell>
                    {row.orderType === "referral" ? (
                      "—"
                    ) : (
                      <>
                        {formatBalance(row.usdtBalance)}
                        {row.balanceReadStatus === "rate_limited" ? (
                          <div className="text-xs text-amber-600">
                            Rate limited; refresh shortly
                          </div>
                        ) : null}
                        {row.balanceReadStatus === "read_failed" ? (
                          <div className="text-xs text-muted-foreground">
                            Chain read failed
                          </div>
                        ) : null}
                      </>
                    )}
                  </TableCell>
                  <TableCell>
                    {row.orderType === "referral" ? "—" : row.reservedUsdt}
                  </TableCell>
                  <TableCell className="space-y-1 text-xs">
                    {row.orderType === "referral" ? (
                      row.usdtTronscanUrl ? (
                        <Link
                          href={row.usdtTronscanUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary underline"
                        >
                          USDT tx
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">No USDT tx</span>
                      )
                    ) : (
                      <>
                        {row.topUpTronscanUrl ? (
                          <Link
                            href={row.topUpTronscanUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary underline"
                          >
                            TRX tx
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">No TRX tx</span>
                        )}
                        <br />
                        {row.usdtTronscanUrl ? (
                          <Link
                            href={row.usdtTronscanUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary underline"
                          >
                            USDT tx
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">No USDT tx</span>
                        )}
                      </>
                    )}
                  </TableCell>
                  <TableCell>
                    <SubscriptionRowActions row={row} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
