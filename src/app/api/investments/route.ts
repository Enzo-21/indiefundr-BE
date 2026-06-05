import { withAuth } from "@/lib/http/withAuth";
import { internalError } from "@/lib/http/route";
import { getUserInvestments } from "@/services/investments/investments";

export async function GET(request: Request) {
  return withAuth(request, async (authUser) => {
    try {
      const investments = await getUserInvestments(authUser.id);
      return Response.json(investments);
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      return internalError();
    }
  });
}
