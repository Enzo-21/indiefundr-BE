import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveMercadoPagoFailureReturn } from "./returnKind";

describe("resolveMercadoPagoFailureReturn", () => {
  it("treats rejected/cancelled/refunded as failed", () => {
    assert.equal(
      resolveMercadoPagoFailureReturn({
        status: "rejected",
        payment_id: "123",
      }),
      "failed"
    );
    assert.equal(
      resolveMercadoPagoFailureReturn({
        collection_status: "cancelled",
      }),
      "failed"
    );
    assert.equal(
      resolveMercadoPagoFailureReturn({
        status: "REFUNDED",
      }),
      "failed"
    );
  });

  it("treats missing/null status as dismiss (Volver a la tienda)", () => {
    assert.equal(
      resolveMercadoPagoFailureReturn({ preference_id: "pref-1" }),
      "dismiss"
    );
    assert.equal(
      resolveMercadoPagoFailureReturn({
        status: "null",
        collection_status: "null",
      }),
      "dismiss"
    );
    assert.equal(resolveMercadoPagoFailureReturn({}), "dismiss");
  });

  it("does not treat approved/pending as failure copy", () => {
    assert.equal(
      resolveMercadoPagoFailureReturn({ status: "approved" }),
      "dismiss"
    );
    assert.equal(
      resolveMercadoPagoFailureReturn({ collection_status: "pending" }),
      "dismiss"
    );
  });
});
