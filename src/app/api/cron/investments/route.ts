import { authorizeCronRequest } from "@/lib/cron/authorizeCronRequest";
import { runInvestmentPipeline } from "@/jobs/investmentPipeline";

export async function GET(request: Request) {
  if (!authorizeCronRequest(request)) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const result = await runInvestmentPipeline();
  return Response.json({ ok: true, ...result });
}
