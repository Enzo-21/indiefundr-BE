export type MarketingPlatform = "ios" | "android" | "desktop";

export function detectMarketingPlatform(userAgent?: string): MarketingPlatform {
  const ua =
    userAgent ??
    (typeof navigator !== "undefined" ? navigator.userAgent : "");
  if (/android/i.test(ua)) return "android";
  if (/iPad|iPhone|iPod/i.test(ua)) return "ios";
  return "desktop";
}
