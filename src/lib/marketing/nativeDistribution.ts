export const TESTFLIGHT_APP_STORE_URL =
  process.env.NEXT_PUBLIC_TESTFLIGHT_APP_STORE_URL?.trim() ||
  "https://apps.apple.com/app/testflight/id899247664";

/** Placeholder until IndieFundr has its own TestFlight invite. */
export const IOS_BETA_TESTFLIGHT_URL =
  process.env.NEXT_PUBLIC_IOS_BETA_TESTFLIGHT_URL?.trim() ||
  "https://testflight.apple.com/join/GZJxxfUU";

/** Set when a hosted APK is available. */
export const APK_DOWNLOAD_URL: string | null =
  process.env.NEXT_PUBLIC_APK_DOWNLOAD_URL?.trim() || null;
