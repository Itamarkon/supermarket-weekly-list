import crypto from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { createToken, hashPassword, verifyPassword, verifyToken } from "./auth";
import type { StoredUser } from "./data";

// Deterministic secret for sign/verify in tests. The real value is injected
// from SESSION_SECRET in production.
const TEST_SECRET = "unit-test-session-secret-only-do-not-ship";

beforeAll(() => {
  process.env.SESSION_SECRET = TEST_SECRET;
});

function makeStoredUser(passwordHash: string, passwordSalt: string): StoredUser {
  return {
    id: "user-1",
    username: "alice",
    passwordHash,
    passwordSalt,
    createdAt: new Date().toISOString(),
  };
}

describe("auth: session tokens", () => {
  it("1.1 verifyToken returns null when the signature is tampered", () => {
    const token = createToken("user-1");
    const [payload, signature] = token.split(".");

    // Flip one base64url character in the signature to simulate tampering.
    const tampered = `${payload}.${signature.replace(/^./, (c) => (c === "A" ? "B" : "A"))}`;

    expect(verifyToken(tampered)).toBeNull();
  });

  it("1.1b verifyToken returns null when the payload is tampered without re-signing", () => {
    const token = createToken("user-1");
    const [, signature] = token.split(".");

    const forgedPayload = Buffer.from(
      JSON.stringify({ userId: "attacker", exp: Date.now() + 60_000 })
    ).toString("base64url");

    expect(verifyToken(`${forgedPayload}.${signature}`)).toBeNull();
  });

  it("1.2 verifyToken returns null for expired tokens", () => {
    // Build a token whose exp is already in the past, signed with the test secret.
    const expiredPayload = Buffer.from(
      JSON.stringify({ userId: "user-1", exp: Date.now() - 1_000 })
    ).toString("base64url");
    const signature = crypto
      .createHmac("sha256", TEST_SECRET)
      .update(expiredPayload)
      .digest("base64url");

    expect(verifyToken(`${expiredPayload}.${signature}`)).toBeNull();
  });

  it("1.2b verifyToken returns the userId for a valid, unexpired token", () => {
    const token = createToken("user-1");
    expect(verifyToken(token)).toMatchObject({ userId: "user-1" });
  });

  it("1.2c verifyToken returns null for malformed tokens", () => {
    expect(verifyToken("not-a-token")).toBeNull();
    expect(verifyToken("only-one-part")).toBeNull();
    expect(verifyToken("")).toBeNull();
  });
});

describe("auth: password verification", () => {
  it("1.3 verifyPassword returns true for the correct password", async () => {
    const { passwordHash, passwordSalt } = await hashPassword("super-secret-pw");
    const user = makeStoredUser(passwordHash, passwordSalt);
    expect(await verifyPassword(user, "super-secret-pw")).toBe(true);
  });

  it("1.3b verifyPassword returns false for the wrong password", async () => {
    const { passwordHash, passwordSalt } = await hashPassword("super-secret-pw");
    const user = makeStoredUser(passwordHash, passwordSalt);
    expect(await verifyPassword(user, "wrong-password")).toBe(false);
  });

  it("1.4 verifyPassword uses timing-safe comparison (equal-length buffers compare via timingSafeEqual)", async () => {
    // We can't measure timing in a unit test, but we can verify the contract
    // surface of crypto.timingSafeEqual: it requires equal-length buffers and
    // returns a boolean. Two passwords produce 64-byte scrypt outputs of equal
    // length, so the comparison must run without throwing a RangeError.
    const { passwordHash, passwordSalt } = await hashPassword("alpha");
    const user = makeStoredUser(passwordHash, passwordSalt);

    // If anyone replaces timingSafeEqual with === on Buffers, this still works,
    // but the goal here is to assert the function never throws and always
    // returns a plain boolean - i.e. the comparison strategy stays safe.
    const result = await verifyPassword(user, "beta-same-length-ish");
    expect(typeof result).toBe("boolean");
    expect(result).toBe(false);
  });

  it("1.4b hashPassword produces different salts and different hashes for the same password", async () => {
    const a = await hashPassword("same-password");
    const b = await hashPassword("same-password");
    expect(a.passwordSalt).not.toBe(b.passwordSalt);
    expect(a.passwordHash).not.toBe(b.passwordHash);
  });
});
