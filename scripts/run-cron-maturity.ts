import "dotenv/config";

const baseUrl =
  process.env.CRON_DEV_BASE_URL?.trim() ||
  `http://localhost:${process.env.PORT ?? "3000"}`;
const url = `${baseUrl.replace(/\/$/, "")}/api/cron/maturity`;
const cronSecret = process.env.CRON_SECRET?.trim();

async function main() {
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (cronSecret) {
    headers.authorization = `Bearer ${cronSecret}`;
  }

  const response = await fetch(url, { headers });
  const body = await response.text();

  console.log(`[cron:maturity] ${response.status} ${url}`);
  console.log(body);

  if (!response.ok) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("[cron:maturity] failed", error);
  process.exit(1);
});
