import { withAuth } from "@/lib/http/withAuth";
import { toWalletResponse } from "@/lib/http/walletResult";
import { setMainWallet } from "@/services/wallets/wallets";

type RouteContext = { params: Promise<{ walletId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  return withAuth(request, async (authUser) => {
    const { walletId } = await context.params;
    const result = await setMainWallet(authUser.id, walletId);
    return toWalletResponse(result, (data) => Response.json(data));
  });
}
