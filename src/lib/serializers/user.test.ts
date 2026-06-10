import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { User } from "@prisma/client";
import { serializeDeviceOnly, serializeUser } from "./user";

const sampleUser: User = {
  id: "507f1f77bcf86cd799439011",
  name: "Test User",
  email: "test@example.com",
  username: "test_user",
  password: "hashed-secret",
  date: new Date("2024-01-15T12:00:00.000Z"),
  firstTime: true,
  hasVerifiedMail: false,
  device: "expo-push-token",
  isPro: false,
};

describe("serializeUser", () => {
  it("maps id to _id and omits password", () => {
    const json = serializeUser(sampleUser);
    assert.equal(json._id, sampleUser.id);
    assert.equal(json.name, sampleUser.name);
    assert.equal(json.email, sampleUser.email);
    assert.equal(json.username, "test_user");
    assert.equal(json.date, "2024-01-15T12:00:00.000Z");
    assert.equal(json.firstTime, true);
    assert.equal(json.hasVerifiedMail, false);
    assert.equal(json.device, "expo-push-token");
    assert.equal(json.isPro, false);
    assert.equal("password" in json, false);
  });
});

describe("serializeDeviceOnly", () => {
  it("returns device field only", () => {
    assert.deepEqual(serializeDeviceOnly({ device: "token" }), {
      device: "token",
    });
    assert.deepEqual(serializeDeviceOnly({ device: null }), { device: null });
  });
});
