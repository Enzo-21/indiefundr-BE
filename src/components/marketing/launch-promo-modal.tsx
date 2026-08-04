"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  EARLY_ACCESS_TOTAL_CUSTOMERS,
  getEarlyAccessSlotsRemaining,
} from "@/lib/marketing/earlyAccessSlots";

const STORAGE_KEY = "indiefundr.launchPromo.v1";

export function LaunchPromoModal() {
  const [open, setOpen] = useState(false);
  const [remaining, setRemaining] = useState(EARLY_ACCESS_TOTAL_CUSTOMERS);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(STORAGE_KEY)) {
        return;
      }
    } catch {
      // Private mode / blocked storage — still show once this session.
    }
    setRemaining(getEarlyAccessSlotsRemaining());
    setOpen(true);
  }, []);

  const dismiss = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // Ignore quota / privacy errors.
    }
    setOpen(false);
  };

  const goToCta = () => {
    dismiss();
    const el = document.getElementById("cta");
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      window.location.hash = "cta";
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          dismiss();
        } else {
          setOpen(true);
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg leading-snug sm:text-xl">
            Higher returns for early users on the IndieFundr web app
          </DialogTitle>
          <DialogDescription className="text-sm sm:text-base">
            Launch pricing for early adopters — get in while spots last. For the
            first {EARLY_ACCESS_TOTAL_CUSTOMERS.toLocaleString("en-US")} customers
            ({remaining.toLocaleString("en-US")} left).
          </DialogDescription>
        </DialogHeader>
        <div className="pt-1">
          <Button type="button" className="w-full" onClick={goToCta}>
            Get started
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
