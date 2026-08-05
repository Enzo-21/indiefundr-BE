"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Monitor } from "lucide-react";
import { AndroidBetaModal } from "@/components/marketing/android-beta-modal";
import { InstallAppModal } from "@/components/marketing/install-app-modal";
import { StoreDownloadButton } from "@/components/marketing/store-download-button";
import {
  detectMarketingPlatform,
  type MarketingPlatform,
} from "@/lib/marketing/detectPlatform";
import { cn } from "@/lib/utils";

export function StoreDownloadBadges({
  appUrl,
  className,
  iconClassName,
  appleLabel,
  googleLabel,
  showDesktopBrowserCta = false,
  orLabel = "OR",
  desktopBrowserLabel = "Web",
}: {
  /** Server-resolved open URL — do not call getAppOpenUrl on the client. */
  appUrl: string;
  className?: string;
  iconClassName?: string;
  appleLabel?: string;
  googleLabel?: string;
  showDesktopBrowserCta?: boolean;
  orLabel?: string;
  desktopBrowserLabel?: string;
}) {
  const [installOpen, setInstallOpen] = useState(false);
  const [betaOpen, setBetaOpen] = useState(false);
  const [modalPlatform, setModalPlatform] = useState<MarketingPlatform>("desktop");
  const [devicePlatform, setDevicePlatform] =
    useState<MarketingPlatform>("desktop");

  useEffect(() => {
    setDevicePlatform(detectMarketingPlatform());
  }, []);

  const openDesktopInstallModal = (next: MarketingPlatform) => {
    setModalPlatform(next);
    setInstallOpen(true);
  };

  const onAppleClick = () => {
    if (devicePlatform === "ios") {
      window.location.assign(appUrl);
      return;
    }
    openDesktopInstallModal("ios");
  };

  const onGoogleClick = () => {
    if (devicePlatform === "android") {
      setBetaOpen(true);
      return;
    }
    openDesktopInstallModal("android");
  };

  const showApple = devicePlatform === "ios" || devicePlatform === "desktop";
  const showGoogle = devicePlatform === "android" || devicePlatform === "desktop";
  const showWebCta = showDesktopBrowserCta && devicePlatform === "desktop";

  return (
    <>
      <div
        className={cn(
          "flex w-fit flex-col gap-4 max-lg:mx-auto max-md:w-full",
          showDesktopBrowserCta && "max-md:max-w-none"
        )}
      >
        <div className={cn("flex flex-wrap gap-4", className)}>
          {showApple ? (
            <StoreDownloadButton
              variant="apple"
              bottomLine={appleLabel}
              iconClassName={iconClassName}
              onClick={onAppleClick}
            />
          ) : null}
          {showGoogle ? (
            <StoreDownloadButton
              variant="google"
              bottomLine={googleLabel}
              iconClassName={iconClassName}
              onClick={onGoogleClick}
            />
          ) : null}
        </div>

        {showWebCta ? (
          <>
            <div className="flex items-center gap-3">
              <div className="bg-border h-px flex-1" />
              <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                {orLabel}
              </span>
              <div className="bg-border h-px flex-1" />
            </div>
            <Link
              href={appUrl}
              className="border-border bg-background text-foreground hover:bg-muted/60 flex w-full items-center justify-center gap-2.5 rounded-lg border px-5 py-3 text-base font-medium transition-colors"
            >
              <Monitor className="size-5 shrink-0 opacity-80" aria-hidden />
              {desktopBrowserLabel}
            </Link>
          </>
        ) : null}
      </div>
      <InstallAppModal
        open={installOpen}
        onOpenChange={setInstallOpen}
        platform={modalPlatform}
        appUrl={appUrl}
        instructionsOnly={devicePlatform === "desktop"}
      />
      <AndroidBetaModal
        open={betaOpen}
        onOpenChange={setBetaOpen}
        appUrl={appUrl}
      />
    </>
  );
}
