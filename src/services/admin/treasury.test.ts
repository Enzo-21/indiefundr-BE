import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SKIP_DB_MUTATING_TESTS } from "@/test/constants";
import { getAdminEvents } from "./treasury";

const hasDatabase = Boolean(process.env.DATABASE_URL?.trim());
const skipDbTests = SKIP_DB_MUTATING_TESTS || !hasDatabase;

describe("admin treasury service", () => {
  it(
    "getAdminEvents returns serialized events with _id",
    { skip: skipDbTests },
    async () => {
      const events = await getAdminEvents(5);
      assert.ok(Array.isArray(events));
      if (events.length > 0) {
        assert.ok(events[0]._id);
        assert.ok("type" in events[0]);
      }
    }
  );
});
