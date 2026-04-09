import crypto from "node:crypto";
import { cookies } from "next/headers";
import { getUserById, type StoredUser } from "./data";

const COOKIE_NAME = "shopping_session";
const SESSION_SECRET = process.env.SESSION_SECRET || "dev-shopping-session-secret-change-me";
const COOKIE_MAX_AGE_SECONDS = Number(process.env.SESSION_MAX_AGE_SECONDS || 60 * 60 * 12);

if (process.env.NODE_ENV === "production" && SESSION_SECRET === "dev-shopping-session-secret-change-me") {
  throw new Error("SESSION_SECRET must be configured in production.");
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("base64url");
}

function createToken(userId: string): string {
  const payloadObj = {
    userId,
    exp: Date.now() + COOKIE_MAX_AGE_SECONDS * 1000,
  };
  const payload = Buffer.from(JSON.stringify(payloadObj)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function verifyToken(token: string): { userId: string; exp: number } | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) {
    return null;
  }
  const expectedSig = sign(payload);
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      userId: string;
      exp: number;
    };
    if (!parsed.userId || !parsed.exp || parsed.exp < Date.now()) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function hashPassword(password: string): Promise<{ passwordHash: string; passwordSalt: string }> {
  const passwordSalt = crypto.randomBytes(16).toString("hex");
  const passwordHash = await new Promise<string>((resolve, reject) => {
    crypto.scrypt(password, passwordSalt, 64, (err, derivedKey) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(derivedKey.toString("hex"));
    });
  });
  return { passwordHash, passwordSalt };
}

export async function verifyPassword(user: StoredUser, password: string): Promise<boolean> {
  const candidateHash = await new Promise<string>((resolve, reject) => {
    crypto.scrypt(password, user.passwordSalt, 64, (err, derivedKey) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(derivedKey.toString("hex"));
    });
  });
  return crypto.timingSafeEqual(Buffer.from(candidateHash), Buffer.from(user.passwordHash));
}

export async function setSessionCookie(userId: string) {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, createToken(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) {
    return null;
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return null;
  }

  const user = await getUserById(decoded.userId);
  if (!user) {
    return null;
  }
  return user;
}
