import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildMercadoPagoExternalReference,
  getMercadoPagoEnvTag,
  shouldForwardMercadoPagoWebhook,
} from "./config";

describe("getMercadoPagoEnvTag", () => {
  it("returns prod for VERCEL_ENV production", () => {
    assert.equal(
      getMercadoPagoEnvTag({ VERCEL_ENV: "production" }),
      "prod"
    );
  });

  it("returns stg for staging/preview", () => {
    assert.equal(getMercadoPagoEnvTag({ VERCEL_ENV: "preview" }), "stg");
    assert.equal(
      getMercadoPagoEnvTag({
        VERCEL_ENV: "production",
        DATABASE_URL: "mongodb://x/staging",
      }),
      "prod"
    );
    assert.equal(
      getMercadoPagoEnvTag({
        NODE_ENV: "production",
        DATABASE_URL: "mongodb://x/staging",
        VERCEL_ENV: "preview",
      }),
      "stg"
    );
  });
});

describe("buildMercadoPagoExternalReference", () => {
  it("tags staging and production refs", () => {
    assert.equal(
      buildMercadoPagoExternalReference("user1", { VERCEL_ENV: "preview" }, 42),
      "mp_stg_user1_42"
    );
    assert.equal(
      buildMercadoPagoExternalReference(
        "user1",
        { VERCEL_ENV: "production" },
        42
      ),
      "mp_prod_user1_42"
    );
  });
});

describe("shouldForwardMercadoPagoWebhook", () => {
  const forwardUrl = "https://staging.indiefundr.com/api/mercadopago/webhook";

  it("forwards only mp_stg_ when forward URL is set", () => {
    assert.equal(
      shouldForwardMercadoPagoWebhook({
        externalReference: "mp_stg_user_1",
        forwardUrl,
      }),
      true
    );
    assert.equal(
      shouldForwardMercadoPagoWebhook({
        externalReference: "mp_prod_user_1",
        forwardUrl,
      }),
      false
    );
    assert.equal(
      shouldForwardMercadoPagoWebhook({
        externalReference: "mp_user_1",
        forwardUrl,
      }),
      false
    );
  });

  it("never forwards without forward URL", () => {
    assert.equal(
      shouldForwardMercadoPagoWebhook({
        externalReference: "mp_stg_user_1",
        forwardUrl: "",
      }),
      false
    );
    assert.equal(
      shouldForwardMercadoPagoWebhook({
        externalReference: "mp_stg_user_1",
        forwardUrl: null,
      }),
      false
    );
  });
});
