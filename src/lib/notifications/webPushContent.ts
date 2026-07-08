export const WEB_PUSH_APP_TITLE = "IndieFundr";

export function formatWebPushNotification(
  title: string,
  body: string
): { title: string; body: string } {
  const trimmedTitle = title.trim();
  const trimmedBody = body.trim();

  if (trimmedTitle && trimmedBody) {
    return {
      title: WEB_PUSH_APP_TITLE,
      body: `${trimmedTitle} - ${trimmedBody}`,
    };
  }

  const single = trimmedTitle || trimmedBody || WEB_PUSH_APP_TITLE;
  return {
    title: WEB_PUSH_APP_TITLE,
    body: single,
  };
}
