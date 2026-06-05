import { withAuth } from "@/lib/http/withAuth";
import { toWalletResponse } from "@/lib/http/walletResult";
import { getWalletById } from "@/services/wallets/wallets";

type RouteContext = { params: Promise<{ walletId: string }> };

export async function GET(request: Request, context: RouteContext) {
  return withAuth(request, async (authUser) => {
    const { walletId } = await context.params;
    const result = await getWalletById(authUser.id, walletId);
    return toWalletResponse(result, (data) => Response.json(data));
  });
}
