"use client";

import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatUsdtDisplay } from "@/lib/money/formatUsdt";
import { cn } from "@/lib/utils";
import type { AdminFundedUserRow } from "@/services/admin/dashboardWalletStats";
import {
  adminErrorDescription,
  adminErrorTitle,
  type AdminActionError,
} from "./dashboardAdminErrors";

type DashboardFundedUsersTableProps = {
  fundedUsers: AdminFundedUserRow[];
  error: AdminActionError | null;
  isLoading: boolean;
};

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(value);
}

function formatUsdt(value: number) {
  return formatUsdtDisplay(value, 4);
}

export function DashboardFundedUsersTable({
  fundedUsers,
  error,
  isLoading,
}: DashboardFundedUsersTableProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Recently funded users</h2>
          <p className="text-sm text-muted-foreground">
            Deposits and balances from synced wallet data (invest/redemption excluded).
          </p>
        </div>
        <Link
          href="/admin/users"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          All users
        </Link>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>
            {adminErrorTitle(error, "Could not load recently funded users")}
          </AlertTitle>
          <AlertDescription>{adminErrorDescription(error)}</AlertDescription>
        </Alert>
      ) : null}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Name</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead className="text-right">Deposited</TableHead>
              <TableHead className="text-right">Withdrawn</TableHead>
              <TableHead>Joined</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, index) => (
                <TableRow key={index}>
                  {Array.from({ length: 6 }).map((__, cellIndex) => (
                    <TableCell key={cellIndex}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : fundedUsers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground">
                  {error
                    ? "Recently funded users could not load."
                    : "No funded wallets yet."}
                </TableCell>
              </TableRow>
            ) : (
              fundedUsers.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.email}</TableCell>
                  <TableCell>{user.name}</TableCell>
                  <TableCell className="text-right">
                    {formatUsdt(user.currentBalance)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatUsdt(user.totalDeposited)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatUsdt(user.totalWithdrawn)}
                  </TableCell>
                  <TableCell>{formatDate(new Date(user.joinedAt))}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
