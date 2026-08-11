"use client";

import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  adminCreateTreasuryWithdrawal,
  adminValidateTreasuryWithdrawalDestination,
} from "@/actions/admin/withdrawals";
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

const ADDRESS_VALIDATE_DEBOUNCE_MS = 400;

type AddressValidationState = "idle" | "loading" | "valid" | "invalid";

export function TreasurySendUsdtCard() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [destination, setDestination] = useState("");
  const [normalizedAddress, setNormalizedAddress] = useState<string | null>(
    null
  );
  const [addressValidation, setAddressValidation] =
    useState<AddressValidationState>("idle");
  const [addressErrorMessage, setAddressErrorMessage] = useState<string | null>(
    null
  );
  const [addressTouched, setAddressTouched] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [pending, startTransition] = useTransition();
  const validateRequestIdRef = useRef(0);

  useEffect(() => {
    if (!open) return;

    const trimmed = destination.trim();
    if (!trimmed) {
      setAddressValidation("idle");
      setAddressErrorMessage(null);
      setNormalizedAddress(null);
      return;
    }

    setAddressValidation("loading");
    setAddressErrorMessage(null);
    const requestId = ++validateRequestIdRef.current;

    const timer = setTimeout(() => {
      void (async () => {
        const result = await adminValidateTreasuryWithdrawalDestination(trimmed);
        if (validateRequestIdRef.current !== requestId) return;

        if (!result.ok) {
          setAddressValidation("invalid");
          setAddressErrorMessage(
            result.error.msg || "Could not validate destination address"
          );
          setNormalizedAddress(null);
          return;
        }

        if (result.data.valid) {
          setAddressValidation("valid");
          setAddressErrorMessage(null);
          setNormalizedAddress(result.data.normalizedAddress);
        } else {
          setAddressValidation("invalid");
          setAddressErrorMessage(
            result.data.message ||
              "This destination address could not be found on the network."
          );
          setNormalizedAddress(null);
        }
      })();
    }, ADDRESS_VALIDATE_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [destination, open]);

  const resetForm = () => {
    setAmount("");
    setDestination("");
    setNormalizedAddress(null);
    setAddressValidation("idle");
    setAddressErrorMessage(null);
    setAddressTouched(false);
    setSubmitAttempted(false);
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      resetForm();
    }
  };

  const showAddressError =
    (addressTouched || submitAttempted) &&
    (addressValidation === "invalid" ||
      (!destination.trim() && submitAttempted) ||
      (destination.trim() &&
        addressValidation !== "valid" &&
        addressValidation !== "loading" &&
        (addressTouched || submitAttempted)));

  const addressFieldError = (() => {
    if (!addressTouched && !submitAttempted) return null;
    if (!destination.trim()) return "Enter a destination address";
    if (addressValidation === "loading") return null;
    if (addressValidation === "invalid") {
      return addressErrorMessage ?? "Invalid destination address";
    }
    if (addressValidation !== "valid") {
      return "Enter a valid destination address";
    }
    return null;
  })();

  const addressReady = addressValidation === "valid";
  const canSubmit = addressReady && !pending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitAttempted(true);
    setAddressTouched(true);

    const amountUsdt = parseFloat(amount.replace(",", "."));
    if (!(amountUsdt > 0)) {
      toast.error("Enter a valid USDT amount");
      return;
    }
    if (!addressReady) {
      toast.error(addressFieldError ?? "Enter a valid destination address");
      return;
    }

    const dest =
      normalizedAddress ?? destination.trim();

    startTransition(async () => {
      const result = await adminCreateTreasuryWithdrawal({
        amountUsdt,
        destinationAddress: dest,
      });
      if (!result.ok) {
        toast.error(result.error.msg || "Could not create treasury withdrawal");
        return;
      }
      toast.success("Treasury withdrawal queued — complete it in Orders");
      resetForm();
      setOpen(false);
      router.push("/admin/orders");
      router.refresh();
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
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
            <div className="relative">
              <Input
                id="treasury-dest"
                placeholder="Paste Tron wallet address"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                value={destination}
                onChange={(e) => {
                  setDestination(e.target.value);
                  setAddressTouched(true);
                }}
                disabled={pending}
                className={cn(
                  "pr-10 font-mono text-sm",
                  showAddressError && addressFieldError
                    ? "border-destructive focus-visible:ring-destructive/40"
                    : null
                )}
                aria-invalid={Boolean(showAddressError && addressFieldError)}
              />
              <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
                {addressValidation === "loading" ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : addressValidation === "valid" ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                ) : addressValidation === "invalid" ? (
                  <XCircle className="h-4 w-4 text-destructive" />
                ) : null}
              </div>
            </div>
            {addressFieldError ? (
              <p className="text-xs text-destructive">{addressFieldError}</p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => handleOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {pending ? "Creating…" : "Create withdrawal order"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
