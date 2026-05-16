import { beforeEach, describe, expect, it, vi } from "vitest";

const {
    getCurrentUserMock,
    getVisibleStateForUserMock,
    saveUserStateMock,
    isSupabaseConfiguredMock,
} = vi.hoisted(() => ({
    getCurrentUserMock: vi.fn(),
    getVisibleStateForUserMock: vi.fn(),
    saveUserStateMock: vi.fn(),
    isSupabaseConfiguredMock: vi.fn(),
}));

vi.mock("@/app/lib/server/auth", () => ({
    getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/app/lib/server/data", async () => {
    const actual = await vi.importActual<typeof import("@/app/lib/server/data")>("@/app/lib/server/data");
    return {
        ...actual,
        getVisibleStateForUser: getVisibleStateForUserMock,
        saveUserState: saveUserStateMock,
    };
});

vi.mock("@/app/lib/server/supabase", () => ({
    isSupabaseConfigured: isSupabaseConfiguredMock,
}));

import { GET, PUT } from "./route";

function putRequest(body: unknown | string): Request {
    return new Request("http://localhost/api/state", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: typeof body === "string" ? body : JSON.stringify(body),
    });
}

const FAKE_USER = {
    id: "user-1",
    username: "alice",
    passwordHash: "h",
    passwordSalt: "s",
    createdAt: new Date().toISOString(),
};

beforeEach(() => {
    getCurrentUserMock.mockReset();
    getVisibleStateForUserMock.mockReset();
    saveUserStateMock.mockReset();
    isSupabaseConfiguredMock.mockReset();
    isSupabaseConfiguredMock.mockReturnValue(true);
});

describe("GET /api/state", () => {
    it("2.5 returns 401 when no session cookie is present", async () => {
        getCurrentUserMock.mockResolvedValue(null);

        const res = await GET();
        expect(res.status).toBe(401);
        expect(getVisibleStateForUserMock).not.toHaveBeenCalled();
    });

    it("2.5b returns 200 with lists+history for a valid session", async () => {
        getCurrentUserMock.mockResolvedValue(FAKE_USER);
        getVisibleStateForUserMock.mockResolvedValue({
            lists: [
                {
                    id: "L1",
                    title: "Groceries",
                    plannedDate: "2026-05-16",
                    items: [],
                    ownerId: FAKE_USER.id,
                    sharedWithUserIds: [],
                    updatedAt: new Date().toISOString(),
                    isOwner: true,
                },
            ],
            history: { milk: { weeksInRow: 3, totalTimes: 5 } },
        });

        const res = await GET();
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.lists).toHaveLength(1);
        expect(body.lists[0].id).toBe("L1");
        expect(body.history.milk).toEqual({ weeksInRow: 3, totalTimes: 5 });
    });

    it("returns 503 when Supabase is not configured (even with a session)", async () => {
        getCurrentUserMock.mockResolvedValue(FAKE_USER);
        isSupabaseConfiguredMock.mockReturnValue(false);

        const res = await GET();
        expect(res.status).toBe(503);
        expect(getVisibleStateForUserMock).not.toHaveBeenCalled();
    });
});

describe("PUT /api/state", () => {
    it("returns 401 with no session", async () => {
        getCurrentUserMock.mockResolvedValue(null);

        const res = await PUT(putRequest({ lists: [], history: {} }));
        expect(res.status).toBe(401);
        expect(saveUserStateMock).not.toHaveBeenCalled();
    });

    it("2.6 returns 400 when payload has more than 100 lists", async () => {
        getCurrentUserMock.mockResolvedValue(FAKE_USER);

        const tooMany = Array.from({ length: 101 }, (_, i) => ({
            id: `L${i}`,
            title: `${i}`,
            plannedDate: "2026-05-16",
            items: [],
        }));

        const res = await PUT(putRequest({ lists: tooMany, history: {} }));
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toMatch(/list limit/i);

        expect(saveUserStateMock).not.toHaveBeenCalled();
    });

    it("returns 200 and calls saveUserState for a valid payload", async () => {
        getCurrentUserMock.mockResolvedValue(FAKE_USER);
        saveUserStateMock.mockResolvedValue(undefined);

        const res = await PUT(
            putRequest({
                lists: [{ id: "L1", title: "Groceries", plannedDate: "2026-05-16", items: [] }],
                history: {},
            })
        );
        expect(res.status).toBe(200);
        expect(saveUserStateMock).toHaveBeenCalledWith(
            FAKE_USER.id,
            expect.arrayContaining([expect.objectContaining({ id: "L1" })]),
            {}
        );
    });

    it("returns 400 (not 500) for empty body", async () => {
        getCurrentUserMock.mockResolvedValue(FAKE_USER);

        const res = await PUT(putRequest(""));
        expect(res.status).toBe(400);
        expect(saveUserStateMock).not.toHaveBeenCalled();
    });

    it("returns 400 when saveUserState throws a 'limit exceeded' error from the data layer", async () => {
        getCurrentUserMock.mockResolvedValue(FAKE_USER);
        saveUserStateMock.mockRejectedValue(new Error("Item limit exceeded (500)."));

        const res = await PUT(
            putRequest({
                lists: [{ id: "L1", title: "L", plannedDate: "2026-05-16", items: [] }],
                history: {},
            })
        );
        expect(res.status).toBe(400);
    });

    it("returns 500 on unexpected save errors", async () => {
        getCurrentUserMock.mockResolvedValue(FAKE_USER);
        saveUserStateMock.mockRejectedValue(new Error("Database connection lost"));

        const res = await PUT(
            putRequest({
                lists: [{ id: "L1", title: "L", plannedDate: "2026-05-16", items: [] }],
                history: {},
            })
        );
        expect(res.status).toBe(500);
    });
});
