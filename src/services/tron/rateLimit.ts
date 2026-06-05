import { getEnv } from "@/lib/env";

type CachedHttpResponse = {
  status: number;
  headers: Array<[string, string]>;
  body: string;
  expiresAtMs: number;
};

type TronRateLimitStats = {
  totalRequests: number;
  inFlightRequests: number;
  queuedRequests: number;
  retryCount: number;
  rateLimit429Count: number;
  successfulResponses: number;
  failedResponses: number;
  cacheHits: number;
  cacheMisses: number;
  last429AtMs: number | null;
  lastRequestAtMs: number | null;
};

const responseCache = new Map<string, CachedHttpResponse>();

const stats: TronRateLimitStats = {
  totalRequests: 0,
  inFlightRequests: 0,
  queuedRequests: 0,
  retryCount: 0,
  rateLimit429Count: 0,
  successfulResponses: 0,
  failedResponses: 0,
  cacheHits: 0,
  cacheMisses: 0,
  last429AtMs: null,
  lastRequestAtMs: null,
};

let nextAllowedAtMs = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getLimiterConfig() {
  const env = getEnv();
  const rps = Math.max(1, Math.floor(env.tronHttpRpsLimit));
  const burst = Math.max(1, Math.floor(env.tronHttpBurst));
  const retryMax = Math.max(0, Math.floor(env.tronHttpRetryMax));
  const baseBackoffMs = Math.max(25, Math.floor(env.tronHttpBaseBackoffMs));
  return {
    rps,
    burst,
    retryMax,
    baseBackoffMs,
    diagnosticsEnabled: env.tronLimiterDiagnosticsEnabled,
    logLevel: env.tronLimiterLogLevel,
  };
}

type LimiterLogLevel = "off" | "errors" | "info" | "debug";

const LOG_PRIORITY: Record<LimiterLogLevel, number> = {
  off: 0,
  errors: 1,
  info: 2,
  debug: 3,
};

function sanitizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}${parsed.search ? "?…" : ""}`;
  } catch {
    return url;
  }
}

function logLimiterEvent(
  level: Exclude<LimiterLogLevel, "off">,
  message: string,
  extra?: Record<string, unknown>
) {
  const { diagnosticsEnabled, logLevel } = getLimiterConfig();
  if (!diagnosticsEnabled) return;
  if (LOG_PRIORITY[logLevel] < LOG_PRIORITY[level]) return;
  const payload = extra ? ` ${JSON.stringify(extra)}` : "";
  console.log(`[tron limiter] ${message}${payload}`);
}

function compactStatsSnapshot() {
  return {
    totalRequests: stats.totalRequests,
    inFlightRequests: stats.inFlightRequests,
    queuedRequests: stats.queuedRequests,
    retryCount: stats.retryCount,
    rateLimit429Count: stats.rateLimit429Count,
    cacheHits: stats.cacheHits,
    cacheMisses: stats.cacheMisses,
  };
}

function shouldRetry(status: number): boolean {
  return status === 429 || status >= 500;
}

function parseRetryAfterMs(retryAfter: string | null): number | null {
  if (!retryAfter) return null;
  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.ceil(seconds * 1000);
  }
  const dateMs = Date.parse(retryAfter);
  if (Number.isFinite(dateMs)) {
    return Math.max(0, dateMs - Date.now());
  }
  return null;
}

function isRateLimitError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const withResponse = error as {
    status?: number;
    response?: { status?: number };
    message?: string;
  };
  if (withResponse.status === 429 || withResponse.response?.status === 429) {
    return true;
  }
  const message = String(withResponse.message ?? "");
  return /429|rate limit|too many requests/i.test(message);
}

function buildCacheKey(url: string, init?: RequestInit): string {
  const method = (init?.method || "GET").toUpperCase();
  const headers = new Headers(init?.headers);
  const entries = Array.from(headers.entries()).sort(([a], [b]) =>
    a.localeCompare(b)
  );
  return `${method}:${url}:${JSON.stringify(entries)}`;
}

function isCacheableGet(init?: RequestInit): boolean {
  const method = (init?.method || "GET").toUpperCase();
  return method === "GET";
}

async function takeToken(): Promise<void> {
  const { rps, burst } = getLimiterConfig();
  const intervalMs = 1000 / rps;
  const now = Date.now();
  const burstFloor = now - intervalMs * (burst - 1);
  const scheduledAt = Math.max(nextAllowedAtMs, burstFloor);
  nextAllowedAtMs = scheduledAt + intervalMs;
  const waitMs = Math.max(0, scheduledAt - now);
  if (waitMs > 0) {
    stats.queuedRequests += 1;
    logLimiterEvent("info", "request queued", { waitMs });
    await sleep(waitMs);
  }
}

function cloneFromCache(cached: CachedHttpResponse): Response {
  return new Response(cached.body, {
    status: cached.status,
    headers: new Headers(cached.headers),
  });
}

export async function fetchWithTronRateLimit(
  url: string,
  init?: RequestInit,
  options: { cacheTtlMs?: number } = {}
): Promise<Response> {
  const cacheTtlMs = Math.max(0, Math.floor(options.cacheTtlMs ?? 0));
  const cacheable = cacheTtlMs > 0 && isCacheableGet(init);
  const cacheKey = cacheable ? buildCacheKey(url, init) : null;

  if (cacheable && cacheKey) {
    const cached = responseCache.get(cacheKey);
    if (cached && cached.expiresAtMs > Date.now()) {
      stats.cacheHits += 1;
      logLimiterEvent("debug", "cache hit", { url: sanitizeUrl(url) });
      return cloneFromCache(cached);
    }
    stats.cacheMisses += 1;
    logLimiterEvent("debug", "cache miss", { url: sanitizeUrl(url) });
  }

  const { retryMax, baseBackoffMs } = getLimiterConfig();

  for (let attempt = 0; ; attempt += 1) {
    const startedAt = Date.now();
    stats.totalRequests += 1;
    stats.inFlightRequests += 1;
    stats.lastRequestAtMs = startedAt;
    await takeToken();
    logLimiterEvent("debug", "request sent", {
      method: (init?.method || "GET").toUpperCase(),
      url: sanitizeUrl(url),
      attempt: attempt + 1,
    });
    let response: Response;
    try {
      response = await fetch(url, init);
    } finally {
      stats.inFlightRequests = Math.max(0, stats.inFlightRequests - 1);
    }
    const durationMs = Date.now() - startedAt;

    if (cacheable && cacheKey && response.ok) {
      const body = await response.text();
      const headers = Array.from(response.headers.entries());
      responseCache.set(cacheKey, {
        status: response.status,
        headers,
        body,
        expiresAtMs: Date.now() + cacheTtlMs,
      });
      stats.successfulResponses += 1;
      logLimiterEvent("debug", "request completed", {
        status: response.status,
        durationMs,
        url: sanitizeUrl(url),
      });
      return new Response(body, {
        status: response.status,
        headers: new Headers(headers),
      });
    }

    if (!shouldRetry(response.status) || attempt >= retryMax) {
      if (response.status === 429) {
        stats.rateLimit429Count += 1;
        stats.last429AtMs = Date.now();
        logLimiterEvent("errors", "429 received", {
          status: response.status,
          url: sanitizeUrl(url),
          stats: compactStatsSnapshot(),
        });
      }
      if (response.ok) {
        stats.successfulResponses += 1;
      } else {
        stats.failedResponses += 1;
      }
      logLimiterEvent(response.ok ? "debug" : "info", "request completed", {
        status: response.status,
        durationMs,
        url: sanitizeUrl(url),
        retried: attempt > 0,
      });
      if (stats.inFlightRequests < 0) {
        stats.inFlightRequests = 0;
      }
      return response;
    }

    if (response.status === 429) {
      stats.rateLimit429Count += 1;
      stats.last429AtMs = Date.now();
      logLimiterEvent("errors", "429 received", {
        status: response.status,
        url: sanitizeUrl(url),
        stats: compactStatsSnapshot(),
      });
    }
    stats.retryCount += 1;

    const retryAfterMs = parseRetryAfterMs(response.headers.get("retry-after"));
    const jitterMs = Math.floor(Math.random() * baseBackoffMs);
    const backoffMs =
      retryAfterMs ?? baseBackoffMs * Math.pow(2, attempt) + jitterMs;
    logLimiterEvent("info", "retry scheduled", {
      attempt: attempt + 1,
      status: response.status,
      backoffMs,
      url: sanitizeUrl(url),
    });
    await sleep(backoffMs);
  }
}

export async function runWithTronLimiter<T>(
  operation: string,
  fn: () => Promise<T>
): Promise<T> {
  const { retryMax, baseBackoffMs } = getLimiterConfig();
  for (let attempt = 0; ; attempt += 1) {
    const startedAt = Date.now();
    stats.totalRequests += 1;
    stats.inFlightRequests += 1;
    stats.lastRequestAtMs = startedAt;
    await takeToken();
    logLimiterEvent("debug", "tronweb call sent", {
      operation,
      attempt: attempt + 1,
    });
    try {
      const result = await fn();
      stats.inFlightRequests = Math.max(0, stats.inFlightRequests - 1);
      stats.successfulResponses += 1;
      logLimiterEvent("debug", "tronweb call completed", {
        operation,
        durationMs: Date.now() - startedAt,
      });
      return result;
    } catch (error) {
      stats.inFlightRequests = Math.max(0, stats.inFlightRequests - 1);
      const rateLimited = isRateLimitError(error);
      if (rateLimited) {
        stats.rateLimit429Count += 1;
        stats.last429AtMs = Date.now();
        logLimiterEvent("errors", "429 received", {
          operation,
          attempt: attempt + 1,
          stats: compactStatsSnapshot(),
        });
      }
      if (!rateLimited || attempt >= retryMax) {
        stats.failedResponses += 1;
        throw error;
      }
      stats.retryCount += 1;
      const jitterMs = Math.floor(Math.random() * baseBackoffMs);
      const backoffMs = baseBackoffMs * Math.pow(2, attempt) + jitterMs;
      logLimiterEvent("info", "retry scheduled", {
        operation,
        attempt: attempt + 1,
        backoffMs,
      });
      await sleep(backoffMs);
    }
  }
}

export function getTronRateLimitStats(): TronRateLimitStats {
  return { ...stats };
}

export function resetTronRateLimitStateForTests(): void {
  nextAllowedAtMs = 0;
  responseCache.clear();
  stats.totalRequests = 0;
  stats.inFlightRequests = 0;
  stats.queuedRequests = 0;
  stats.retryCount = 0;
  stats.rateLimit429Count = 0;
  stats.successfulResponses = 0;
  stats.failedResponses = 0;
  stats.cacheHits = 0;
  stats.cacheMisses = 0;
  stats.last429AtMs = null;
  stats.lastRequestAtMs = null;
}
