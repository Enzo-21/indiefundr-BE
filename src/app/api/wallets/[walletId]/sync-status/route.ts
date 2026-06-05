import { withAuth } from "@/lib/http/withAuth";
import { toWalletResponse } from "@/lib/http/walletResult";
import { getWalletActivitySyncStatus } from "@/services/wallets/wallets";

type RouteContext = { params: Promise<{ walletId: string }> };

export async function GET(request: Request, context: RouteContext) {
  return withAuth(request, async (authUser) => {
    const { walletId } = await context.params;
    const pollSource =
      request.headers.get("X-IndieFundr-Poll-Source")?.trim() || undefined;

    const result = await getWalletActivitySyncStatus(authUser.id, walletId, {
      pollSource,
    });
    return toWalletResponse(result, (data) => Response.json(data));
  });
}
