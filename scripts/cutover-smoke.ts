/**
 * Pre-cutover smoke test for Expo-critical API routes.
 * Usage: BASE_URL=http://localhost:3000 npm run cutover:smoke
 * Optional: ADMIN_API_KEY=... for admin ledger 200 check
 */
import "dotenv/config";

const BASE_URL = (process.env.BASE_URL || "http://localhost:3000").replace(
  /\/$/,
  ""
);

type CheckResult = {
  name: string;
  method: string;
  path: string;
  expected: string;
  status: number;
  pass: boolean;
  note?: string;
};

const results: CheckResult[] = [];

async function check(
  name: string,
  method: string,
  path: string,
  expectedStatuses: number[],
  init?: RequestInit
): Promise<Response> {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, { method, ...init });
  const pass = expectedStatuses.includes(res.status);
  results.push({
    name,
    method,
    path,
    expected: expectedStatuses.join(" or "),
    status: res.status,
    pass,
  });
  return res;
}

async function main() {
  console.log(`Cutover smoke — ${BASE_URL}\n`);

  await check("health", "GET", "/api/health", [200]);

  const fundsRes = await check("funds catalog", "GET", "/api/funds", [200]);
  let fundId = "aggressive-alpha";
  if (fundsRes.ok) {
    try {
      const funds = (await fundsRes.json()) as Array<{ id?: string; fundId?: string }>;
      const first = funds[0];
      fundId = first?.id || first?.fundId || fundId;
    } catch {
      // use default fundId
    }
  }

  await check(
    "funds estimate (no token)",
    "GET",
    `/api/funds/estimate?fundId=${encodeURIComponent(fundId)}`,
    [401]
  );

  await check("auth me (no token)", "GET", "/api/auth", [401]);
  await check("wallets portfolio (no token)", "GET", "/api/wallets/portfolio", [
    401,
  ]);
  await check("investments (no token)", "GET", "/api/investments", [401]);
  await check(
    "admin ledger (no key)",
    "GET",
    "/api/admin/treasury/ledger",
    [401, 503]
  );

  const adminKey = process.env.ADMIN_API_KEY?.trim();
  if (adminKey) {
    await check("admin ledger (with key)", "GET", "/api/admin/treasury/ledger", [
      200,
    ], {
      headers: { "x-admin-api-key": adminKey },
    });
  } else {
    console.log("(Skipping admin 200 check — set ADMIN_API_KEY to enable)\n");
  }

  const failed = results.filter((r) => !r.pass);
  const col = (s: string, w: number) => s.padEnd(w).slice(0, w);

  console.log(
    `${col("Check", 22)} ${col("Method", 6)} ${col("Path", 36)} ${col("Expected", 12)} ${col("Got", 5)} Pass`
  );
  console.log("-".repeat(95));
  for (const r of results) {
    console.log(
      `${col(r.name, 22)} ${col(r.method, 6)} ${col(r.path, 36)} ${col(r.expected, 12)} ${col(String(r.status), 5)} ${r.pass ? "OK" : "FAIL"}`
    );
  }

  console.log(`\n${results.length - failed.length}/${results.length} passed`);

  if (failed.length > 0) {
    console.error("\nSmoke test FAILED. Is the dev server running? (npm run dev)");
    process.exit(1);
  }

  console.log("\nSmoke test OK.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
