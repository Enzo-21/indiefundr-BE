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
    console.warn("[purchaseOrder] push failed:", message);
  }
}
