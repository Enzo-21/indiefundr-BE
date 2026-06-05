import { withAuth } from "@/lib/http/withAuth";
import { toWalletResponse } from "@/lib/http/walletResult";
import {
  jsonError,
  parseJsonBody,
  validationErrors,
} from "@/lib/http/route";
import { addCustomWalletBodySchema } from "@/lib/validators/wallet";
import { addCustomWallet } from "@/services/wallets/wallets";

export async function POST(request: Request) {
  return withAuth(request, async (authUser) => {
    const parsed = await parseJsonBody(request);
    if (!parsed.ok) return parsed.response;

    const body = addCustomWalletBodySchema.safeParse(parsed.data);
    if (!body.success) {
      return jsonError(400, validationErrors(body.error));
    }

    const result = await addCustomWallet(authUser.id, body.data);
    return toWalletResponse(result, (data) => Response.json(data), 201);
  });
}
