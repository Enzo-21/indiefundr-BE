import { withAuth } from "@/lib/http/withAuth";
import { toWalletResponse } from "@/lib/http/walletResult";
import { addNewWallet } from "@/services/wallets/wallets";

export async function POST(request: Request) {
  return withAuth(request, async (authUser) => {
    const result = await addNewWallet(authUser.id);
    return toWalletResponse(result, (data) => Response.json(data));
  });
}
