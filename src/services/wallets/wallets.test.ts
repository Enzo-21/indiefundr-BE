import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { prisma } from "@/lib/prisma";
import { createWallet, setMainWallet } from "./wallets";

import { SKIP_DB_MUTATING_TESTS } from "@/test/constants";

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());
const skipDbTests = SKIP_DB_MUTATING_TESTS || !hasDatabase;

describe("createWallet", () => {
  it(
    "sets first wallet as main",
    { skip: skipDbTests },
    async () => {
      const user = await prisma.user.create({
        data: {
          name: "Wallet Test User",
          email: `wallet-test-${Date.now()}@example.com`,
        },
      });

      const ok = await createWallet(user.id);
      assert.equal(ok, true);

      const wallets = await prisma.wallet.findMany({ where: { userId: user.id } });
      assert.equal(wallets.length, 1);
      assert.equal(wallets[0].isMainWallet, true);

      await prisma.wallet.deleteMany({ where: { userId: user.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  );
});

describe("setMainWallet", () => {
  it(
    "toggles isMainWallet flags",
    { skip: skipDbTests },
    async () => {
      const user = await prisma.user.create({
        data: {
          name: "Main Wallet User",
          email: `main-wallet-${Date.now()}@example.com`,
        },
      });

      await createWallet(user.id);
      const second = await prisma.wallet.create({
        data: {
          userId: user.id,
          address: `TSecond${Date.now()}`,
          privateKey: "pk-second-test-only",
          isMainWallet: false,
        },
      });

      const first = await prisma.wallet.findFirst({
        where: { userId: user.id, isMainWallet: true },
      });
      assert.ok(first);

      const result = await setMainWallet(user.id, second.id);
      assert.equal(result.ok, true);

      const updatedFirst = await prisma.wallet.findUnique({ where: { id: first!.id } });
      const updatedSecond = await prisma.wallet.findUnique({ where: { id: second.id } });
      assert.equal(updatedFirst?.isMainWallet, false);
      assert.equal(updatedSecond?.isMainWallet, true);

      await prisma.wallet.deleteMany({ where: { userId: user.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  );
});
