import type { SerializedTreasuryOnChainReport } from "@/lib/serializers/treasuryAdmin";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { TreasuryAppWithdrawalsTable } from "./TreasuryAppWithdrawalsTable";
import { TreasuryChainTxTable } from "./TreasuryChainTxTable";

type Props = {
  transactions: SerializedTreasuryOnChainReport["transactions"];
};

export function TreasuryActivityPanel({ transactions }: Props) {
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>App revenue withdrawals (on-chain)</CardTitle>
          <CardDescription>
            Outbound USDT linked to app revenue withdrawals. Use &quot;Record as
            app withdrawal&quot; on an untracked outflow to debit the internal
            ledger; use &quot;Mark untracked&quot; to reverse a mistaken
            withdrawal record.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <TreasuryAppWithdrawalsTable transactions={transactions} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>On-chain USDT history</CardTitle>
          <CardDescription>
            Live TRC-20 activity for the treasury wallet. Categories can be
            changed for outbound transfers between app withdrawal (ledger) and
            untracked outflow. User payments and payouts require a matching app
            transaction ID.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <TreasuryChainTxTable transactions={transactions} />
        </CardContent>
      </Card>
    </>
  );
}
