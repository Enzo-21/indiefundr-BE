import { withAdmin } from "@/lib/http/withAdmin";
import { internalError } from "@/lib/http/route";
import { getAdminEvents } from "@/services/admin/treasury";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return withAdmin(request, async () => {
    try {
      const { searchParams } = new URL(request.url);
      const limit = parseInt(searchParams.get("limit") || "50", 10);
      const events = await getAdminEvents(limit);
      return Response.json(events);
    } catch (error) {
      console.error(
        "[admin getEvents]",
        error instanceof Error ? error.message : error
      );
      return internalError();
    }
  });
}
