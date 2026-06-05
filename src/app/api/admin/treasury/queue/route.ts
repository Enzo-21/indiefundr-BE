import { withAdmin } from "@/lib/http/withAdmin";
import { internalError } from "@/lib/http/route";
import { getAdminQueue } from "@/services/admin/treasury";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return withAdmin(request, async () => {
    try {
      const data = await getAdminQueue();
      return Response.json(data);
    } catch (error) {
      console.error(
        "[admin getQueue]",
        error instanceof Error ? error.message : error
      );
      return internalError();
    }
  });
}
