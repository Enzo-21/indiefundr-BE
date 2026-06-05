import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { resetEnvCache } from "@/lib/env";
import {
  fetchWithTronRateLimit,
  getTronRateLimitStats,
  resetTronRateLimitStateForTests,
} from "./rateLimit";

function setRateLimitEnv(overrides: Record<string, string>) {
  Object.assign(process.env, {
    TRON_HTTP_RPS_LIMIT: "1000",
    TRON_HTTP_BURST: "2",
    TRON_HTTP_RETRY_MAX: "3",
    TRON_HTTP_BASE_BACKOFF_MS: "5",
    ...overrides,
  });
  resetEnvCache();
  resetTronRateLimitStateForTests();
}

describe("fetchWithTronRateLimit", () => {
  afterEach(() => {
    mock.restoreAll();
    resetTronRateLimitStateForTests();
    resetEnvCache();
  });

  it("retries on 429 then succeeds", async () => {
    setRateLimitEnv({});
    let calls = 0;
    mock.method(globalThis, "fetch", async () => {
      calls += 1;
      if (calls === 1) {
        return new Response("busy", { status: 429 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });

    const response = await fetchWithTronRateLimit("https://api.trongrid.io/v1/a");
    assert.equal(response.status, 200);
    assert.equal(calls, 2);
    const stats = getTronRateLimitStats();
    assert.equal(stats.totalRequests, 2);
    assert.equal(stats.successfulResponses, 1);
    assert.equal(stats.failedResponses, 0);
    assert.equal(stats.retryCount, 1);
    assert.equal(stats.rateLimit429Count, 1);
  });

  it("respects Retry-After header on 429", async () => {
    setRateLimitEnv({ TRON_HTTP_BASE_BACKOFF_MS: "1" });
    let calls = 0;
    mock.method(globalThis, "fetch", async () => {
      calls += 1;
      if (calls === 1) {
        return new Response("busy", {
          status: 429,
          headers: { "retry-after": "0.02" },
        });
      }
      return new Response("ok", { status: 200 });
    });

    const started = Date.now();
    const response = await fetchWithTronRateLimit("https://api.trongrid.io/v1/b");
    const elapsed = Date.now() - started;

    assert.equal(response.status, 200);
    assert.equal(calls, 2);
    assert.ok(elapsed >= 15);
  });

  it("uses short TTL cache for identical GET requests", async () => {
    setRateLimitEnv({});
    let calls = 0;
    mock.method(globalThis, "fetch", async () => {
      calls += 1;
      return new Response(JSON.stringify({ n: calls }), { status: 200 });
    });

    const first = await fetchWithTronRateLimit("https://api.trongrid.io/v1/c", {}, {
      cacheTtlMs: 2000,
    });
    const second = await fetchWithTronRateLimit("https://api.trongrid.io/v1/c", {}, {
      cacheTtlMs: 2000,
    });

    assert.equal(calls, 1);
    assert.equal(await first.text(), await second.text());
    const stats = getTronRateLimitStats();
    assert.equal(stats.cacheHits, 1);
  });

  it("emits limiter logs when diagnostics are enabled", async () => {
    setRateLimitEnv({
      TRON_LIMITER_DIAGNOSTICS_ENABLED: "true",
      TRON_LIMITER_LOG_LEVEL: "errors",
    });
    let calls = 0;
    const logCalls: string[] = [];
    mock.method(console, "log", (...args: unknown[]) => {
      logCalls.push(args.map((a) => String(a)).join(" "));
    });
    mock.method(globalThis, "fetch", async () => {
      calls += 1;
      if (calls === 1) {
        return new Response("busy", { status: 429 });
      }
      return new Response("ok", { status: 200 });
    });

    const response = await fetchWithTronRateLimit("https://api.trongrid.io/v1/d");
    assert.equal(response.status, 200);
    assert.ok(logCalls.some((line) => line.includes("[tron limiter] 429 received")));
  });
});
