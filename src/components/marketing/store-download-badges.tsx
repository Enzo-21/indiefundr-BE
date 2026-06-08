"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Monitor } from "lucide-react";
import { InstallAppModal } from "@/components/marketing/install-app-modal";
import { StoreDownloadButton } from "@/components/marketing/store-download-button";
import { getAppOpenUrl } from "@/lib/marketing/appUrl";
import {
  detectMarketingPlatform,
  type MarketingPlatform,
} from "@/lib/marketing/detectPlatform";
import { cn } from "@/lib/utils";

export function StoreDownloadBadges({
  requestHost,
  className,
  iconClassName,
  appleLabel,
  googleLabel,
  showDesktopBrowserCta = false,
  orLabel = "OR",
  desktopBrowserLabel = "Run on your computer",
}: {
  requestHost?: string | null;
  className?: string;
  iconClassName?: string;
  appleLabel?: string;
  googleLabel?: string;
  showDesktopBrowserCta?: boolean;
  orLabel?: string;
  desktopBrowserLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [modalPlatform, setModalPlatform] = useState<MarketingPlatform>("desktop");
  const [devicePlatform, setDevicePlatform] =
    useState<MarketingPlatform>("desktop");

  useEffect(() => {
    setDevicePlatform(detectMarketingPlatform());
  }, []);

  const openModal = (next: MarketingPlatform) => {
    setModalPlatform(next);
    setOpen(true);
  };

  const appUrl = getAppOpenUrl({ host: requestHost });
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
              onClick={() => openModal("ios")}
            />
          ) : null}
          {showGoogle ? (
            <StoreDownloadButton
              variant="google"
              bottomLine={googleLabel}
              iconClassName={iconClassName}
              onClick={() => openModal("android")}
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
        open={open}
        onOpenChange={setOpen}
        platform={modalPlatform}
        requestHost={requestHost}
      />
    </>
  );
}
