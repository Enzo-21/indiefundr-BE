import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  WEB_PUSH_APP_TITLE,
  formatWebPushNotification,
} from "@/lib/notifications/webPushContent";

describe("webPushContent", () => {
  it("combines title and body for web notifications", () => {
    assert.deepEqual(
      formatWebPushNotification("Hello team", "Invest more this week"),
      {
        title: WEB_PUSH_APP_TITLE,
        body: "Hello team - Invest more this week",
      }
    );
  });

  it("falls back when only one field is provided", () => {
    assert.deepEqual(formatWebPushNotification("Hello team", ""), {
      title: WEB_PUSH_APP_TITLE,
      body: "Hello team",
    });
    assert.deepEqual(formatWebPushNotification("", "Invest more"), {
      title: WEB_PUSH_APP_TITLE,
      body: "Invest more",
    });
  });
});
