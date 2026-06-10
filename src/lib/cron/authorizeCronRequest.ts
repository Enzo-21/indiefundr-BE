export function authorizeCronRequest(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) {
    return process.env.NODE_ENV !== "production";
  }

  const auth = request.headers.get("authorization");
  if (auth === `Bearer ${cronSecret}`) {
    return true;
  }

  const vercelCron = request.headers.get("x-vercel-cron");
  return vercelCron === "1";
}
