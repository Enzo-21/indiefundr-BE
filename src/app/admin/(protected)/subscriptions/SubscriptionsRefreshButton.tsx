"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";

export function SubscriptionsRefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(() => {
          router.refresh();
        })
      }
    >
      {pending ? "Refreshing..." : "Refresh chain balances"}
    </Button>
  );
}
