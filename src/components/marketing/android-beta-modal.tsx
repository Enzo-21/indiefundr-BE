"use client";

import { useEffect, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  getInstallModalCopy,
  getInstallModalLocale,
} from "@/lib/marketing/installCopy";

export function AndroidBetaModal({
  open,
  onOpenChange,
  appUrl,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Server-resolved open URL — do not call getAppOpenUrl on the client. */
  appUrl: string;
}) {
  const [locale, setLocale] = useState<"en" | "es">("en");
  const copy = getInstallModalCopy(locale).androidBetaNotice;

  useEffect(() => {
    setLocale(getInstallModalLocale());
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base leading-snug">
            {copy.title}
          </DialogTitle>
          <DialogDescription className="text-sm">
            {copy.body}
          </DialogDescription>
        </DialogHeader>
        <a href={appUrl} className={cn(buttonVariants(), "w-full")}>
          {copy.cta}
        </a>
      </DialogContent>
    </Dialog>
  );
}
