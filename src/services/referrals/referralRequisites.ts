import { ReferralRewardRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hasCompletedFirstInvestment } from "./referralEligibility";

export type ReferralRequisiteStatus = "complete" | "pending";

export type ReferralRequisite = {
  id: string;
  label: string;
  status: ReferralRequisiteStatus;
};

const INVITER_PENDING_PREFIX = "referral-inviter-pending:";
const INVITEE_PENDING_PREFIX = "referral-pending:";
const REWARD_PREFIX = "referral-reward-";

function buildInviteeRequisites(
  viewerInvested: boolean,
  inviterInvested: boolean
): ReferralRequisite[] {
  return [
    {
      id: "viewer_invested",
      label: "You have invested at least once",
      status: viewerInvested ? "complete" : "pending",
    },
    {
      id: "counterparty_invested",
      label: "Your inviter has invested at least once",
      status: inviterInvested ? "complete" : "pending",
    },
  ];
}

function buildInviterRequisites(
  viewerInvested: boolean,
  inviteeInvested: boolean
): ReferralRequisite[] {
  return [
    {
      id: "viewer_invested",
      label: "You have invested at least once",
      status: viewerInvested ? "complete" : "pending",
    },
    {
      id: "counterparty_invested",
      label: "Your invited friend has invested at least once",
      status: inviteeInvested ? "complete" : "pending",
    },
  ];
}

function buildCompletedRequisites(
  perspective: "invitee" | "inviter"
): ReferralRequisite[] {
  if (perspective === "invitee") {
    return buildInviteeRequisites(true, true);
  }
  return buildInviterRequisites(true, true);
}

async function resolveInviteFromEntity(
  entityId: string,
  viewerUserId: string
): Promise<{
  inviterUserId: string;
  inviteeUserId: string;
  perspective: "invitee" | "inviter";
} | null> {
  if (entityId.startsWith(INVITEE_PENDING_PREFIX)) {
    const inviteeUserId = entityId.slice(INVITEE_PENDING_PREFIX.length);
    const invite = await prisma.referralInvite.findUnique({
      where: { inviteeUserId },
      select: { inviterUserId: true, inviteeUserId: true },
    });
    if (!invite) {
      const pendingCode = await prisma.user.findUnique({
        where: { id: inviteeUserId },
        select: {
          pendingReferralCode: { select: { userId: true } },
        },
      });
      if (!pendingCode?.pendingReferralCode) {
        return null;
      }
      return {
        inviterUserId: pendingCode.pendingReferralCode.userId,
        inviteeUserId,
        perspective: inviteeUserId === viewerUserId ? "invitee" : "inviter",
      };
    }
    return {
      inviterUserId: invite.inviterUserId,
      inviteeUserId: invite.inviteeUserId,
      perspective: inviteeUserId === viewerUserId ? "invitee" : "inviter",
    };
  }

  if (entityId.startsWith(INVITER_PENDING_PREFIX)) {
    const inviteId = entityId.slice(INVITER_PENDING_PREFIX.length);
    const invite = await prisma.referralInvite.findUnique({
      where: { id: inviteId },
      select: { inviterUserId: true, inviteeUserId: true },
    });
    if (!invite) {
      return null;
    }
    return {
      inviterUserId: invite.inviterUserId,
      inviteeUserId: invite.inviteeUserId,
      perspective: invite.inviterUserId === viewerUserId ? "inviter" : "invitee",
    };
  }

  if (entityId.startsWith(REWARD_PREFIX)) {
    const rewardId = entityId.slice(REWARD_PREFIX.length);
    const reward = await prisma.referralReward.findUnique({
      where: { id: rewardId },
      select: {
        role: true,
        referralInvite: {
          select: { inviterUserId: true, inviteeUserId: true },
        },
      },
    });
    if (!reward?.referralInvite) {
      return null;
    }
    const perspective =
      reward.role === ReferralRewardRole.invitee_bonus ? "invitee" : "inviter";
    return {
      inviterUserId: reward.referralInvite.inviterUserId,
      inviteeUserId: reward.referralInvite.inviteeUserId,
      perspective,
    };
  }

  return null;
}

export async function buildReferralRequisitesForActivity(
  viewerUserId: string,
  params: {
    entityId: string | null;
    kind: string;
    status: string;
  }
): Promise<ReferralRequisite[] | null> {
  const isReferralKind =
    params.kind === "referral_bonus_pending" ||
    params.kind === "referral_bonus_processing" ||
    params.kind === "referral_bonus_credited";
  if (!isReferralKind || !params.entityId) {
    return null;
  }

  if (
    params.kind === "referral_bonus_credited" ||
    params.status.toLowerCase() === "confirmed"
  ) {
    const context = await resolveInviteFromEntity(params.entityId, viewerUserId);
    if (!context) {
      return null;
    }
    return buildCompletedRequisites(context.perspective);
  }

  const context = await resolveInviteFromEntity(params.entityId, viewerUserId);
  if (!context) {
    return null;
  }

  const [inviterInvested, inviteeInvested] = await Promise.all([
    hasCompletedFirstInvestment(context.inviterUserId),
    hasCompletedFirstInvestment(context.inviteeUserId),
  ]);

  if (context.perspective === "invitee") {
    return buildInviteeRequisites(inviteeInvested, inviterInvested);
  }

  return buildInviterRequisites(inviterInvested, inviteeInvested);
}

export function buildInviteeRequisitesForTest(
  viewerInvested: boolean,
  inviterInvested: boolean
) {
  return buildInviteeRequisites(viewerInvested, inviterInvested);
}

export function buildInviterRequisitesForTest(
  viewerInvested: boolean,
  inviteeInvested: boolean
) {
  return buildInviterRequisites(viewerInvested, inviteeInvested);
}
