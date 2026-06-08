import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isExpoPushToken } from "./pushNotify";

describe("pushNotify", () => {
  it("detects Expo push tokens", () => {
    assert.equal(
      isExpoPushToken("ExponentPushToken[abc123]"),
      true
    );
    assert.equal(
      isExpoPushToken(
        "dK3xYz9longFcmWebRegistrationTokenWithoutExponentPrefix"
      ),
      false
    );
  });
});
