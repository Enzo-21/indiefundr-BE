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
import type { MarketingPlatform } from "@/lib/marketing/detectPlatform";
import {
  getInstallModalCopy,
  getInstallModalLocale,
} from "@/lib/marketing/installCopy";

export function InstallAppModal({
  open,
  onOpenChange,
  platform,
  appUrl,
  instructionsOnly = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  platform: MarketingPlatform;
  /** Server-resolved open URL — do not call getAppOpenUrl on the client. */
  appUrl: string;
  /** Desktop web: show install steps only, without Open IndieFundr CTAs. */
  instructionsOnly?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [locale, setLocale] = useState<"en" | "es">("en");
  const copy = getInstallModalCopy(locale);
  const mobileCopy =
    platform === "ios"
      ? copy.ios
      : platform === "android"
        ? copy.android
        : null;
  const headerTitle =
    platform === "android" ? copy.androidHeaderTitle : copy.headerTitle;
  const headerSubtitle =
    platform === "android" ? copy.androidHeaderSubtitle : copy.headerSubtitle;

  useEffect(() => {
    setLocale(getInstallModalLocale());
  }, []);

  useEffect(() => {
    if (!open) {
      setCopied(false);
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base leading-snug">
            {headerTitle}
          </DialogTitle>
          <DialogDescription className="text-sm">
            {headerSubtitle}
          </DialogDescription>
        </DialogHeader>

        {mobileCopy ? (
          <div className="space-y-3">
            {mobileCopy.steps.map((step, index) => (
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

        {platform === "desktop" ? (
          <div className="space-y-2">
            <p className="text-foreground text-sm font-medium">
              {copy.desktop.title}
            </p>
            <p className="text-muted-foreground text-sm">
              {copy.desktop.body}
            </p>
            <p className="text-muted-foreground break-all rounded-md border bg-muted/30 px-3 py-2 font-mono text-xs">
              {appUrl}
            </p>
          </div>
        ) : null}

        {!instructionsOnly ? (
          <div className="flex flex-col gap-2 pt-1 sm:flex-row">
            {platform === "desktop" ? (
              <>
                <Button type="button" className="flex-1" onClick={copyLink}>
                  {copied ? (locale === "es" ? "¡Copiado!" : "Copied!") : copy.desktop.primaryCta}
                </Button>
                <a
                  href={appUrl}
                  className={cn(buttonVariants({ variant: "outline" }), "flex-1")}
                >
                  {copy.desktop.secondaryCta}
                </a>
              </>
            ) : mobileCopy ? (
              <>
                <a href={appUrl} className={cn(buttonVariants(), "flex-1")}>
                  {mobileCopy.openAppCta}
                </a>
                <a
                  href={mobileCopy.fullGuideUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(buttonVariants({ variant: "outline" }), "flex-1")}
                >
                  {mobileCopy.fullGuideLabel}
                </a>
              </>
            ) : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
