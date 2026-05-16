import { beforeEach, describe, expect, it, vi } from "vitest";

const {
    getUserByUsernameMock,
    verifyPasswordMock,
    setSessionCookieMock,
    checkRateLimitMock,
    isSupabaseConfiguredMock,
} = vi.hoisted(() => ({
    getUserByUsernameMock: vi.fn(),
    verifyPasswordMock: vi.fn(),
    setSessionCookieMock: vi.fn(),
    checkRateLimitMock: vi.fn(),
    isSupabaseConfiguredMock: vi.fn(),
}));

vi.mock("@/app/lib/server/data", () => ({
    getUserByUsername: getUserByUsernameMock,
}));

vi.mock("@/app/lib/server/auth", () => ({
    verifyPassword: verifyPasswordMock,
    setSessionCookie: setSessionCookieMock,
}));

vi.mock("@/app/lib/server/supabase", () => ({
    isSupabaseConfigured: isSupabaseConfiguredMock,
}));

vi.mock("@/app/lib/server/rate-limit", () => ({
    checkRateLimit: checkRateLimitMock,
    getClientIp: () => "192.0.2.1",
}));

import { POST } from "./route";

function jsonRequest(body: unknown | string): Request {
    return new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: typeof body === "string" ? body : JSON.stringify(body),
    });
}

function rawRequest(body: string): Request {
    return new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
    });
}

const FAKE_USER = {
    id: "user-1",
    username: "alice",
    passwordHash: "hash",
    passwordSalt: "salt",
    createdAt: new Date().toISOString(),
};

beforeEach(() => {
    getUserByUsernameMock.mockReset();
    verifyPasswordMock.mockReset();
    setSessionCookieMock.mockReset();
    checkRateLimitMock.mockReset();
    isSupabaseConfiguredMock.mockReset();
    isSupabaseConfiguredMock.mockReturnValue(true);
    checkRateLimitMock.mockReturnValue({ allowed: true, retryAfterSeconds: 0 });
});

describe("POST /api/auth/login", () => {
    it("2.1 returns 200 + Set-Cookie call for valid credentials", async () => {
        getUserByUsernameMock.mockResolvedValue(FAKE_USER);
        verifyPasswordMock.mockResolvedValue(true);

        const res = await POST(jsonRequest({ username: "alice", password: "correct" }));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body).toEqual({ username: "alice" });
        expect(setSessionCookieMock).toHaveBeenCalledWith("user-1");
    });

    it("2.1b returns 401 for an unknown username (no Set-Cookie call)", async () => {
        getUserByUsernameMock.mockResolvedValue(null);

        const res = await POST(jsonRequest({ username: "ghost", password: "anything" }));
        expect(res.status).toBe(401);
        const body = await res.json();
        expect(body.error).toMatch(/invalid username or password/i);
        expect(setSessionCookieMock).not.toHaveBeenCalled();
    });

    it("2.1c returns 401 for a known username with a wrong password", async () => {
        getUserByUsernameMock.mockResolvedValue(FAKE_USER);
        verifyPasswordMock.mockResolvedValue(false);

        const res = await POST(jsonRequest({ username: "alice", password: "wrong" }));
        expect(res.status).toBe(401);
        expect(setSessionCookieMock).not.toHaveBeenCalled();
    });

    it("2.2 returns 400 (not 500) for an empty body", async () => {
        const res = await POST(rawRequest(""));
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toMatch(/invalid json/i);
        expect(getUserByUsernameMock).not.toHaveBeenCalled();
    });

    it("2.2b returns 400 (not 500) for malformed JSON", async () => {
        const res = await POST(rawRequest("not actually json {"));
        expect(res.status).toBe(400);
    });

    it("returns 429 when the rate limiter denies the request", async () => {
        checkRateLimitMock.mockReturnValue({ allowed: false, retryAfterSeconds: 42 });

        const res = await POST(jsonRequest({ username: "alice", password: "correct" }));
        expect(res.status).toBe(429);
        const body = await res.json();
        expect(body.error).toMatch(/42 seconds/);
        expect(getUserByUsernameMock).not.toHaveBeenCalled();
    });

    it("returns 503 when Supabase is not configured", async () => {
        isSupabaseConfiguredMock.mockReturnValueOnce(false);

        const res = await POST(jsonRequest({ username: "alice", password: "correct" }));
        expect(res.status).toBe(503);
    });
});
