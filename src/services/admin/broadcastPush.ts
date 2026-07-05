import { prisma } from "@/lib/prisma";
import {
  BROADCAST_BODY_MAX_LENGTH,
  BROADCAST_TITLE_MAX_LENGTH,
} from "@/lib/notifications/broadcastLimits";
import {
  isExpoPushToken,
  sendPushNotificationBatch,
} from "@/services/orders/pushNotify";

export type BroadcastAudienceStats = {
  totalUsers: number;
  usersWithDevice: number;
  uniqueTokens: number;
  expoTokens: number;
  fcmTokens: number;
};

export type BroadcastPushResult = BroadcastAudienceStats & {
  sent: number;
  failed: number;
  skippedNoDevice: number;
};

export type BroadcastPushInput = {
  title: string;
  body: string;
  createdBy: string;
};

export function validateBroadcastMessage(title: string, body: string): void {
  const trimmedTitle = title.trim();
  const trimmedBody = body.trim();

  if (!trimmedTitle) {
    throw new Error("Title is required");
  }
  if (trimmedTitle.length > BROADCAST_TITLE_MAX_LENGTH) {
    throw new Error(
      `Title must be at most ${BROADCAST_TITLE_MAX_LENGTH} characters`
    );
  }
  if (!trimmedBody) {
    throw new Error("Message is required");
  }
  if (trimmedBody.length > BROADCAST_BODY_MAX_LENGTH) {
    throw new Error(
      `Message must be at most ${BROADCAST_BODY_MAX_LENGTH} characters`
    );
  }
}

export function dedupeDeviceTokens(
  users: { id: string; device: string | null }[]
): string[] {
  const seen = new Set<string>();
  const tokens: string[] = [];

  for (const user of users) {
    const device = user.device?.trim();
    if (!device || seen.has(device)) continue;
    seen.add(device);
    tokens.push(device);
  }

  return tokens;
}

export function partitionDeviceTokens(tokens: string[]): {
  expoTokens: string[];
  fcmTokens: string[];
} {
  const expoTokens: string[] = [];
  const fcmTokens: string[] = [];

  for (const token of tokens) {
    if (isExpoPushToken(token)) {
      expoTokens.push(token);
    } else {
      fcmTokens.push(token);
    }
  }

  return { expoTokens, fcmTokens };
}

export async function getBroadcastAudienceStats(): Promise<BroadcastAudienceStats> {
  const [totalUsers, usersWithDeviceRows] = await Promise.all([
    prisma.user.count(),
    prisma.user.findMany({
      where: { device: { not: null } },
      select: { id: true, device: true },
    }),
  ]);

  const uniqueTokens = dedupeDeviceTokens(usersWithDeviceRows);
  const { expoTokens, fcmTokens } = partitionDeviceTokens(uniqueTokens);

  return {
    totalUsers,
    usersWithDevice: usersWithDeviceRows.length,
    uniqueTokens: uniqueTokens.length,
    expoTokens: expoTokens.length,
    fcmTokens: fcmTokens.length,
  };
}

export async function broadcastPushNotifications(
  input: BroadcastPushInput
): Promise<BroadcastPushResult> {
  const title = input.title.trim();
  const body = input.body.trim();
  validateBroadcastMessage(title, body);

  const stats = await getBroadcastAudienceStats();
  const usersWithDevice = await prisma.user.findMany({
    where: { device: { not: null } },
    select: { id: true, device: true },
  });
  const tokens = dedupeDeviceTokens(usersWithDevice);

  if (tokens.length === 0) {
    return {
      ...stats,
      sent: 0,
      failed: 0,
      skippedNoDevice: stats.totalUsers,
    };
  }

  console.info("[admin broadcast] sending push notification", {
    createdBy: input.createdBy,
    uniqueTokens: tokens.length,
    title,
  });

  const { sent, failed } = await sendPushNotificationBatch(tokens, title, body, {
    type: "ADMIN_BROADCAST",
  });

  return {
    ...stats,
    sent,
    failed,
    skippedNoDevice: stats.totalUsers - stats.usersWithDevice,
  };
}
