import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import type { Request, Response } from "express";
import {
  createSession,
  deleteEmailToken,
  deleteExpiredEmailTokens,
  deleteSession,
  findUserByEmail,
  findUserByEmailToken,
  findUserBySession,
  findUserByUsername,
  getVerifySentAt,
  insertUser,
  markEmailVerified,
  replaceEmailToken,
  touchVerifySent,
  type DbUser,
} from "./db.ts";
import { IS_PROD } from "./env.ts";
import { sendVerificationEmail } from "./mail.ts";

export const COOKIE = "aux_sid";
const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TOKEN_TTL_MS = 1000 * 60 * 60 * 24;
const RESEND_COOLDOWN_MS = 60_000;

export class AuthError extends Error {
  code: string;
  email?: string;
  constructor(message: string, code = "auth", email?: string) {
    super(message);
    this.code = code;
    this.email = email;
  }
}

export const cookieOptions = {
  httpOnly: true,
  sameSite: (process.env.COOKIE_SAMESITE === "none" ? "none" : "lax") as "lax" | "none",
  secure: IS_PROD || process.env.COOKIE_SAMESITE === "none",
  maxAge: 1000 * 60 * 60 * 24 * 30,
  path: "/",
};

export function userPublic(user: DbUser) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    emailVerified: Boolean(user.email_verified),
  };
}

export function sessionFromRequest(req: Request): string | undefined {
  const raw = req.cookies?.[COOKIE];
  return typeof raw === "string" && raw.length > 0 ? raw : undefined;
}

export async function getAuthedUserFromSid(sid?: string): Promise<DbUser | undefined> {
  if (!sid) return undefined;
  const user = await findUserBySession(sid);
  if (!user?.email_verified) return undefined;
  return user;
}

export async function getAuthedUser(req: Request): Promise<DbUser | undefined> {
  return getAuthedUserFromSid(sessionFromRequest(req));
}

function hashToken(raw: string) {
  return createHash("sha256").update(raw).digest("hex");
}

async function issueToken(userId: string) {
  await deleteExpiredEmailTokens();
  const raw = randomBytes(32).toString("hex");
  await replaceEmailToken(userId, hashToken(raw), Date.now() + TOKEN_TTL_MS);
  return raw;
}

async function sendChallenge(user: DbUser) {
  if (!user.email) throw new AuthError("This account has no email.");
  const last = await getVerifySentAt(user.id);
  if (last && Date.now() - last < RESEND_COOLDOWN_MS) {
    throw new AuthError("Wait a minute before requesting another email.", "cooldown");
  }
  const raw = await issueToken(user.id);
  await sendVerificationEmail(user.email, raw);
  await touchVerifySent(user.id);
}

export async function registerUser(username: string, email: string, password: string) {
  const name = username.trim();
  const mail = email.trim().toLowerCase();
  if (!USERNAME_RE.test(name)) {
    throw new AuthError("Username must be 3–20 letters, numbers, or underscores.");
  }
  if (!EMAIL_RE.test(mail)) {
    throw new AuthError("Enter a valid email.");
  }
  if (password.length < 8) {
    throw new AuthError("Password must be at least 8 characters.");
  }

  const byEmail = await findUserByEmail(mail);
  if (byEmail?.email_verified) {
    throw new AuthError("That email is already in use.");
  }
  const byName = await findUserByUsername(name);
  if (byName && byName.id !== byEmail?.id) {
    throw new AuthError("That username is taken.");
  }

  let user = byEmail;
  if (!user) {
    user = {
      id: crypto.randomUUID(),
      username: name,
      email: mail,
      email_verified: 0,
      password_hash: await bcrypt.hash(password, 10),
    };
    await insertUser(user);
  }

  await sendChallenge(user);
  return { email: mail };
}

export async function resendVerification(email: string) {
  const mail = email.trim().toLowerCase();
  const user = await findUserByEmail(mail);
  if (!user || user.email_verified) return;
  await sendChallenge(user);
}

export async function verifyEmailToken(rawToken: string) {
  const token = rawToken.trim();
  if (!token) throw new AuthError("Missing verification link.");
  const hashed = hashToken(token);
  const user = await findUserByEmailToken(hashed);
  if (!user) throw new AuthError("That link is invalid or expired.");
  await markEmailVerified(user.id);
  await deleteEmailToken(hashed);
  const sid = await createSession(user.id);
  return { user: { ...user, email_verified: 1 }, sid };
}

export async function loginUser(username: string, password: string) {
  const user = await findUserByUsername(username.trim());
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    throw new AuthError("Wrong username or password.");
  }
  if (!user.email_verified) {
    throw new AuthError(
      "Verify your email before logging in. Check your inbox for the Aux Party link.",
      "unverified",
      user.email || undefined,
    );
  }
  const sid = await createSession(user.id);
  return { user, sid };
}

export function setSessionCookie(res: Response, sid: string) {
  res.cookie(COOKIE, sid, cookieOptions);
}

export async function clearSessionCookie(res: Response, sid?: string) {
  if (sid) await deleteSession(sid);
  res.clearCookie(COOKIE, { path: "/" });
}
