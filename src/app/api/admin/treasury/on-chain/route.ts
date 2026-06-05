import { withAdmin } from "@/lib/http/withAdmin";
import { internalError } from "@/lib/http/route";
import { serializeTreasuryOnChainReport } from "@/lib/serializers/treasuryAdmin";
import { getAdminOnChainReport } from "@/services/admin/treasury";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return withAdmin(request, async () => {
    try {
      const report = await getAdminOnChainReport();
      return Response.json(serializeTreasuryOnChainReport(report));
    } catch (error) {
      console.error(
        "[admin getOnChainTreasury]",
        error instanceof Error ? error.message : error
      );
      return internalError();
    }
  });
}
