import { beforeEach, describe, expect, it, vi } from "vitest";

const {
    countUsersMock,
    getUserByUsernameMock,
    createUserMock,
    hashPasswordMock,
    setSessionCookieMock,
    checkRateLimitMock,
    isSupabaseConfiguredMock,
} = vi.hoisted(() => ({
    countUsersMock: vi.fn(),
    getUserByUsernameMock: vi.fn(),
    createUserMock: vi.fn(),
    hashPasswordMock: vi.fn(),
    setSessionCookieMock: vi.fn(),
    checkRateLimitMock: vi.fn(),
    isSupabaseConfiguredMock: vi.fn(),
}));

vi.mock("@/app/lib/server/data", () => ({
    countUsers: countUsersMock,
    getUserByUsername: getUserByUsernameMock,
    createUser: createUserMock,
}));

vi.mock("@/app/lib/server/auth", () => ({
    hashPassword: hashPasswordMock,
    setSessionCookie: setSessionCookieMock,
}));

vi.mock("@/app/lib/server/supabase", () => ({
    isSupabaseConfigured: isSupabaseConfiguredMock,
}));

vi.mock("@/app/lib/server/rate-limit", () => ({
    checkRateLimit: checkRateLimitMock,
    getClientIp: () => "192.0.2.2",
}));

import { POST } from "./route";

function jsonRequest(body: unknown | string): Request {
    return new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: typeof body === "string" ? body : JSON.stringify(body),
    });
}

beforeEach(() => {
    countUsersMock.mockReset();
    getUserByUsernameMock.mockReset();
    createUserMock.mockReset();
    hashPasswordMock.mockReset();
    setSessionCookieMock.mockReset();
    checkRateLimitMock.mockReset();
    isSupabaseConfiguredMock.mockReset();

    isSupabaseConfiguredMock.mockReturnValue(true);
    checkRateLimitMock.mockReturnValue({ allowed: true, retryAfterSeconds: 0 });
    hashPasswordMock.mockResolvedValue({ passwordHash: "hash", passwordSalt: "salt" });
});

describe("POST /api/auth/register", () => {
    it("creates a user and sets session for valid input under the cap", async () => {
        countUsersMock.mockResolvedValue(2);
        getUserByUsernameMock.mockResolvedValue(null);
        createUserMock.mockResolvedValue(undefined);

        const res = await POST(jsonRequest({ username: "newbie", password: "long-enough" }));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body).toEqual({ username: "newbie" });

        expect(createUserMock).toHaveBeenCalledTimes(1);
        expect(setSessionCookieMock).toHaveBeenCalledTimes(1);
    });

    it("2.3 returns 403 once the 5-user limit is reached", async () => {
        countUsersMock.mockResolvedValue(5);
        getUserByUsernameMock.mockResolvedValue(null);

        const res = await POST(jsonRequest({ username: "sixth", password: "long-enough" }));
        expect(res.status).toBe(403);
        const body = await res.json();
        expect(body.error).toMatch(/limit reached/i);

        expect(createUserMock).not.toHaveBeenCalled();
        expect(setSessionCookieMock).not.toHaveBeenCalled();
    });

    it("2.3b also blocks at 6 users (limit is a hard ceiling, not exclusive)", async () => {
        countUsersMock.mockResolvedValue(6);
        getUserByUsernameMock.mockResolvedValue(null);

        const res = await POST(jsonRequest({ username: "seventh", password: "long-enough" }));
        expect(res.status).toBe(403);
    });

    it("2.4 returns 409 when the username already exists", async () => {
        getUserByUsernameMock.mockResolvedValue({
            id: "existing",
            username: "alice",
            passwordHash: "x",
            passwordSalt: "y",
            createdAt: new Date().toISOString(),
        });

        const res = await POST(jsonRequest({ username: "alice", password: "long-enough" }));
        expect(res.status).toBe(409);
        const body = await res.json();
        expect(body.error).toMatch(/already exists/i);

        expect(countUsersMock).not.toHaveBeenCalled();
        expect(createUserMock).not.toHaveBeenCalled();
    });

    it("returns 400 for too-short username or password", async () => {
        getUserByUsernameMock.mockResolvedValue(null);

        const tooShortUsername = await POST(jsonRequest({ username: "ab", password: "long-enough" }));
        expect(tooShortUsername.status).toBe(400);

        const tooShortPassword = await POST(jsonRequest({ username: "alice", password: "12345" }));
        expect(tooShortPassword.status).toBe(400);

        expect(createUserMock).not.toHaveBeenCalled();
    });

    it("returns 400 (not 500) for empty body", async () => {
        const res = await POST(jsonRequest(""));
        expect(res.status).toBe(400);
        expect(getUserByUsernameMock).not.toHaveBeenCalled();
    });

    it("returns 429 when rate-limited", async () => {
        checkRateLimitMock.mockReturnValue({ allowed: false, retryAfterSeconds: 30 });

        const res = await POST(jsonRequest({ username: "alice", password: "long-enough" }));
        expect(res.status).toBe(429);
        expect(getUserByUsernameMock).not.toHaveBeenCalled();
    });

    it("returns 503 when Supabase is not configured", async () => {
        isSupabaseConfiguredMock.mockReturnValueOnce(false);

        const res = await POST(jsonRequest({ username: "alice", password: "long-enough" }));
        expect(res.status).toBe(503);
    });
});
