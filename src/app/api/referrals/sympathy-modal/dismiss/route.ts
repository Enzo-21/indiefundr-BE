import { withAuth } from "@/lib/http/withAuth";
import { dismissSympathyModal } from "@/services/referrals/getReferralsMe";

export async function POST(request: Request) {
  return withAuth(request, async (authUser) => {
    await dismissSympathyModal(authUser.id);
    return Response.json({ ok: true });
  });
}
