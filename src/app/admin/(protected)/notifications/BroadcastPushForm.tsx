"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { sendBroadcastPush } from "@/actions/admin/notifications";
import type { BroadcastAudienceStats } from "@/services/admin/broadcastPush";
import {
  BROADCAST_BODY_MAX_LENGTH,
  BROADCAST_TITLE_MAX_LENGTH,
} from "@/lib/notifications/broadcastLimits";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type BroadcastPushFormProps = {
  initialStats: BroadcastAudienceStats;
};

export function BroadcastPushForm({ initialStats }: BroadcastPushFormProps) {
  const [stats, setStats] = useState(initialStats);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const canSend =
    title.trim().length > 0 &&
    body.trim().length > 0 &&
    stats.uniqueTokens > 0 &&
    !pending;

  function handleOpenConfirm() {
    if (!canSend) return;
    setConfirmOpen(true);
  }

  function handleSend() {
    startTransition(async () => {
      const result = await sendBroadcastPush({
        title: title.trim(),
        body: body.trim(),
      });

      setConfirmOpen(false);

      if (!result.ok) {
        toast.error(result.error.msg);
        return;
      }

      setStats({
        totalUsers: result.data.totalUsers,
        usersWithDevice: result.data.usersWithDevice,
        uniqueTokens: result.data.uniqueTokens,
        expoTokens: result.data.expoTokens,
        fcmTokens: result.data.fcmTokens,
      });

      toast.success(
        `Sent ${result.data.sent} notification${result.data.sent === 1 ? "" : "s"}` +
          (result.data.failed > 0 ? ` (${result.data.failed} failed)` : "") +
          (result.data.clearedInvalidTokens > 0
            ? `; cleared ${result.data.clearedInvalidTokens} invalid token${result.data.clearedInvalidTokens === 1 ? "" : "s"}`
            : "")
      );
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Audience</CardTitle>
          <CardDescription>
            Only users with a registered push token receive notifications.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Total users" value={stats.totalUsers} />
          <Stat label="Users with token" value={stats.usersWithDevice} />
          <Stat label="Expo (mobile)" value={stats.expoTokens} />
          <Stat label="Web (FCM)" value={stats.fcmTokens} />
        </CardContent>
      </Card>

      {stats.uniqueTokens === 0 ? (
        <Alert>
          <AlertDescription>
            No users currently have a push token registered. Notifications can be
            sent once users enable push in the app or on web.
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Compose notification</CardTitle>
          <CardDescription>
            Mobile notifications use the title and message separately. Web
            notifications combine them as &quot;Title - Message&quot; in the
            body. The same content will be sent to all {stats.uniqueTokens}{" "}
            unique device token{stats.uniqueTokens === 1 ? "" : "s"}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="broadcast-title">Title</Label>
            <Input
              id="broadcast-title"
              value={title}
              maxLength={BROADCAST_TITLE_MAX_LENGTH}
              placeholder="e.g. New fund available"
              onChange={(event) => setTitle(event.target.value)}
              disabled={pending}
            />
            <p className="text-xs text-muted-foreground">
              {title.trim().length}/{BROADCAST_TITLE_MAX_LENGTH}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="broadcast-body">Message</Label>
            <textarea
              id="broadcast-body"
              value={body}
              maxLength={BROADCAST_BODY_MAX_LENGTH}
              placeholder="Write the notification message..."
              onChange={(event) => setBody(event.target.value)}
              disabled={pending}
              rows={5}
              className={cn(
                "w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-2 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80"
              )}
            />
            <p className="text-xs text-muted-foreground">
              {body.trim().length}/{BROADCAST_BODY_MAX_LENGTH}
            </p>
          </div>

          <Button
            type="button"
            onClick={handleOpenConfirm}
            disabled={!canSend}
          >
            {pending ? "Sending…" : "Send to all"}
          </Button>
        </CardContent>
      </Card>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send push notification?</DialogTitle>
            <DialogDescription>
              This will send &quot;{title.trim()}&quot; to {stats.uniqueTokens}{" "}
              device token{stats.uniqueTokens === 1 ? "" : "s"} (
              {stats.expoTokens} mobile, {stats.fcmTokens} web). This action
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="button" onClick={handleSend} disabled={pending}>
              {pending ? "Sending…" : "Send now"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
