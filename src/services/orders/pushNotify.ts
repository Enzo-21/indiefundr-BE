import { getFirebaseAdmin } from "@/lib/firebase/admin";

export const EXPO_PUSH_BATCH_SIZE = 100;
export const FCM_PUSH_BATCH_SIZE = 500;
export const PUSH_BATCH_CONCURRENCY = 3;

export type PushBatchResult = {
  sent: number;
  failed: number;
};

export function isExpoPushToken(device: string): boolean {
  return device.startsWith("ExponentPushToken[");
}

export function chunkArray<T>(items: T[], size: number): T[][] {
  if (size <= 0) return items.length > 0 ? [items] : [];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];

  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function runWorker() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index]);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => runWorker()
  );
  await Promise.all(workers);
  return results;
}

function stringifyData(
  data: Record<string, unknown>
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(data)) {
    result[key] =
      typeof value === "string" ? value : JSON.stringify(value ?? null);
  }
  return result;
}

type ExpoPushTicket = {
  status?: string;
};

type ExpoPushResponse = {
  data?: ExpoPushTicket[];
};

export function countExpoBatchResult(response: ExpoPushResponse): PushBatchResult {
  const tickets = response.data ?? [];
  let sent = 0;
  let failed = 0;

  for (const ticket of tickets) {
    if (ticket.status === "ok") {
      sent += 1;
    } else {
      failed += 1;
    }
  }

  return { sent, failed };
}

export async function sendExpoPushBatch(
  devices: string[],
  title: string,
  body: string,
  data: Record<string, unknown>
): Promise<PushBatchResult> {
  const tokens = devices.filter(Boolean);
  if (tokens.length === 0) {
    return { sent: 0, failed: 0 };
  }

  const chunks = chunkArray(tokens, EXPO_PUSH_BATCH_SIZE);
  const chunkResults = await runWithConcurrency(
    chunks,
    PUSH_BATCH_CONCURRENCY,
    async (chunk) => {
      try {
        const payload = JSON.stringify(
          chunk.map((device) => ({
            to: device,
            title,
            body,
            data,
            _displayInForeground: true,
          }))
        );
        const response = await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Accept-encoding": "gzip, deflate",
            "Content-Type": "application/json",
          },
          body: payload,
        });

        if (!response.ok) {
          console.warn("[push] expo batch send failed:", response.status);
          return { sent: 0, failed: chunk.length };
        }

        const json = (await response.json()) as ExpoPushResponse;
        return countExpoBatchResult(json);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn("[push] expo batch send failed:", message);
        return { sent: 0, failed: chunk.length };
      }
    }
  );

  return chunkResults.reduce(
    (acc, result) => ({
      sent: acc.sent + result.sent,
      failed: acc.failed + result.failed,
    }),
    { sent: 0, failed: 0 }
  );
}

export async function sendFcmWebPushBatch(
  devices: string[],
  title: string,
  body: string,
  data: Record<string, unknown>
): Promise<PushBatchResult> {
  const tokens = devices.filter(Boolean);
  if (tokens.length === 0) {
    return { sent: 0, failed: 0 };
  }

  const firebaseAdmin = getFirebaseAdmin();
  if (!firebaseAdmin) {
    console.warn("[push] firebase-admin not configured — skipping FCM web push");
    return { sent: 0, failed: tokens.length };
  }

  const appWebUrl =
    process.env.APP_WEB_URL?.trim() || "http://localhost:8081";
  const stringData = stringifyData(data);
  const chunks = chunkArray(tokens, FCM_PUSH_BATCH_SIZE);

  const chunkResults = await runWithConcurrency(
    chunks,
    PUSH_BATCH_CONCURRENCY,
    async (chunk) => {
      try {
        const response = await firebaseAdmin.messaging().sendEach(
          chunk.map((token) => ({
            token,
            notification: { title, body },
            data: stringData,
            webpush: {
              fcmOptions: { link: appWebUrl },
            },
          }))
        );
        return {
          sent: response.successCount,
          failed: response.failureCount,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn("[push] FCM batch send failed:", message);
        return { sent: 0, failed: chunk.length };
      }
    }
  );

  return chunkResults.reduce(
    (acc, result) => ({
      sent: acc.sent + result.sent,
      failed: acc.failed + result.failed,
    }),
    { sent: 0, failed: 0 }
  );
}

export async function sendPushNotificationBatch(
  devices: string[],
  title: string,
  body: string,
  data: Record<string, unknown>
): Promise<PushBatchResult> {
  const expoTokens = devices.filter((device) => isExpoPushToken(device));
  const fcmTokens = devices.filter((device) => !isExpoPushToken(device));

  const [expoResult, fcmResult] = await Promise.all([
    sendExpoPushBatch(expoTokens, title, body, data),
    sendFcmWebPushBatch(fcmTokens, title, body, data),
  ]);

  return {
    sent: expoResult.sent + fcmResult.sent,
    failed: expoResult.failed + fcmResult.failed,
  };
}

export async function sendExpoPush(
  device: string | null | undefined,
  title: string,
  body: string,
  data: Record<string, unknown>
): Promise<void> {
  if (!device) return;

  try {
    const payload = JSON.stringify({
      to: device,
      title,
      body,
      data,
      _displayInForeground: true,
    });
    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: payload,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[push] expo send failed:", message);
  }
}

export async function sendFcmWebPush(
  device: string | null | undefined,
  title: string,
  body: string,
  data: Record<string, unknown>
): Promise<void> {
  if (!device) return;

  const firebaseAdmin = getFirebaseAdmin();
  if (!firebaseAdmin) {
    console.warn("[push] firebase-admin not configured — skipping FCM web push");
    return;
  }

  const appWebUrl =
    process.env.APP_WEB_URL?.trim() || "http://localhost:8081";

  try {
    await firebaseAdmin.messaging().send({
      token: device,
      notification: { title, body },
      data: stringifyData(data),
      webpush: {
        fcmOptions: { link: appWebUrl },
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[push] FCM web send failed:", message);
  }
}

export async function sendPushNotification(
  device: string | null | undefined,
  title: string,
  body: string,
  data: Record<string, unknown>
): Promise<void> {
  if (!device) return;

  if (isExpoPushToken(device)) {
    await sendExpoPush(device, title, body, data);
    return;
  }

  await sendFcmWebPush(device, title, body, data);
}
