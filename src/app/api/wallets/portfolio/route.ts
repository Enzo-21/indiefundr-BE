import { withAuth } from "@/lib/http/withAuth";
import { internalError } from "@/lib/http/route";
import { getInvestmentPortfolio } from "@/services/wallets/investmentPortfolio";

export async function GET(request: Request) {
  return withAuth(request, async (authUser) => {
    const pollSource =
      request.headers.get("X-IndieFundr-Poll-Source")?.trim() || undefined;
    try {
      const portfolio = await getInvestmentPortfolio(authUser.id, {
        pollSource,
      });
      return Response.json(portfolio);
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      return internalError();
    }
  });
}
