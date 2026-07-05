import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BROADCAST_BODY_MAX_LENGTH,
  BROADCAST_TITLE_MAX_LENGTH,
} from "@/lib/notifications/broadcastLimits";
import {
  dedupeDeviceTokens,
  partitionDeviceTokens,
  validateBroadcastMessage,
} from "@/services/admin/broadcastPush";
import {
  chunkArray,
  countExpoBatchResult,
  isExpoPushToken,
} from "@/services/orders/pushNotify";

describe("broadcastPush helpers", () => {
  it("validates title and body", () => {
    assert.throws(() => validateBroadcastMessage("", "hello"), /Title is required/);
    assert.throws(() => validateBroadcastMessage("Hi", ""), /Message is required/);
    assert.throws(
      () => validateBroadcastMessage("x".repeat(BROADCAST_TITLE_MAX_LENGTH + 1), "ok"),
      /Title must be at most/
    );
    assert.throws(
      () => validateBroadcastMessage("ok", "x".repeat(BROADCAST_BODY_MAX_LENGTH + 1)),
      /Message must be at most/
    );
    assert.doesNotThrow(() => validateBroadcastMessage("Hello", "World"));
  });

  it("dedupes device tokens", () => {
    const tokens = dedupeDeviceTokens([
      { id: "1", device: "ExponentPushToken[a]" },
      { id: "2", device: "ExponentPushToken[a]" },
      { id: "3", device: "ExponentPushToken[b]" },
      { id: "4", device: null },
      { id: "5", device: "   " },
    ]);

    assert.deepEqual(tokens, ["ExponentPushToken[a]", "ExponentPushToken[b]"]);
  });

  it("partitions expo and fcm tokens", () => {
    const partitioned = partitionDeviceTokens([
      "ExponentPushToken[abc]",
      "fcm-web-token",
      "ExponentPushToken[def]",
    ]);

    assert.equal(partitioned.expoTokens.length, 2);
    assert.equal(partitioned.fcmTokens.length, 1);
    assert.equal(isExpoPushToken(partitioned.expoTokens[0]!), true);
    assert.equal(isExpoPushToken(partitioned.fcmTokens[0]!), false);
  });
});

describe("pushNotify batch helpers", () => {
  it("chunks arrays", () => {
    assert.deepEqual(chunkArray([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
    assert.deepEqual(chunkArray([], 100), []);
  });

  it("counts expo batch tickets", () => {
    assert.deepEqual(
      countExpoBatchResult({
        data: [{ status: "ok" }, { status: "error" }, { status: "ok" }],
      }),
      { sent: 2, failed: 1 }
    );
  });
});
