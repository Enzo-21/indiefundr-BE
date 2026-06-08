import { withAuth } from "@/lib/http/withAuth";
import { toWalletResponse } from "@/lib/http/walletResult";
import { getWalletTransactions } from "@/services/wallets/wallets";

type RouteContext = { params: Promise<{ walletId: string }> };

function parseReadMode(
  value: string | null
): "db" | "chain" | undefined {
  if (value === "db" || value === "chain") {
    return value;
  }
  return undefined;
}

export async function GET(request: Request, context: RouteContext) {
  return withAuth(request, async (authUser) => {
    const { walletId } = await context.params;
    const url = new URL(request.url);
    const pollSource =
      request.headers.get("X-IndieFundr-Poll-Source")?.trim() || undefined;
    const readMode = parseReadMode(url.searchParams.get("readMode"));
    const limitParam = url.searchParams.get("limit");
    const limit =
      limitParam != null && limitParam !== ""
        ? Number(limitParam)
        : undefined;
    const cursor = url.searchParams.get("cursor") ?? undefined;
    const activityScopeParam = url.searchParams.get("activityScope");
    const activityScope =
      activityScopeParam === "referral" ? "referral" : undefined;

    const result = await getWalletTransactions(authUser.id, walletId, {
      pollSource,
      readMode,
      limit: Number.isFinite(limit) ? limit : undefined,
      cursor,
      activityScope,
    });
    return toWalletResponse(result, (data) => Response.json(data));
  });
}
