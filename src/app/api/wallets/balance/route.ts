import { withAuth } from "@/lib/http/withAuth";
import { toWalletResponse } from "@/lib/http/walletResult";
import { getAccountBalance } from "@/services/wallets/wallets";

export async function GET(request: Request) {
  return withAuth(request, async (authUser) => {
    const result = await getAccountBalance(authUser.id);
    return toWalletResponse(result, (balance) => Response.json(balance));
  });
}
