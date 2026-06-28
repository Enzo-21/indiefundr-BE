import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

type ActivityRow = {
  id: string;
  userId: string;
  walletId: string;
  kind: string;
  entityId: string;
  type: string;
  amountUsdt: number;
  status: string;
  label: string;
  detail: string | null;
  occurredAt: Date;
  chainFinal: boolean;
  txId: string | null;
  tronscanUrl: string | null;
  pendingTapInfo: unknown;
};

describe("referralWalletActivity lifecycle", () => {
  it("pending → processing → credited keeps one wallet activity row", async () => {
    const rows = new Map<string, ActivityRow>();
    let nextId = 1;

    const db = {
      walletActivity: {
        findFirst: async ({
          where,
        }: {
          where: {
            userId: string;
            walletId: string;
            entityId: string;
            kind?: { in: string[] };
          };
        }) => {
          for (const row of rows.values()) {
            if (
              row.userId === where.userId &&
              row.walletId === where.walletId &&
              row.entityId === where.entityId &&
              (!where.kind || where.kind.in.includes(row.kind))
            ) {
              return row;
            }
          }
          return null;
        },
        update: async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Partial<ActivityRow>;
        }) => {
          const row = rows.get(where.id);
          if (!row) {
            throw new Error("missing row");
          }
          Object.assign(row, data);
          return row;
        },
        create: async ({ data }: { data: Omit<ActivityRow, "id"> }) => {
          const id = `row-${nextId++}`;
          const row = { id, ...data };
          rows.set(id, row);
          return row;
        },
        deleteMany: async () => ({ count: 0 }),
      },
    };

    mock.module("@/lib/prisma", {
      namedExports: { prisma: db },
    });
    mock.module("@/lib/config/referralRecovery", {
      namedExports: {
        REFERRAL_INVITEE_BONUS_USDT: () => 2,
        REFERRAL_INVITER_BONUS_USDT: () => 2,
        REFERRAL_RECOVERY_PRINCIPAL_USDT: () => 50,
      },
    });
    mock.module("@/lib/wallets/helpers", {
      namedExports: {
        getMainWallet: async () => null,
      },
    });

    const {
      upsertReferralPendingActivity,
      markInviteeReferralProcessingActivity,
      creditReferralWalletActivity,
      inviteeReferralActivityEntityId,
    } = await import("./referralWalletActivity");

    const userId = "user-1";
    const walletId = "wallet-1";
    const entityId = inviteeReferralActivityEntityId(userId);

    await upsertReferralPendingActivity(userId, walletId, "FRIEND99");
    assert.equal(rows.size, 1);
    const pendingRow = [...rows.values()][0]!;
    assert.equal(pendingRow.kind, "referral_bonus_pending");
    assert.equal(pendingRow.entityId, entityId);

    await markInviteeReferralProcessingActivity(userId, walletId);
    assert.equal(rows.size, 1);
    const processingRow = [...rows.values()][0]!;
    assert.equal(processingRow.id, pendingRow.id);
    assert.equal(processingRow.kind, "referral_bonus_processing");
    assert.equal(processingRow.status, "processing");
    assert.equal(processingRow.detail, "FRIEND99");

    await creditReferralWalletActivity({
      userId,
      walletId,
      entityId,
      amountUsdt: 2,
      label: "Referral bonus",
      detail: "FRIEND99",
      txId: "tx-referral-1",
      tronscanUrl: "https://example.com/tx-referral-1",
    });
    assert.equal(rows.size, 1);
    const creditedRow = [...rows.values()][0]!;
    assert.equal(creditedRow.id, pendingRow.id);
    assert.equal(creditedRow.kind, "referral_bonus_credited");
    assert.equal(creditedRow.status, "confirmed");
    assert.equal(creditedRow.txId, "tx-referral-1");
  });
});
