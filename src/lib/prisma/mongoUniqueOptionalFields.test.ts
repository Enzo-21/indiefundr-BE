import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { stripMongoUnsetNullUniqueUserFields } from "./mongoUniqueOptionalFields";

describe("mongoUniqueOptionalFields", () => {
  it("removes null referredByInviteId so Mongo sparse unique indexes stay valid", () => {
    const data = {
      email: "a@example.com",
      referredByInviteId: null,
    };

    stripMongoUnsetNullUniqueUserFields(data);

    assert.equal("referredByInviteId" in data, false);
    assert.equal(data.email, "a@example.com");
  });

  it("keeps a real referredByInviteId value", () => {
    const data = {
      referredByInviteId: "665abc123def456789012345",
    };

    stripMongoUnsetNullUniqueUserFields(data);

    assert.equal(data.referredByInviteId, "665abc123def456789012345");
  });
});
