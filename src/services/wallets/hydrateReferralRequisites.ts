import type { ReferralRequisite } from "@/services/referrals/referralRequisites";
import { buildReferralRequisitesForActivity } from "@/services/referrals/referralRequisites";

type ActivityRowLike = {
  kind: string;
  entityId: string | null;
  status: string;
};

const REFERRAL_KINDS = new Set([
  "referral_bonus_pending",
  "referral_bonus_processing",
  "referral_bonus_credited",
]);

export async function hydrateReferralRequisitesBatch(
  userId: string,
  rows: ActivityRowLike[]
): Promise<Map<string, ReferralRequisite[]>> {
  const result = new Map<string, ReferralRequisite[]>();
  const referralRows = rows.filter(
    (row) => REFERRAL_KINDS.has(row.kind) && row.entityId
  );

  await Promise.all(
    referralRows.map(async (row) => {
      const requisites = await buildReferralRequisitesForActivity(userId, {
        entityId: row.entityId,
        kind: row.kind,
        status: row.status,
      });
      if (requisites?.length) {
        result.set(`${row.kind}:${row.entityId}`, requisites);
      }
    })
  );

  return result;
}
