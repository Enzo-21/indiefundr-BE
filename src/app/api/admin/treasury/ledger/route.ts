import { withAdmin } from "@/lib/http/withAdmin";
import { internalError } from "@/lib/http/route";
import { getAdminLedger } from "@/services/admin/treasury";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return withAdmin(request, async () => {
    try {
      const ledger = await getAdminLedger();
      return Response.json(ledger);
    } catch (error) {
      console.error(
        "[admin getLedger]",
        error instanceof Error ? error.message : error
      );
      return internalError();
    }
  });
}
