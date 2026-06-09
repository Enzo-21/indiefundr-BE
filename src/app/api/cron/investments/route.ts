import { runInvestmentPipeline } from "@/jobs/investmentPipeline";

function isAuthorized(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return process.env.NODE_ENV !== "production";
  }

  const auth = request.headers.get("authorization");
  if (auth === `Bearer ${cronSecret}`) {
    return true;
  }

  const vercelCron = request.headers.get("x-vercel-cron");
  return vercelCron === "1" && Boolean(cronSecret);
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const result = await runInvestmentPipeline();
  return Response.json({ ok: true, ...result });
}
