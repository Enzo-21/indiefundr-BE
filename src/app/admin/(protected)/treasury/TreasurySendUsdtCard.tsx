"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { adminCreateTreasuryWithdrawal } from "@/actions/admin/withdrawals";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function TreasurySendUsdtCard() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [destination, setDestination] = useState("");
  const [pending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amountUsdt = parseFloat(amount.replace(",", "."));
    if (!(amountUsdt > 0)) {
      toast.error("Enter a valid USDT amount");
      return;
    }
    if (!destination.trim()) {
      toast.error("Enter a destination address");
      return;
    }

    startTransition(async () => {
      const result = await adminCreateTreasuryWithdrawal({
        amountUsdt,
        destinationAddress: destination.trim(),
      });
      if (!result.ok) {
        toast.error(result.error.msg || "Could not create treasury withdrawal");
        return;
      }
      toast.success("Treasury withdrawal queued — complete it in Orders");
      setAmount("");
      setDestination("");
      setOpen(false);
      router.push("/admin/orders");
      router.refresh();
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        className={cn(buttonVariants({ variant: "default" }))}
      >
        Send USDT
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Send USDT from Treasury</DialogTitle>
            <DialogDescription>
              Creates a withdrawal order funded by the treasury wallet. Complete
              it in Orders to use JustLend Energy rent on mainnet.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="treasury-amount">Amount (USDT)</Label>
            <Input
              id="treasury-amount"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={pending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="treasury-dest">Destination (TRC20)</Label>
            <Input
              id="treasury-dest"
              placeholder="T…"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              disabled={pending}
              className="font-mono text-sm"
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Creating…" : "Create withdrawal order"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
