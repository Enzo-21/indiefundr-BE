import { prisma } from "@/lib/prisma";
import { resolveInviteFromEntity } from "@/services/referrals/referralRequisites";

export type ReferralActivityMeta = {
  perspective: "invitee" | "inviter";
  counterpartyDisplayName: string;
  referralCode?: string;
};

const REFERRAL_META_KINDS = new Set([
  "referral_bonus_pending",
  "referral_bonus_processing",
  "referral_bonus_credited",
  "referral_principal_recovery",
]);

type ActivityRowLike = {
  kind: string;
  entityId: string | null;
};

export async function hydrateReferralMetaBatch(
  userId: string,
  rows: ActivityRowLike[]
): Promise<Map<string, ReferralActivityMeta>> {
  const result = new Map<string, ReferralActivityMeta>();
  const referralRows = rows.filter(
    (row) => REFERRAL_META_KINDS.has(row.kind) && row.entityId
  );

  await Promise.all(
    referralRows.map(async (row) => {
      const entityId = row.entityId!;
      const context = await resolveInviteFromEntity(entityId, userId);
      if (!context) {
        return;
      }

      const [inviter, invitee, invite] = await Promise.all([
        prisma.user.findUnique({
          where: { id: context.inviterUserId },
          select: { name: true },
        }),
        prisma.user.findUnique({
          where: { id: context.inviteeUserId },
          select: { name: true },
        }),
        prisma.referralInvite.findFirst({
          where: {
            inviterUserId: context.inviterUserId,
            inviteeUserId: context.inviteeUserId,
          },
          select: {
            referralCode: { select: { code: true } },
          },
        }),
      ]);

      const counterpartyDisplayName =
        context.perspective === "invitee"
          ? (inviter?.name ?? "Your inviter")
          : (invitee?.name ?? "Your invited friend");

      const meta: ReferralActivityMeta = {
        perspective: context.perspective,
        counterpartyDisplayName,
        referralCode: invite?.referralCode.code,
      };

      result.set(`${row.kind}:${entityId}`, meta);
    })
  );

  return result;
}
