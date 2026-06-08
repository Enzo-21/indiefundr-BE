import { getFirebaseAdmin } from "@/lib/firebase/admin";

export function isExpoPushToken(device: string): boolean {
  return device.startsWith("ExponentPushToken[");
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
