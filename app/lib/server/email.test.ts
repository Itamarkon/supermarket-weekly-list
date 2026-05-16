import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `server-only` is a Next.js shim that throws if imported from the browser.
// In a Node test runner it isn't resolvable, so stub it to a no-op module.
vi.mock("server-only", () => ({}));

import { sendMail } from "./email";

beforeEach(() => {
    // Reset env between tests. vi.stubEnv is auto-cleaned by vi.unstubAllEnvs.
    vi.stubEnv("EMAIL_PROVIDER", "resend");
    vi.stubEnv("RESEND_API_KEY", "test-key");
    vi.stubEnv("EMAIL_FROM", "Sender <noreply@example.com>");
    vi.stubEnv("EMAIL_TO", "recipient@example.com");
    vi.stubEnv("EMAIL_REPLY_TO", "reply@example.com");
    vi.stubEnv("EMAIL_DRY_RUN", "false");
});

afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
});

describe("sendMail: dry-run safety", () => {
    it("2.7 does NOT call fetch when EMAIL_DRY_RUN=true", async () => {
        vi.stubEnv("EMAIL_DRY_RUN", "true");
        const fetchSpy = vi.spyOn(global, "fetch");

        const result = await sendMail({ subject: "S", text: "T" });

        expect(fetchSpy).not.toHaveBeenCalled();
        expect(result.skipped).toBe(true);
        expect(result.id).toBe("dry-run");
    });

    it("2.7b case-insensitive matching of EMAIL_DRY_RUN ('TRUE', 'True' all count as on)", async () => {
        vi.stubEnv("EMAIL_DRY_RUN", "TRUE");
        const fetchSpy = vi.spyOn(global, "fetch");

        await sendMail({ subject: "S", text: "T" });
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("calls fetch with the right Resend payload when not in dry-run mode", async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            new Response(JSON.stringify({ id: "resend-abc" }), { status: 200 })
        );
        vi.stubGlobal("fetch", fetchMock);

        const result = await sendMail({
            subject: "Hello",
            text: "world",
            html: "<p>world</p>",
        });

        expect(result.id).toBe("resend-abc");
        expect(result.skipped).toBeUndefined();
        expect(fetchMock).toHaveBeenCalledTimes(1);

        const [url, init] = fetchMock.mock.calls[0]!;
        expect(url).toBe("https://api.resend.com/emails");
        expect(init.method).toBe("POST");
        expect(init.headers.Authorization).toBe("Bearer test-key");
        const body = JSON.parse(init.body);
        expect(body).toMatchObject({
            from: "Sender <noreply@example.com>",
            to: ["recipient@example.com"],
            subject: "Hello",
            text: "world",
            html: "<p>world</p>",
            reply_to: "reply@example.com",
        });
    });

    it("parses multiple recipients in EMAIL_TO (comma-separated)", async () => {
        vi.stubEnv("EMAIL_TO", "a@example.com, b@example.com ,c@example.com");
        const fetchMock = vi.fn().mockResolvedValue(
            new Response(JSON.stringify({ id: "x" }), { status: 200 })
        );
        vi.stubGlobal("fetch", fetchMock);

        await sendMail({ subject: "S", text: "T" });
        const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
        expect(body.to).toEqual(["a@example.com", "b@example.com", "c@example.com"]);
    });
});

describe("sendMail: misconfiguration surfaces as clear errors", () => {
    it("2.8 throws when EMAIL_FROM is missing", async () => {
        vi.stubEnv("EMAIL_FROM", "");
        await expect(sendMail({ subject: "S", text: "T" })).rejects.toThrow(
            /EMAIL_FROM is not configured/
        );
    });

    it("2.8b throws when EMAIL_TO is missing", async () => {
        vi.stubEnv("EMAIL_TO", "");
        await expect(sendMail({ subject: "S", text: "T" })).rejects.toThrow(
            /EMAIL_TO is not configured/
        );
    });

    it("2.8c throws when EMAIL_TO has only whitespace/commas", async () => {
        vi.stubEnv("EMAIL_TO", " , , ");
        await expect(sendMail({ subject: "S", text: "T" })).rejects.toThrow(
            /EMAIL_TO is not configured/
        );
    });

    it("throws when RESEND_API_KEY is missing (and not in dry-run)", async () => {
        vi.stubEnv("RESEND_API_KEY", "");
        await expect(sendMail({ subject: "S", text: "T" })).rejects.toThrow(
            /RESEND_API_KEY is not configured/
        );
    });

    it("throws when EMAIL_PROVIDER is unsupported", async () => {
        vi.stubEnv("EMAIL_PROVIDER", "sendgrid");
        await expect(sendMail({ subject: "S", text: "T" })).rejects.toThrow(
            /Unsupported EMAIL_PROVIDER: sendgrid/
        );
    });
});

describe("sendMail: provider errors", () => {
    it("throws with status and body when the Resend API returns a non-2xx response", async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            new Response('{"error":"bad_key"}', { status: 401, statusText: "Unauthorized" })
        );
        vi.stubGlobal("fetch", fetchMock);

        await expect(sendMail({ subject: "S", text: "T" })).rejects.toThrow(
            /Resend send failed \(401\).*bad_key/
        );
    });
});
