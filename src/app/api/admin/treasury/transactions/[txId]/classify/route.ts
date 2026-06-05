import { withAdmin } from "@/lib/http/withAdmin";
import { internalError, jsonError, parseJsonBody } from "@/lib/http/route";
import {
  linkTreasuryOutflowAsAppWithdrawal,
  unlinkAppWithdrawalFromLedger,
  type ClassifyTreasuryWithdrawalIntent,
} from "@/services/admin/treasuryTxClassification";
import { isInsufficientWithdrawalError } from "@/services/admin/treasury";

export const dynamic = "force-dynamic";

const VALID_INTENTS: ClassifyTreasuryWithdrawalIntent[] = [
  "link_withdrawal",
  "unlink_withdrawal",
];

export async function POST(
  request: Request,
  context: { params: Promise<{ txId: string }> }
) {
  return withAdmin(request, async () => {
    try {
      const { txId: rawTxId } = await context.params;
      const txId = rawTxId?.trim();
      if (!txId) {
        return jsonError(400, { msg: "txId is required" });
      }

      const parsed = await parseJsonBody(request);
      if (!parsed.ok) return parsed.response;

      const body = parsed.data as {
        intent?: unknown;
        note?: string;
        amountUsdt?: unknown;
      };

      const intent = body.intent;
      if (
        typeof intent !== "string" ||
        !VALID_INTENTS.includes(intent as ClassifyTreasuryWithdrawalIntent)
      ) {
        return jsonError(400, {
          msg: 'intent must be "link_withdrawal" or "unlink_withdrawal"',
        });
      }

      const adminEmail =
        request.headers.get("x-admin-user")?.trim() || "admin-api";

      const amountUsdt =
        body.amountUsdt != null ? Number(body.amountUsdt) : undefined;

      const result =
        intent === "link_withdrawal"
          ? await linkTreasuryOutflowAsAppWithdrawal({
              txId,
              amountUsdt:
                amountUsdt != null && Number.isFinite(amountUsdt)
                  ? amountUsdt
                  : undefined,
              note: body.note,
              adminEmail,
            })
          : await unlinkAppWithdrawalFromLedger({
              txId,
              note: body.note,
              adminEmail,
            });

      return Response.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isInsufficientWithdrawalError(message)) {
        return jsonError(400, { msg: message });
      }
      if (
        message.includes("user payout") ||
        message.includes("not found") ||
        message.includes("required")
      ) {
        return jsonError(400, { msg: message });
      }
      console.error("[admin classifyTreasuryTx]", message);
      return internalError();
    }
  });
}
