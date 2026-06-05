import { withAuth } from "@/lib/http/withAuth";
import { getMainWallet } from "@/lib/wallets/helpers";
import { syncWallet } from "@/services/wallets/walletSyncService";

export async function POST(request: Request) {
  return withAuth(request, async (authUser) => {
    const mainWallet = await getMainWallet(authUser.id);
    if (!mainWallet) {
      return Response.json({ msg: "No wallet found" }, { status: 404 });
    }

    const result = await syncWallet(authUser.id, mainWallet.id, {
      reason: "api_sync",
    });

    return Response.json(result);
  });
}
