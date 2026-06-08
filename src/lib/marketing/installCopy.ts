import type { MarketingPlatform } from "./detectPlatform";

export const installModalCopy = {
  headerTitle: "Get IndieFundr on your phone",
  headerSubtitle:
    "Native apps are coming to the App Store and Google Play. Use the options below in the meantime.",
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
      "IndieFundr runs as a native Android app. Tap below to install the APK when it is available.",
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
