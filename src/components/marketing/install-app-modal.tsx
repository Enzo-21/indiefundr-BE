"use client";

import { useEffect, useState } from "react";
import { MotionPreset } from "@/components/motion-preset";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getAppOpenUrl } from "@/lib/marketing/appUrl";
import type { MarketingPlatform } from "@/lib/marketing/detectPlatform";
import { installModalCopy } from "@/lib/marketing/installCopy";
import {
  APK_DOWNLOAD_URL,
  IOS_BETA_TESTFLIGHT_URL,
  TESTFLIGHT_APP_STORE_URL,
} from "@/lib/marketing/nativeDistribution";

export function InstallAppModal({
  open,
  onOpenChange,
  platform,
  requestHost,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  platform: MarketingPlatform;
  requestHost?: string | null;
}) {
  const [copied, setCopied] = useState(false);
  const [apkMessage, setApkMessage] = useState<string | null>(null);
  const appUrl = getAppOpenUrl({ host: requestHost });

  useEffect(() => {
    if (!open) {
      setCopied(false);
      setApkMessage(null);
    }
  }, [open]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(appUrl);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const handleAndroidInstall = () => {
    if (APK_DOWNLOAD_URL) {
      window.location.href = APK_DOWNLOAD_URL;
      return;
    }
    setApkMessage(installModalCopy.android.apkInProgressDetail);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base leading-snug">
            {installModalCopy.headerTitle}
          </DialogTitle>
          <DialogDescription className="text-sm">
            {installModalCopy.headerSubtitle}
          </DialogDescription>
        </DialogHeader>

        {platform === "ios" ? (
          <div className="space-y-3">
            {installModalCopy.ios.steps.map((step, index) => (
              <MotionPreset
                key={step.title}
                fade
                slide={{ direction: "up", offset: 16 }}
                delay={0.08 * index}
                className="rounded-lg border bg-muted/40 px-3 py-2.5"
              >
                <p className="text-foreground text-sm font-medium">
                  {index + 1}. {step.title}
                </p>
                <p className="text-muted-foreground mt-0.5 text-xs">{step.body}</p>
              </MotionPreset>
            ))}
          </div>
        ) : null}

        {platform === "android" ? (
          <div className="space-y-3">
            <p className="text-muted-foreground rounded-lg border bg-muted/40 px-3 py-2.5 text-sm">
              {installModalCopy.android.intro}
            </p>
            {apkMessage ? (
              <p className="text-foreground text-sm font-medium">{apkMessage}</p>
            ) : null}
          </div>
        ) : null}

        {platform === "desktop" ? (
          <div className="space-y-2">
            <p className="text-foreground text-sm font-medium">
              {installModalCopy.desktop.title}
            </p>
            <p className="text-muted-foreground text-sm">
              {installModalCopy.desktop.body}
            </p>
            <p className="text-muted-foreground break-all rounded-md border bg-muted/30 px-3 py-2 font-mono text-xs">
              {appUrl}
            </p>
          </div>
        ) : null}

        <div className="flex flex-col gap-2 pt-1 sm:flex-row">
          {platform === "desktop" ? (
            <Button type="button" className="flex-1" onClick={copyLink}>
              {copied ? "Copied!" : installModalCopy.desktop.primaryCta}
            </Button>
          ) : platform === "ios" ? (
            <>
              <a
                href={IOS_BETA_TESTFLIGHT_URL}
                className={cn(buttonVariants(), "flex-1")}
              >
                {installModalCopy.ios.primaryCta}
              </a>
              <a
                href={TESTFLIGHT_APP_STORE_URL}
                className={cn(buttonVariants({ variant: "outline" }), "flex-1")}
              >
                {installModalCopy.ios.secondaryCta}
              </a>
            </>
          ) : (
            <Button type="button" className="flex-1" onClick={handleAndroidInstall}>
              {apkMessage
                ? installModalCopy.android.apkInProgress
                : installModalCopy.android.primaryCta}
            </Button>
          )}
          {platform === "desktop" ? (
            <a
              href={appUrl}
              className={cn(buttonVariants({ variant: "outline" }), "flex-1")}
            >
              {installModalCopy.desktop.secondaryCta}
            </a>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
