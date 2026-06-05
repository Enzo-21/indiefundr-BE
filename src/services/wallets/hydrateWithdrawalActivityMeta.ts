import { prisma } from "@/lib/prisma";

export type WithdrawalActivityMeta = {
  withdrawalOrderId: string;
  senderAddress: string | null;
  recipientAddress: string;
};

type ActivityRowLike = {
  kind: string;
  entityId: string | null;
};

function isWithdrawalKind(kind: string): boolean {
  return kind === "withdrawal" || kind === "withdrawal_order";
}

export async function hydrateWithdrawalActivityMetaBatch(
  userId: string,
  rows: ActivityRowLike[]
): Promise<Map<string, WithdrawalActivityMeta>> {
  const orderIds = [
    ...new Set(
      rows
        .filter((row) => isWithdrawalKind(row.kind) && row.entityId)
        .map((row) => row.entityId as string)
    ),
  ];

  const result = new Map<string, WithdrawalActivityMeta>();
  if (orderIds.length === 0) {
    return result;
  }

  const orders = await prisma.withdrawalOrder.findMany({
    where: { userId, id: { in: orderIds } },
    select: {
      id: true,
      destinationAddress: true,
      wallet: { select: { address: true } },
    },
  });

  for (const order of orders) {
    const key = order.id;
    result.set(`withdrawal:${key}`, {
      withdrawalOrderId: order.id,
      senderAddress: order.wallet?.address ?? null,
      recipientAddress: order.destinationAddress,
    });
    result.set(`withdrawal_order:${key}`, {
      withdrawalOrderId: order.id,
      senderAddress: order.wallet?.address ?? null,
      recipientAddress: order.destinationAddress,
    });
  }

  return result;
}

export function withdrawalMetaKey(kind: string, entityId: string): string {
  return `${kind}:${entityId}`;
}
