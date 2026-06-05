import { fetchAdminUsers } from "@/actions/admin/dashboard";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { formatUsdtDisplay } from "@/lib/money/formatUsdt";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

function formatDate(d: Date) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
  }).format(d);
}

function formatUsdt(value: number | null) {
  if (value == null) return "—";
  return formatUsdtDisplay(value, 4);
}

export default async function AdminUsersPage() {
  const result = await fetchAdminUsers();

  if (!result.ok) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{result.error.msg}</AlertDescription>
      </Alert>
    );
  }

  const users = result.data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
        <p className="text-sm text-muted-foreground">
          {users.length} registered users
        </p>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead>Wallets</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead className="text-right">Deposited</TableHead>
              <TableHead className="text-right">Withdrawn</TableHead>
              <TableHead>Funded</TableHead>
              <TableHead>Invested</TableHead>
              <TableHead>Investments</TableHead>
              <TableHead>Redeemed</TableHead>
              <TableHead>Paid</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={12} className="text-muted-foreground">
                  No users yet.
                </TableCell>
              </TableRow>
            ) : (
              users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.email}</TableCell>
                  <TableCell>{user.name}</TableCell>
                  <TableCell>{formatDate(user.joinedAt)}</TableCell>
                  <TableCell>{user.walletCount}</TableCell>
                  <TableCell className="text-right">
                    {formatUsdt(user.currentBalance)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatUsdt(user.totalDeposited)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatUsdt(user.totalWithdrawn)}
                  </TableCell>
                  <TableCell>
                    {user.hasFundedWallet ? (
                      <Badge variant="secondary">Yes</Badge>
                    ) : (
                      <Badge variant="outline">No</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {user.hasInvested ? (
                      <Badge variant="secondary">Yes</Badge>
                    ) : (
                      <Badge variant="outline">No</Badge>
                    )}
                  </TableCell>
                  <TableCell>{user.investmentCount}</TableCell>
                  <TableCell>{user.redeemedCount}</TableCell>
                  <TableCell>
                    {user.hasPaid ? (
                      <Badge>Yes</Badge>
                    ) : (
                      <Badge variant="outline">No</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">
        Balance, deposited, and withdrawn totals come from on-chain TRC20
        history. App invest and redemption flows are excluded. Transfers between
        app user wallets count as deposits or withdrawals for each party.
      </p>
    </div>
  );
}
