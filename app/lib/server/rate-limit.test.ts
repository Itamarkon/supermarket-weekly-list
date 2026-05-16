import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkRateLimit, getClientIp } from "./rate-limit";

// The rate-limit module keeps a module-scoped Map. To keep tests isolated we
// use a unique key per test (random suffix) rather than trying to reset the
// internal state.
let uniqueSuffix = 0;
function key(name: string): string {
  uniqueSuffix += 1;
  return `${name}-${uniqueSuffix}-${Math.random().toString(36).slice(2)}`;
}

describe("rate-limit: checkRateLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-16T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("1.5 allows the first N attempts then blocks the (N+1)th in the same window", () => {
    const k = key("login");
    const limit = 3;
    const windowMs = 60_000;

    expect(checkRateLimit(k, limit, windowMs).allowed).toBe(true);
    expect(checkRateLimit(k, limit, windowMs).allowed).toBe(true);
    expect(checkRateLimit(k, limit, windowMs).allowed).toBe(true);

    const blocked = checkRateLimit(k, limit, windowMs);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it("1.5b retryAfterSeconds shrinks as the window elapses", () => {
    const k = key("login");
    const limit = 2;
    const windowMs = 60_000;

    checkRateLimit(k, limit, windowMs);
    checkRateLimit(k, limit, windowMs);

    const first = checkRateLimit(k, limit, windowMs);
    expect(first.allowed).toBe(false);
    const firstRetry = first.retryAfterSeconds;

    vi.advanceTimersByTime(30_000);

    const second = checkRateLimit(k, limit, windowMs);
    expect(second.allowed).toBe(false);
    expect(second.retryAfterSeconds).toBeLessThan(firstRetry);
  });

  it("1.6 resets and allows again after the window expires", () => {
    const k = key("login");
    const limit = 2;
    const windowMs = 60_000;

    checkRateLimit(k, limit, windowMs);
    checkRateLimit(k, limit, windowMs);
    expect(checkRateLimit(k, limit, windowMs).allowed).toBe(false);

    // Advance just past the window.
    vi.advanceTimersByTime(windowMs + 1);

    const reset = checkRateLimit(k, limit, windowMs);
    expect(reset.allowed).toBe(true);
    expect(reset.retryAfterSeconds).toBe(0);
  });

  it("1.6b different keys do not share counters", () => {
    const a = key("ip-a");
    const b = key("ip-b");
    const limit = 2;
    const windowMs = 60_000;

    checkRateLimit(a, limit, windowMs);
    checkRateLimit(a, limit, windowMs);
    expect(checkRateLimit(a, limit, windowMs).allowed).toBe(false);

    // Different key starts fresh.
    expect(checkRateLimit(b, limit, windowMs).allowed).toBe(true);
  });
});

describe("rate-limit: getClientIp", () => {
  it("returns the first x-forwarded-for entry, trimmed", () => {
    const req = new Request("http://example.com", {
      headers: { "x-forwarded-for": "  198.51.100.7 , 10.0.0.1 " },
    });
    expect(getClientIp(req)).toBe("198.51.100.7");
  });

  it("falls back to 'unknown' when no forwarded header is set", () => {
    const req = new Request("http://example.com");
    expect(getClientIp(req)).toBe("unknown");
  });
});
