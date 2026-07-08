"use server";

import { withAdminAction } from "@/actions/_lib/withAdminAction";
import {
  broadcastPushNotifications,
  getBroadcastAudienceStats,
} from "@/services/admin/broadcastPush";

export async function fetchBroadcastPushStats() {
  return withAdminAction(() => getBroadcastAudienceStats());
}

export async function sendBroadcastPush(input: {
  title: string;
  body: string;
}) {
  return withAdminAction(({ createdBy }) =>
    broadcastPushNotifications({
      title: input.title,
      body: input.body,
      createdBy,
    })
  );
}
