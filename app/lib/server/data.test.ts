import { beforeEach, describe, expect, it, vi } from "vitest";
import { findCall, makeSupabaseMock, type ChainCall, type Response } from "./__test__/supabase-mock";

// Hoisted so the vi.mock factory below can reference it.
const { getSupabaseAdminMock } = vi.hoisted(() => ({
    getSupabaseAdminMock: vi.fn(),
}));

vi.mock("./supabase", () => ({
    isSupabaseConfigured: () => true,
    getSupabaseAdmin: getSupabaseAdminMock,
}));

import { saveUserState } from "./data";

type ResponseFn = (call: ChainCall) => Response;

function installMock(responseProvider: ResponseFn) {
    const { admin, calls } = makeSupabaseMock(responseProvider);
    getSupabaseAdminMock.mockReturnValue(admin);
    return { admin, calls };
}

beforeEach(() => {
    getSupabaseAdminMock.mockReset();
});

describe("saveUserState: data ownership", () => {
    it("1.7 deletes only the user's own lists that were dropped, and scopes the delete to owner_id", async () => {
        const userId = "userA";

        // Pretend userA owns lists L1 and L2 in the database.
        const { calls } = installMock((call) => {
            // The first call queries owned list ids before the upserts.
            if (
                call.table === "shopping_lists" &&
                call.ops.some((op) => op.method === "select") &&
                !call.ops.some((op) => op.method === "delete")
            ) {
                return { data: [{ id: "L1" }, { id: "L2" }], error: null };
            }
            return { data: null, error: null };
        });

        // userA submits only L1 (i.e., they're removing L2).
        await saveUserState(
            userId,
            [{ id: "L1", title: "Groceries", plannedDate: "2026-05-16", items: [] }],
            {}
        );

        // Locate the delete-from-shopping_lists chain.
        const deleteListsCall = findCall(calls, "shopping_lists", (ops) =>
            ops.some((op) => op.method === "delete")
        );
        expect(deleteListsCall).toBeDefined();

        // CRITICAL: the delete must be scoped to .eq("owner_id", userId).
        // If this scope is ever dropped, a user could nuke other users' shared lists.
        const ownerScope = deleteListsCall!.ops.find(
            (op) => op.method === "eq" && op.args[0] === "owner_id"
        );
        expect(ownerScope, "delete must be scoped to owner_id").toBeDefined();
        expect(ownerScope!.args[1]).toBe(userId);

        // The delete targets only L2 (the dropped list), not L1.
        const idFilter = deleteListsCall!.ops.find(
            (op) => op.method === "in" && op.args[0] === "id"
        );
        expect(idFilter).toBeDefined();
        expect(idFilter!.args[1]).toEqual(["L2"]);
    });

    it("1.7b does NOT issue a list-delete when the user keeps all their owned lists", async () => {
        const userId = "userA";

        const { calls } = installMock((call) => {
            if (
                call.table === "shopping_lists" &&
                call.ops.some((op) => op.method === "select") &&
                !call.ops.some((op) => op.method === "delete")
            ) {
                return { data: [{ id: "L1" }], error: null };
            }
            return { data: null, error: null };
        });

        await saveUserState(
            userId,
            [{ id: "L1", title: "Groceries", plannedDate: "2026-05-16", items: [] }],
            {}
        );

        const deleteListsCall = findCall(calls, "shopping_lists", (ops) =>
            ops.some((op) => op.method === "delete")
        );
        expect(deleteListsCall, "no list delete expected when nothing was dropped").toBeUndefined();
    });
});

describe("saveUserState: limit enforcement", () => {
    it("1.8 throws when more than 100 lists are submitted", async () => {
        installMock(() => ({ data: [], error: null }));

        const tooMany = Array.from({ length: 101 }, (_, i) => ({
            id: `L${i}`,
            title: `List ${i}`,
            plannedDate: "2026-05-16",
            items: [],
        }));

        await expect(saveUserState("userA", tooMany, {})).rejects.toThrow(/List limit/);
    });

    it("1.8b throws when a single list has more than 500 items", async () => {
        installMock((call) => {
            if (
                call.table === "shopping_lists" &&
                call.ops.some((op) => op.method === "select") &&
                !call.ops.some((op) => op.method === "delete")
            ) {
                return { data: [{ id: "L1" }], error: null };
            }
            return { data: null, error: null };
        });

        const tooManyItems = Array.from({ length: 501 }, (_, i) => ({
            id: `I${i}`,
            name: `item-${i}`,
            quantity: 1,
            notes: "",
            category: "Other",
            status: "pending" as const,
        }));

        await expect(
            saveUserState(
                "userA",
                [{ id: "L1", title: "Big list", plannedDate: "2026-05-16", items: tooManyItems }],
                {}
            )
        ).rejects.toThrow(/Item limit/);
    });
});
