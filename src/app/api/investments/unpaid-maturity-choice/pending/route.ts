import { withAuth } from "@/lib/http/withAuth";
import { getPendingUnpaidMaturityChoiceForUser } from "@/services/investments/unpaidMaturityChoice";

export async function GET(request: Request) {
  return withAuth(request, async (authUser) => {
    const pending = await getPendingUnpaidMaturityChoiceForUser(authUser.id);
    return Response.json({
      show: pending != null,
      choice: pending,
    });
  });
}
