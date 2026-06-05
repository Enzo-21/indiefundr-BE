import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Wallet } from "@prisma/client";
import {
  serializeWalletDetail,
  serializeWalletListItem,
} from "./wallet";

const sampleWallet: Wallet = {
  id: "507f1f77bcf86cd799439011",
  userId: "507f1f77bcf86cd799439012",
  name: "IndieFundr wallet",
  address: "TXYZtest123456789012345678901234",
  privateKey: "secret-key-never-in-list",
  isCustom: false,
  isMainWallet: true,
  color: "rgb(100,200,50)",
  date: new Date("2024-06-01T00:00:00.000Z"),
};

describe("serializeWalletListItem", () => {
  it("maps id to _id and omits privateKey", () => {
    const json = serializeWalletListItem(sampleWallet, 12.5);
    assert.equal(json._id, sampleWallet.id);
    assert.equal(json.balance, 12.5);
    assert.equal("privateKey" in json, false);
  });
});

describe("serializeWalletDetail", () => {
  it("includes privateKey for owner detail view", () => {
    const json = serializeWalletDetail(sampleWallet, 5);
    assert.equal(json._id, sampleWallet.id);
    assert.equal(json.privateKey, sampleWallet.privateKey);
    assert.equal(json.date, "2024-06-01T00:00:00.000Z");
  });
});
