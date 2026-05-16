import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    findCall,
    makeSupabaseMock,
    type ChainCall,
    type Response,
} from "@/app/lib/server/__test__/supabase-mock";

// --- Hoisted mocks ---------------------------------------------------------
const { getCurrentUserMock, sendMailMock, getSupabaseAdminMock } = vi.hoisted(() => ({
    getCurrentUserMock: vi.fn(),
    sendMailMock: vi.fn(),
    getSupabaseAdminMock: vi.fn(),
}));

vi.mock("@/app/lib/server/auth", () => ({
    getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/app/lib/server/email", () => ({
    sendMail: sendMailMock,
}));

vi.mock("@/app/lib/server/supabase", () => ({
    isSupabaseConfigured: () => true,
    getSupabaseAdmin: getSupabaseAdminMock,
}));

import { POST } from "./route";

// --- Helpers ---------------------------------------------------------------
function jsonRequest(body: unknown): Request {
    return new Request("http://localhost/api/email/out-of-stock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
}

type ResponseFn = (call: ChainCall) => Response;

function installSupabase(responseProvider: ResponseFn = () => ({ data: [], error: null })) {
    const { admin, calls } = makeSupabaseMock(responseProvider);
    getSupabaseAdminMock.mockReturnValue(admin);
    return { admin, calls };
}

const FAKE_USER = {
    id: "user-1",
    username: "alice",
    passwordHash: "x",
    passwordSalt: "y",
    createdAt: new Date().toISOString(),
};

beforeEach(() => {
    getCurrentUserMock.mockReset();
    sendMailMock.mockReset();
    getSupabaseAdminMock.mockReset();
    sendMailMock.mockResolvedValue({ id: "mocked", skipped: false });
});

// --- Tests -----------------------------------------------------------------
describe("POST /api/email/out-of-stock", () => {
    it("returns 401 when no session cookie is present", async () => {
        getCurrentUserMock.mockResolvedValue(null);
        installSupabase();

        const res = await POST(jsonRequest({ listId: "L1", items: [] }));
        expect(res.status).toBe(401);
        expect(sendMailMock).not.toHaveBeenCalled();
    });

    it("1.9 returns 200 + {empty: true} when no items are out_of_stock (and sends no email)", async () => {
        getCurrentUserMock.mockResolvedValue(FAKE_USER);
        installSupabase(() => ({ data: [], error: null })); // rate-limit query returns no recent send

        const res = await POST(
            jsonRequest({
                listId: "L1",
                listTitle: "Groceries",
                items: [
                    { name: "Milk", quantity: 1, status: "bought" },
                    { name: "Bread", quantity: 2, status: "pending" },
                ],
            })
        );

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body).toEqual({ ok: true, empty: true });
        expect(sendMailMock).not.toHaveBeenCalled();
    });

    it("1.10 returns 429 rate_limit when the user already sent within the window", async () => {
        getCurrentUserMock.mockResolvedValue(FAKE_USER);

        // Make the rate-limit query return a recent send.
        installSupabase((call) => {
            if (call.table === "oos_email_sends" && call.ops.some((o) => o.method === "select")) {
                return { data: [{ id: 1 }], error: null };
            }
            return { data: null, error: null };
        });

        const res = await POST(
            jsonRequest({
                listId: "L1",
                items: [{ name: "Milk", quantity: 1, status: "out_of_stock" }],
            })
        );

        expect(res.status).toBe(429);
        const body = await res.json();
        expect(body.error).toBe("rate_limit");
        expect(sendMailMock).not.toHaveBeenCalled();
    });

    it("1.11 only includes items whose status === 'out_of_stock' in the email", async () => {
        getCurrentUserMock.mockResolvedValue(FAKE_USER);
        installSupabase();

        await POST(
            jsonRequest({
                listId: "L1",
                listTitle: "Groceries",
                items: [
                    { name: "Milk", quantity: 1, status: "bought" },
                    { name: "Eggs", quantity: 12, status: "out_of_stock" },
                    { name: "Bread", quantity: 2, status: "pending" },
                    { name: "Yogurt", quantity: 4, status: "out_of_stock" },
                ],
            })
        );

        expect(sendMailMock).toHaveBeenCalledTimes(1);
        const message = sendMailMock.mock.calls[0]![0] as { subject: string; text: string; html: string };

        // Only OOS items appear.
        expect(message.text).toContain("Eggs");
        expect(message.text).toContain("Yogurt");
        expect(message.text).not.toContain("Milk");
        expect(message.text).not.toContain("Bread");

        // Quantities are reflected.
        expect(message.text).toContain("12x Eggs");
        expect(message.text).toContain("4x Yogurt");
    });

    it("1.12 HTML-escapes user-controlled item names (no raw <script> in output)", async () => {
        getCurrentUserMock.mockResolvedValue(FAKE_USER);
        installSupabase();

        const xssName = '<script>alert("xss")</script>';
        await POST(
            jsonRequest({
                listId: "L1",
                listTitle: "Groceries",
                items: [{ name: xssName, quantity: 1, status: "out_of_stock" }],
            })
        );

        expect(sendMailMock).toHaveBeenCalledTimes(1);
        const message = sendMailMock.mock.calls[0]![0] as { html?: string };
        expect(message.html, "html body must be present").toBeDefined();

        // The raw tag must NOT appear in the rendered HTML.
        expect(message.html!).not.toContain("<script>");
        // The escaped form must appear instead.
        expect(message.html!).toContain("&lt;script&gt;");
        expect(message.html!).toContain("&quot;"); // quote inside alert("xss") got escaped
    });

    it("1.12b also escapes the list title to prevent HTML injection via list name", async () => {
        getCurrentUserMock.mockResolvedValue(FAKE_USER);
        installSupabase();

        await POST(
            jsonRequest({
                listId: "L1",
                listTitle: '<img src=x onerror="alert(1)">',
                items: [{ name: "Milk", quantity: 1, status: "out_of_stock" }],
            })
        );

        const message = sendMailMock.mock.calls[0]![0] as { html: string };
        expect(message.html).not.toContain('<img src=x');
        expect(message.html).toContain("&lt;img src=x onerror=");
    });

    it("records the send in oos_email_sends after a successful email", async () => {
        getCurrentUserMock.mockResolvedValue(FAKE_USER);
        const { calls } = installSupabase();

        await POST(
            jsonRequest({
                listId: "L1",
                items: [{ name: "Milk", quantity: 1, status: "out_of_stock" }],
            })
        );

        const insertCall = findCall(calls, "oos_email_sends", (ops) =>
            ops.some((o) => o.method === "insert")
        );
        expect(insertCall, "must insert a row into oos_email_sends to enforce the rate limit").toBeDefined();
    });

    it("returns 400 when listId is missing", async () => {
        getCurrentUserMock.mockResolvedValue(FAKE_USER);
        installSupabase();

        const res = await POST(jsonRequest({ items: [] }));
        expect(res.status).toBe(400);
    });

    it("returns 500 when sendMail throws (and does NOT record the send)", async () => {
        getCurrentUserMock.mockResolvedValue(FAKE_USER);
        sendMailMock.mockRejectedValue(new Error("Resend API down"));
        const { calls } = installSupabase();

        const res = await POST(
            jsonRequest({
                listId: "L1",
                items: [{ name: "Milk", quantity: 1, status: "out_of_stock" }],
            })
        );
        expect(res.status).toBe(500);

        const insertCall = findCall(calls, "oos_email_sends", (ops) =>
            ops.some((o) => o.method === "insert")
        );
        expect(insertCall, "must NOT record the send when sending failed").toBeUndefined();
    });
});
