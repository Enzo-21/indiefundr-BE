import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getAppConfig,
  isSideloadDeprecated,
  isSideloadSensitiveApiPath,
  shouldBlockSideloadRequest,
} from "./sideloadDeprecation";

describe("sideloadDeprecation", () => {
  it("returns app config from env", () => {
    assert.deepEqual(
      getAppConfig({
        SIDELOAD_DEPRECATED: "true",
        PLAY_STORE_URL: "https://play.example/app",
      }),
      {
        sideloadDeprecated: true,
        playStoreUrl: "https://play.example/app",
      }
    );
  });

  it("detects sensitive API paths", () => {
    assert.equal(isSideloadSensitiveApiPath("/api/funds/subscribe"), true);
    assert.equal(isSideloadSensitiveApiPath("/api/wallets/withdrawals"), true);
    assert.equal(isSideloadSensitiveApiPath("/api/investments/abc/redeem"), true);
    assert.equal(isSideloadSensitiveApiPath("/api/config"), false);
    assert.equal(isSideloadSensitiveApiPath("/api/health"), false);
  });

  it("blocks staging sideload requests when deprecated", () => {
    const request = new Request("https://staging.indiefundr.com/api/funds/subscribe", {
      headers: { "x-app-channel": "staging-preview" },
    });

    assert.equal(
      shouldBlockSideloadRequest(request, { SIDELOAD_DEPRECATED: "true" }),
      true
    );
  });

  it("does not block when sideload is active", () => {
    const request = new Request("https://staging.indiefundr.com/api/funds/subscribe", {
      headers: { "x-app-channel": "staging-preview" },
    });

    assert.equal(
      shouldBlockSideloadRequest(request, { SIDELOAD_DEPRECATED: "false" }),
      false
    );
  });

  it("does not block production channel", () => {
    const request = new Request("https://staging.indiefundr.com/api/funds/subscribe", {
      headers: { "x-app-channel": "production" },
    });

    assert.equal(
      shouldBlockSideloadRequest(request, { SIDELOAD_DEPRECATED: "true" }),
      false
    );
  });

  it("parses SIDELOAD_DEPRECATED variants", () => {
    assert.equal(isSideloadDeprecated({ SIDELOAD_DEPRECATED: "1" }), true);
    assert.equal(isSideloadDeprecated({ SIDELOAD_DEPRECATED: "yes" }), true);
    assert.equal(isSideloadDeprecated({}), false);
  });
});
