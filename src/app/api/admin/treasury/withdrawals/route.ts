import { withAdmin } from "@/lib/http/withAdmin";
import { internalError, jsonError, parseJsonBody } from "@/lib/http/route";
import {
  createAdminWithdrawal,
  isInsufficientWithdrawalError,
} from "@/services/admin/treasury";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return withAdmin(request, async () => {
    try {
      const parsed = await parseJsonBody(request);
      if (!parsed.ok) return parsed.response;

      const body = parsed.data as {
        amountUsdt?: unknown;
        txRef?: string;
        note?: string;
      };

      if (body.amountUsdt == null || Number(body.amountUsdt) <= 0) {
        return jsonError(400, { msg: "amountUsdt must be a positive number" });
      }

      const createdBy = request.headers.get("x-admin-user")?.trim() || "admin";

      const result = await createAdminWithdrawal({
        amountUsdt: Number(body.amountUsdt),
        txRef: body.txRef,
        note: body.note,
        createdBy,
      });

      return Response.json(result, { status: 201 });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isInsufficientWithdrawalError(message)) {
        return jsonError(400, { msg: message });
      }
      console.error("[admin postWithdrawal]", message);
      return internalError();
    }
  });
}
