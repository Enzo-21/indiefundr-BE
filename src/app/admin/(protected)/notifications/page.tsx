import { fetchBroadcastPushStats } from "@/actions/admin/notifications";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { BroadcastPushForm } from "./BroadcastPushForm";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function AdminNotificationsPage() {
  const result = await fetchBroadcastPushStats();

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
        <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
        <p className="text-sm text-muted-foreground">
          Send a push notification to every user with a registered device token.
        </p>
      </div>

      <BroadcastPushForm initialStats={result.data} />
    </div>
  );
}
