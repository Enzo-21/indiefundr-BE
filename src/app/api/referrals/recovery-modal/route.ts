import { withAuth } from "@/lib/http/withAuth";
import { shouldShowRecoveryModal } from "@/services/referrals/getReferralsMe";
import { getRecoveryContextForInviter } from "@/services/referrals/recoveryEligibility";

export async function GET(request: Request) {
  return withAuth(request, async (authUser) => {
    const [show, ctx] = await Promise.all([
      shouldShowRecoveryModal(authUser.id),
      getRecoveryContextForInviter(authUser.id),
    ]);
    return Response.json({
      show,
      recovery: ctx.recovery,
    });
  });
}
