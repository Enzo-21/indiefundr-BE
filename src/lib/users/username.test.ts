import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildCollisionUsername,
  deriveBaseUsernameFromEmail,
  validateUsernameInput,
} from "./username";

describe("deriveBaseUsernameFromEmail", () => {
  it("uses email local-part lowercased", () => {
    assert.equal(deriveBaseUsernameFromEmail("user@gmail.com"), "user");
    assert.equal(deriveBaseUsernameFromEmail("User@Yahoo.com"), "user");
  });

  it("replaces dots and other disallowed chars with underscores", () => {
    assert.equal(
      deriveBaseUsernameFromEmail("user.outlook@gmail.com"),
      "user_outlook"
    );
  });

  it("falls back to investor when local-part sanitizes to empty", () => {
    assert.equal(deriveBaseUsernameFromEmail("...@example.com"), "investor");
  });
});

describe("buildCollisionUsername", () => {
  it("appends underscore and four alphanumeric characters", () => {
    const candidate = buildCollisionUsername("user");
    assert.match(candidate, /^user_[a-z0-9]{4}$/);
  });
});

describe("validateUsernameInput", () => {
  it("normalizes case", () => {
    const result = validateUsernameInput("My_User");
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.username, "my_user");
    }
  });

  it("rejects too short usernames", () => {
    const result = validateUsernameInput("ab");
    assert.equal(result.ok, false);
  });

  it("rejects invalid characters", () => {
    const result = validateUsernameInput("bad-name");
    assert.equal(result.ok, false);
  });

  it("rejects reserved names", () => {
    const result = validateUsernameInput("admin");
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.msg, /reserved/i);
    }
  });
});
