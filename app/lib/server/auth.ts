import crypto from "node:crypto";
import { cookies } from "next/headers";
import { getUserById, type StoredUser } from "./data";

const COOKIE_NAME = "shopping_session";
const DEV_SESSION_FALLBACK = "dev-shopping-session-secret-change-me";
const COOKIE_MAX_AGE_SECONDS = Number(process.env.SESSION_MAX_AGE_SECONDS || 60 * 60 * 12);

// Defer secret checks to signing time so importing this module does not crash Preview when
// SESSION_SECRET is unset (Vercel Preview is still NODE_ENV=production).
function resolveSessionSecret(context: "issue" | "verify"): string {
  const fromEnv = process.env.SESSION_SECRET?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  const isProdRuntime = process.env.NODE_ENV === "production";
  const isVercelPreview = process.env.VERCEL_ENV === "preview";
  if (context === "issue" && isProdRuntime && !isVercelPreview) {
    throw new Error("SESSION_SECRET must be configured in production.");
  }
  return DEV_SESSION_FALLBACK;
}

function sign(payload: string, context: "issue" | "verify"): string {
  const secret = resolveSessionSecret(context);
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

function createToken(userId: string): string {
  const payloadObj = {
    userId,
    exp: Date.now() + COOKIE_MAX_AGE_SECONDS * 1000,
  };
  const payload = Buffer.from(JSON.stringify(payloadObj)).toString("base64url");
  return `${payload}.${sign(payload, "issue")}`;
}

function verifyToken(token: string): { userId: string; exp: number } | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) {
    return null;
  }
  const expectedSig = sign(payload, "verify");
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
