import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEV_LAN_APP_OPEN_PATH,
  getAppOpenUrl,
  getAppWebUrlFromEnv,
  getProductionCorsOrigins,
  isAppSubdomainHost,
  isDevLocalOrigin,
  isPrivateLanIpv4,
  isProductionAppOrigin,
  resolveAppRedirectTarget,
} from "./appUrl";

describe("appUrl", () => {
  it("defaults app web url to localhost:8081", () => {
    assert.equal(getAppWebUrlFromEnv({}), "http://localhost:8081");
  });

  it("detects app.localhost as app subdomain", () => {
    assert.equal(isAppSubdomainHost("app.localhost:3000"), true);
    assert.equal(isAppSubdomainHost("localhost:3000"), false);
  });

  it("detects app marketing domain in production config", () => {
    const prev = process.env.MARKETING_DOMAIN;
    process.env.MARKETING_DOMAIN = "indiefundr.com";
    try {
      assert.equal(isAppSubdomainHost("app.indiefundr.com"), true);
    } finally {
      if (prev === undefined) {
        delete process.env.MARKETING_DOMAIN;
      } else {
        process.env.MARKETING_DOMAIN = prev;
      }
    }
  });

  it("allows app.localhost in dev CORS origins", () => {
    assert.equal(isDevLocalOrigin("http://app.localhost:3000"), true);
    assert.equal(isDevLocalOrigin("http://localhost:8081"), true);
  });

  it("allows LAN IP origins in dev CORS", () => {
    assert.equal(isDevLocalOrigin("http://192.168.0.23:3000"), true);
    assert.equal(isDevLocalOrigin("http://192.168.0.23:8081"), true);
  });

  it("returns app.localhost open url in development", () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    assert.equal(getAppOpenUrl(), "http://app.localhost:3000");
    process.env.NODE_ENV = prev;
  });

  it("returns LAN open path when request host is a private IP", () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    assert.equal(
      getAppOpenUrl({ host: "192.168.0.23:3000" }),
      `http://192.168.0.23:3000${DEV_LAN_APP_OPEN_PATH}`
    );
    process.env.NODE_ENV = prev;
  });

  it("resolves Expo redirect to the same LAN IP in development", () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    assert.equal(
      resolveAppRedirectTarget("192.168.0.23:3000", {
        APP_WEB_URL: "http://localhost:8081",
      }),
      "http://192.168.0.23:8081"
    );
    assert.equal(
      resolveAppRedirectTarget("app.localhost:3000", {
        APP_WEB_URL: "http://localhost:8081",
      }),
      "http://localhost:8081"
    );
    process.env.NODE_ENV = prev;
  });

  it("detects private LAN IPv4 addresses", () => {
    assert.equal(isPrivateLanIpv4("192.168.0.23"), true);
    assert.equal(isPrivateLanIpv4("10.0.0.5"), true);
    assert.equal(isPrivateLanIpv4("localhost"), false);
  });

  it("returns APP_WEB_URL for production CTAs when configured", () => {
    assert.equal(
      getAppOpenUrl(undefined, {
        NODE_ENV: "production",
        APP_WEB_URL: "https://indiefundr-fe-two.vercel.app",
        MARKETING_DOMAIN: "localhost:3000",
      }),
      "https://indiefundr-fe-two.vercel.app"
    );
  });

  it("falls back to app marketing subdomain when APP_WEB_URL is localhost", () => {
    assert.equal(
      getAppOpenUrl(undefined, {
        NODE_ENV: "production",
        APP_WEB_URL: "http://localhost:8081",
        MARKETING_DOMAIN: "indiefundr.com",
      }),
      "https://app.indiefundr.com"
    );
  });

  it("avoids https://app.localhost when production env vars are unset", () => {
    assert.equal(
      getAppOpenUrl(undefined, {
        NODE_ENV: "production",
      }),
      "http://localhost:8081"
    );
  });

  it("lists production CORS origins from APP_WEB_URL and app marketing subdomain", () => {
    const origins = getProductionCorsOrigins({
      APP_WEB_URL: "https://app.indiefundr.com",
      MARKETING_DOMAIN: "indiefundr.com",
    });
    assert.deepEqual(origins, ["https://app.indiefundr.com"]);
  });

  it("allows production app origin for API CORS", () => {
    assert.equal(
      isProductionAppOrigin("https://app.indiefundr.com", {
        APP_WEB_URL: "https://app.indiefundr.com",
        MARKETING_DOMAIN: "indiefundr.com",
      }),
      true
    );
    assert.equal(
      isProductionAppOrigin("https://evil.example", {
        APP_WEB_URL: "https://app.indiefundr.com",
        MARKETING_DOMAIN: "indiefundr.com",
      }),
      false
    );
  });
});
