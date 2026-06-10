import { withAuth } from "@/lib/http/withAuth";
import { internalError, jsonError } from "@/lib/http/route";
import { prisma } from "@/lib/prisma";
import { getMainWallet } from "@/lib/wallets/helpers";
import { ensureUserHasWallet } from "@/services/wallets/ensureDefaultWallet";
import { isTransakConfigured } from "@/services/transak/config";
import { createTransakWidgetSession } from "@/services/transak/createWidgetSession";

export async function POST(request: Request) {
  return withAuth(request, async (authUser) => {
    if (!isTransakConfigured()) {
      return jsonError(503, {
        msg: "Buy USDT is not configured on this server.",
      });
    }

    try {
      await ensureUserHasWallet(authUser.id);
      const mainWallet = await getMainWallet(authUser.id);
      if (!mainWallet?.address) {
        return jsonError(503, {
          msg: "Your wallet is still being prepared. Try again in a moment.",
        });
      }

      const user = await prisma.user.findUnique({
        where: { id: authUser.id },
        select: { email: true },
      });

      const session = await createTransakWidgetSession({
        walletAddress: mainWallet.address,
        partnerCustomerId: authUser.id,
        email: user?.email ?? null,
      });

      return Response.json(session);
    } catch (error) {
      console.error(
        "[transak:widget-session]",
        error instanceof Error ? error.message : error
      );
      return internalError();
    }
  });
}
