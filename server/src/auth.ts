import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import type { Request, Response } from "express";
import {
  createPasswordChallenge,
  createSession,
  deleteEmailToken,
  deleteExpiredEmailTokens,
  deletePasswordReset,
  deleteSession,
  findUserByEmail,
  findUserByEmailToken,
  findUserById,
  findUserByPasswordReset,
  findUserBySession,
  findUserByUsername,
  getVerifySentAt,
  insertUser,
  markEmailVerified,
  replaceEmailToken,
  replacePasswordReset,
  takePasswordChallenge,
  touchVerifySent,
  updatePasswordHash,
  updateProfile,
  uploadAvatarFile,
  type DbUser,
} from "./db.ts";
import { IS_PROD, SUPABASE_URL } from "./env.ts";
import { sendPasswordCodeEmail, sendPasswordResetEmail, sendVerificationEmail } from "./mail.ts";

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

export function publicAvatarUrl(path: string | null | undefined) {
  if (!path) return null;
  return `${SUPABASE_URL}/storage/v1/object/public/avatars/${path}`;
}

export function userPublic(user: DbUser) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    emailVerified: Boolean(user.email_verified),
    aboutMe: user.about_me || "",
    avatarUrl: publicAvatarUrl(user.avatar_path),
  };
}

export function sessionFromRequest(req: Request): string | undefined {
  const raw = req.cookies?.[COOKIE];
  return typeof raw === "string" && raw.length > 0 ? raw : undefined;
}

export async function getAuthedUserFromSid(sid?: string): Promise<DbUser | undefined> {
  if (!sid) return undefined;
  try {
    const user = await findUserBySession(sid);
    if (!user?.email_verified) return undefined;
    return user;
  } catch {
    return undefined;
  }
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
      about_me: null,
      avatar_path: null,
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
  return { user: { ...user, email_verified: 1 } };
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

const RESET_TTL_MS = 1000 * 60 * 60;
const CODE_TTL_MS = 1000 * 60 * 10;

export async function requestPasswordReset(email: string) {
  const mail = email.trim().toLowerCase();
  if (!EMAIL_RE.test(mail)) throw new AuthError("Enter a valid email.");
  const user = await findUserByEmail(mail);
  if (!user?.email_verified || !user.email) return;
  const last = await getVerifySentAt(user.id);
  if (last && Date.now() - last < RESEND_COOLDOWN_MS) return;
  const raw = randomBytes(32).toString("hex");
  await replacePasswordReset(user.id, hashToken(raw), Date.now() + RESET_TTL_MS);
  await sendPasswordResetEmail(user.email, raw);
  await touchVerifySent(user.id);
}

export async function completePasswordReset(rawToken: string, password: string) {
  if (password.length < 8) throw new AuthError("Password must be at least 8 characters.");
  const hashed = hashToken(rawToken.trim());
  const user = await findUserByPasswordReset(hashed);
  if (!user) throw new AuthError("That reset link is invalid or expired.");
  await updatePasswordHash(user.id, await bcrypt.hash(password, 10));
  await deletePasswordReset(hashed);
}

export async function saveProfile(userId: string, aboutMe: string) {
  const text = aboutMe.trim().slice(0, 280);
  const user = await updateProfile(userId, { about_me: text });
  if (!user) throw new AuthError("Could not save that profile.");
  return user;
}

export async function saveAvatar(userId: string, imageBase64: string, mime: string) {
  const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  if (!allowed.includes(mime)) throw new AuthError("Use a JPG, PNG, WEBP, or GIF.");
  const raw = imageBase64.replace(/^data:[^;]+;base64,/, "");
  const bytes = Buffer.from(raw, "base64");
  if (bytes.length < 32) throw new AuthError("That photo looks empty.");
  if (bytes.length > 2 * 1024 * 1024) throw new AuthError("Keep photos under 2MB.");
  const path = await uploadAvatarFile(userId, bytes, mime);
  const user = await updateProfile(userId, { avatar_path: path });
  if (!user) throw new AuthError("Could not save that photo.");
  return user;
}

export async function startPasswordChange(userId: string, oldPassword: string, newPassword: string) {
  if (newPassword.length < 8) throw new AuthError("Password must be at least 8 characters.");
  const user = await findUserById(userId);
  if (!user || !(await bcrypt.compare(oldPassword, user.password_hash))) {
    throw new AuthError("Current password is wrong.");
  }
  if (!user.email) throw new AuthError("This account has no email.");
  const last = await getVerifySentAt(user.id);
  if (last && Date.now() - last < RESEND_COOLDOWN_MS) {
    throw new AuthError("Wait a minute before requesting another email.", "cooldown");
  }
  const code = String(100000 + Math.floor(Math.random() * 900000));
  const challengeId = await createPasswordChallenge(
    user.id,
    hashToken(code),
    await bcrypt.hash(newPassword, 10),
    Date.now() + CODE_TTL_MS,
  );
  await sendPasswordCodeEmail(user.email, code);
  await touchVerifySent(user.id);
  return { challengeId };
}

export async function confirmPasswordChange(userId: string, challengeId: string, code: string) {
  const digits = code.replace(/\D/g, "");
  if (digits.length !== 6) throw new AuthError("Enter the 6-digit code from your email.");
  const row = await takePasswordChallenge(challengeId.trim(), userId, hashToken(digits));
  if (!row) throw new AuthError("That code is wrong or expired.");
  await updatePasswordHash(row.userId, row.newPasswordHash);
}
