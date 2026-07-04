import type { MarketingPlatform } from "./detectPlatform";

export const installModalCopy = {
  headerTitle: "Get IndieFundr on your phone",
  headerSubtitle:
    "IndieFundr is not on Google Play yet. Install the Android beta APK below while we prepare the official store release.",
  ios: {
    steps: [
      {
        title: "Install TestFlight",
        body: "Download Apple's TestFlight app from the App Store.",
      },
      {
        title: "Install the beta app",
        body: "Open the beta invite in TestFlight. (Expo Go is a placeholder until IndieFundr is on TestFlight.)",
      },
    ],
    primaryCta: "Open beta in TestFlight",
    secondaryCta: "Get TestFlight",
  },
  android: {
    intro:
      "Install the IndieFundr beta APK directly on your Android device. You may need to allow installs from unknown sources in Settings before opening the file.",
    primaryCta: "Install APK",
    apkInProgress: "APK in progress",
    apkInProgressDetail: "The Android APK is not available yet.",
  },
  desktop: {
    title: "Install on your phone",
    body: "Open this link on your iPhone or Android device to install the native app.",
    primaryCta: "Copy app link",
    secondaryCta: "Open app in this browser",
  },
} as const;

export function getInstallStepsForPlatform(platform: MarketingPlatform) {
  if (platform === "ios") return installModalCopy.ios.steps;
  if (platform === "android") return [installModalCopy.android.intro];
  return [];
}
