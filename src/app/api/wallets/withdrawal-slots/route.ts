import { withAuth } from "@/lib/http/withAuth";
import { getWithdrawalSlotUsage } from "@/lib/config/withdrawalSlots";

export async function GET(request: Request) {
  return withAuth(request, async (authUser) => {
    const usage = await getWithdrawalSlotUsage(authUser.id);
    return Response.json({
      earned: usage.earned,
      used: usage.used,
      available: usage.available,
      openWithdrawals: usage.openWithdrawals,
      completedWithdrawals: usage.completedWithdrawals,
    });
  });
}
