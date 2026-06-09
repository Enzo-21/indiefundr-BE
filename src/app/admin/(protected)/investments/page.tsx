import { fetchAdminInvestments } from "@/actions/admin/dashboard";
import { ADMIN_INVESTMENTS_DEFAULT_LIMIT } from "@/services/admin/adminInvestmentListQuery";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { InvestmentsTable } from "./InvestmentsTable";

export const dynamic = "force-dynamic";

const INVESTMENTS_LIMIT = ADMIN_INVESTMENTS_DEFAULT_LIMIT;

export default async function AdminInvestmentsPage() {
  const result = await fetchAdminInvestments({
    view: "queue",
    limit: INVESTMENTS_LIMIT,
  });

  if (!result.ok) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{result.error.msg}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Investments</h1>
        <p className="text-sm text-muted-foreground">
          Chronological rows are subscriptions and completed payouts. The
          default action queue hides paid investments; use Paid / archive to
          browse redeemed history. Triad unlocks show a gray payout row
          (Pending treasury until paid). When two-user unlock is available, use
          Pay now. Otherwise Pay with surplus is offered in subscribe-date FIFO
          order — only investments that fit remaining surplus after earlier
          candidates qualify. A surplus_payout row appears only after you
          execute that payment. Surplus is shared; after each pay the page
          refreshes so buttons reflect remaining surplus (click a payout row ID
          to jump to its subscription).
        </p>
      </div>

      <InvestmentsTable initialData={result.data} limit={INVESTMENTS_LIMIT} />
    </div>
  );
}
