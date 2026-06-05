import { withAuth } from "@/lib/http/withAuth";
import { toWalletResponse } from "@/lib/http/walletResult";
import { getUserWallets } from "@/services/wallets/wallets";

export async function GET(request: Request) {
  return withAuth(request, async (authUser) => {
    const result = await getUserWallets(authUser.id);
    return toWalletResponse(result, (data) => Response.json(data));
  });
}
