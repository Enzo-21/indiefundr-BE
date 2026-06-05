import { fetchAdminHistory } from "@/actions/admin/history";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { HistoryTable } from "./HistoryTable";

export const dynamic = "force-dynamic";

const HISTORY_LIMIT = 100;

export default async function AdminHistoryPage() {
  const result = await fetchAdminHistory(HISTORY_LIMIT);

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
        <h1 className="text-2xl font-semibold tracking-tight">History</h1>
        <p className="text-sm text-muted-foreground">
          Chronological transaction history for internal ledger events and
          persisted on-chain USDT activity across treasury and user wallets.
          Newest transactions appear first. Ledger rows are accounting entries;
          on-chain audit rows are wallet transfers, so do not add both sources
          together as one balance.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Transaction history</CardTitle>
          <CardDescription>
            Updates automatically every 20 seconds while this page is open.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <HistoryTable
            initialSnapshot={result.data}
            limit={HISTORY_LIMIT}
          />
        </CardContent>
      </Card>
    </div>
  );
}
