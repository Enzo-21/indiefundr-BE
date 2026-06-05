import { withAdmin } from "@/lib/http/withAdmin";
import { internalError } from "@/lib/http/route";
import { getTronLimiterDiagnostics } from "@/services/admin/dashboard";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return withAdmin(request, async () => {
    try {
      const diagnostics = await getTronLimiterDiagnostics();
      return Response.json(diagnostics);
    } catch (error) {
      console.error(
        "[admin getTronLimiterDiagnostics]",
        error instanceof Error ? error.message : error
      );
      return internalError();
    }
  });
}
