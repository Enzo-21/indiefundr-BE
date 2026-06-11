import { ReferralPayoutOrderKind, type PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/lib/prisma";

export async function backfillRecoveryTriadExclusions(
  prisma: PrismaClient = defaultPrisma
): Promise<{ updated: number; skipped: number }> {
  const links = await prisma.referralRecoveryLink.findMany({
    select: { inviteIds: true },
  });

  let updated = 0;
  let skipped = 0;

  for (const link of links) {
    for (const inviteId of link.inviteIds) {
      const order = await prisma.referralPayoutOrder.findFirst({
        where: {
          referralInviteId: inviteId,
          kind: ReferralPayoutOrderKind.invitee_bonus,
          investmentId: { not: null },
        },
        select: { investmentId: true },
      });

      if (!order?.investmentId) {
        skipped += 1;
        continue;
      }

      const result = await prisma.investment.updateMany({
        where: {
          id: order.investmentId,
          excludedFromTriadUnlock: false,
        },
        data: { excludedFromTriadUnlock: true },
      });

      if (result.count > 0) {
        updated += 1;
      } else {
        skipped += 1;
      }
    }
  }

  return { updated, skipped };
}
