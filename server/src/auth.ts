import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import type { Request, Response } from "express";
import {
  clearLoginLock,
  createPasswordChallenge,
  createSession,
  deleteAccount,
  deleteEmailToken,
  deleteExpiredEmailTokens,
  deletePasswordChallengesForUser,
  deletePasswordReset,
  deleteSession,
  deleteSessionsForUser,
  findUserByEmail,
  findUserByEmailToken,
  findUserById,
  findUserByPasswordReset,
  findUserBySession,
  findUserByUsername,
  getLoginLock,
  getVerifySentAt,
  insertUser,
  logSecurityEvent,
  markEmailVerified,
  recordFailedLogin,
  replaceEmailToken,
  replacePasswordReset,
  takePasswordChallenge,
  touchVerifySent,
  updatePasswordHash,
  updateProfile,
  uploadAvatarFile,
  grantAchievement,
  type DbUser,
} from "./db.ts";
import { IS_PROD, PLAY_TOKEN_SECRET, SUPABASE_URL } from "./env.ts";
import {
  sendAccountLockedEmail,
  sendPasswordCodeEmail,
  sendPasswordResetEmail,
  sendVerificationEmail,
} from "./mail.ts";
import * as credentialsNs from "../../shared/credentials.ts";
import { assertUuid, sanitizeText, sniffImageMime } from "./security.ts";
import { sharedModule } from "./shared-import.ts";

const { passwordIssues, usernameIssues } = sharedModule(credentialsNs);

export const COOKIE = "aux_sid";
export const CSRF_COOKIE = "aux_csrf";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TOKEN_TTL_MS = 1000 * 60 * 60 * 24;
const RESET_TTL_MS = 1000 * 60 * 60;
const CODE_TTL_MS = 1000 * 60 * 10;
const RESEND_COOLDOWN_MS = 60_000;
const FAIL_LIMIT = 8;
const LOCK_MS = 30 * 60_000;
const DUMMY_PASSWORD_HASH = bcrypt.hashSync("aux-party-timing-dummy", 10);
const LOCKED_MESSAGE =
  "This account is locked after too many failed sign-ins. Check your email for a link to set a new password.";

export type AuthAudit = { ip?: string };

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

export const cookieClearOptions = {
  httpOnly: true,
  sameSite: cookieOptions.sameSite,
  secure: cookieOptions.secure,
  path: "/",
};

export const csrfCookieOptions = {
  httpOnly: false,
  sameSite: cookieOptions.sameSite,
  secure: cookieOptions.secure,
  maxAge: cookieOptions.maxAge,
  path: "/",
};

export function newCsrfToken() {
  return randomBytes(32).toString("hex");
}

export function csrfFromCookies(cookies?: Record<string, string | undefined>) {
  const raw = cookies?.[CSRF_COOKIE];
  return typeof raw === "string" && raw.length >= 32 ? raw : "";
}

export function setCsrfCookie(res: Response, token: string) {
  res.cookie(CSRF_COOKIE, token, csrfCookieOptions);
}

export function ensureCsrfCookie(req: { cookies?: Record<string, string | undefined> }, res: Response) {
  const existing = csrfFromCookies(req.cookies);
  if (existing) return existing;
  const token = newCsrfToken();
  setCsrfCookie(res, token);
  return token;
}

export function publicAvatarUrl(path: string | null | undefined) {
  if (!path) return null;
  const safe = path
    .replace(/\\/g, "/")
    .split("/")
    .filter((part) => part && part !== "." && part !== "..")
    .join("/");
  if (!safe) return null;
  return `${SUPABASE_URL}/storage/v1/object/public/avatars/${safe}`;
}

function playSecret() {
  if (PLAY_TOKEN_SECRET) return PLAY_TOKEN_SECRET;
  if (IS_PROD) throw new Error("PLAY_TOKEN_SECRET or SUPABASE_SERVICE_ROLE_KEY is required.");
  return "aux-play-dev";
}

export function playTokenFor(userId: string) {
  const exp = Date.now() + 1000 * 60 * 60 * 24 * 7;
  const payload = `${userId}.${exp}`;
  const sig = createHmac("sha256", playSecret()).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

export function userIdFromPlayToken(token: unknown) {
  const raw = String(token || "");
  const first = raw.indexOf(".");
  const second = raw.indexOf(".", first + 1);
  if (first < 1 || second < 0) return null;
  const userId = raw.slice(0, first);
  const exp = raw.slice(first + 1, second);
  const sig = raw.slice(second + 1);
  if (!userId || !exp || !sig || Date.now() > Number(exp)) return null;
  const expected = createHmac("sha256", playSecret()).update(`${userId}.${exp}`).digest("hex");
  const left = Buffer.from(sig);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  return userId;
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

export function authBody(user: DbUser | null | undefined) {
  if (!user) return { user: null as null, playToken: null as null };
  return { user: userPublic(user), playToken: playTokenFor(user.id) };
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

function requirePassword(password: string) {
  const issues = passwordIssues(password);
  if (issues.length) throw new AuthError(issues[0]);
}

export async function usernameAvailability(username: string) {
  const name = username.trim();
  if (!name) return { available: false, errors: [] as string[] };
  const errors = usernameIssues(name);
  if (errors.length) return { available: false, errors };
  const existing = await findUserByUsername(name);
  return { available: !existing, errors: [] as string[] };
}

export async function registerUser(
  username: string,
  email: string,
  password: string,
  consents?: { acceptedTerms?: boolean; ageConfirmed?: boolean },
) {
  if (!consents?.acceptedTerms) {
    throw new AuthError("Accept the Terms of Service and Privacy Policy to create an account.");
  }
  if (!consents?.ageConfirmed) {
    throw new AuthError("You must be 13 or older to create an Aux Party account.");
  }
  const name = username.trim();
  const mail = email.trim().toLowerCase();
  const nameIssues = usernameIssues(name);
  if (nameIssues.length) {
    throw new AuthError(nameIssues[0]);
  }
  if (!EMAIL_RE.test(mail)) {
    throw new AuthError("Enter a valid email.");
  }
  requirePassword(password);

  const byEmail = await findUserByEmail(mail);
  if (byEmail?.email_verified) {
    await logSecurityEvent("register_existing_email");
    return { email: mail };
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
    await grantAchievement(user.id, "welcome");
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

async function issuePasswordResetToken(user: DbUser) {
  const raw = randomBytes(32).toString("hex");
  await replacePasswordReset(user.id, hashToken(raw), Date.now() + RESET_TTL_MS);
  return raw;
}

async function issueLockoutReset(user: DbUser) {
  if (!user.email) return;
  try {
    const raw = await issuePasswordResetToken(user);
    await sendAccountLockedEmail(user.email, raw);
    await touchVerifySent(user.id);
  } catch (err) {
    console.warn("[security] lock email failed", err);
  }
}

export async function loginUser(username: string, password: string, audit?: AuthAudit) {
  const user = await findUserByUsername(username.trim());
  const ok = await bcrypt.compare(password, user?.password_hash || DUMMY_PASSWORD_HASH);
  if (user) {
    const lock = await getLoginLock(user.id);
    if (lock.lockedUntil && lock.lockedUntil > Date.now()) {
      await logSecurityEvent("login_blocked_locked", { userId: user.id, ip: audit?.ip });
      throw new AuthError(LOCKED_MESSAGE, "locked");
    }
  }
  if (!user || !ok) {
    if (user) {
      const lockedNow = await recordFailedLogin(user.id, FAIL_LIMIT, LOCK_MS);
      if (lockedNow) {
        await issueLockoutReset(user);
        await logSecurityEvent("account_locked", { userId: user.id, ip: audit?.ip });
        throw new AuthError(LOCKED_MESSAGE, "locked");
      }
      await logSecurityEvent("login_fail", { userId: user.id, ip: audit?.ip });
    } else {
      await logSecurityEvent("login_fail", { ip: audit?.ip, detail: "unknown_user" });
    }
    throw new AuthError("Wrong username or password.");
  }
  if (!user.email_verified) {
    throw new AuthError(
      "Verify your email before logging in. Check your inbox for the Aux Party link.",
      "unverified",
      user.email || undefined,
    );
  }
  await clearLoginLock(user.id);
  const sid = await createSession(user.id);
  await grantAchievement(user.id, "welcome");
  await logSecurityEvent("login_ok", { userId: user.id, ip: audit?.ip });
  return { user, sid };
}

export function setSessionCookie(res: Response, sid: string) {
  res.cookie(COOKIE, sid, cookieOptions);
}

export async function clearSessionCookie(res: Response, sid?: string) {
  if (sid) await deleteSession(sid);
  res.clearCookie(COOKIE, cookieClearOptions);
}

export async function requestPasswordReset(email: string, audit?: AuthAudit) {
  const mail = email.trim().toLowerCase();
  if (!EMAIL_RE.test(mail)) throw new AuthError("Enter a valid email.");
  const user = await findUserByEmail(mail);
  if (!user?.email_verified || !user.email) return;
  const last = await getVerifySentAt(user.id);
  if (last && Date.now() - last < RESEND_COOLDOWN_MS) return;
  const raw = await issuePasswordResetToken(user);
  await sendPasswordResetEmail(user.email, raw);
  await touchVerifySent(user.id);
  await logSecurityEvent("password_reset_requested", { userId: user.id, ip: audit?.ip });
}

export async function completePasswordReset(rawToken: string, password: string, audit?: AuthAudit) {
  requirePassword(password);
  const hashed = hashToken(rawToken.trim());
  const user = await findUserByPasswordReset(hashed);
  if (!user) throw new AuthError("That reset link is invalid or expired.");
  await updatePasswordHash(user.id, await bcrypt.hash(password, 10));
  await deletePasswordReset(hashed);
  await deletePasswordChallengesForUser(user.id);
  await deleteSessionsForUser(user.id);
  await clearLoginLock(user.id);
  await logSecurityEvent("password_reset_completed", { userId: user.id, ip: audit?.ip });
}

export async function saveProfile(userId: string, aboutMe: string) {
  const text = sanitizeText(aboutMe, 280, true);
  const user = await updateProfile(userId, { about_me: text });
  if (!user) throw new AuthError("Could not save that profile.");
  return user;
}

export async function saveAvatar(userId: string, imageBase64: string, _mime = "image/jpeg") {
  assertUuid(userId, "account");
  const raw = imageBase64.replace(/^data:[^;]+;base64,/, "");
  if (raw.length > 2.8 * 1024 * 1024) throw new AuthError("Keep photos under 2MB.");
  const bytes = Buffer.from(raw, "base64");
  if (bytes.length < 32) throw new AuthError("That photo looks empty.");
  if (bytes.length > 2 * 1024 * 1024) throw new AuthError("Keep photos under 2MB.");
  const sniffed = sniffImageMime(bytes);
  if (!sniffed) throw new AuthError("Use a JPG, PNG, WEBP, or GIF.");
  const path = await uploadAvatarFile(userId, bytes, sniffed);
  const user = await updateProfile(userId, { avatar_path: path });
  if (!user) throw new AuthError("Could not save that photo.");
  return user;
}

export async function startPasswordChange(userId: string, oldPassword: string, newPassword: string) {
  requirePassword(newPassword);
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

export async function confirmPasswordChange(
  userId: string,
  challengeId: string,
  code: string,
  audit?: AuthAudit,
) {
  const digits = code.replace(/\D/g, "");
  if (digits.length !== 6) throw new AuthError("Enter the 6-digit code from your email.");
  const row = await takePasswordChallenge(assertUuid(challengeId, "challenge"), userId, hashToken(digits));
  if (!row) throw new AuthError("That code is wrong or expired.");
  await updatePasswordHash(row.userId, row.newPasswordHash);
  await deleteSessionsForUser(row.userId);
  await clearLoginLock(row.userId);
  await logSecurityEvent("password_changed", { userId: row.userId, ip: audit?.ip });
  const sid = await createSession(row.userId);
  return { sid };
}

export async function deleteOwnAccount(userId: string, password: string, audit?: AuthAudit) {
  const user = await findUserById(userId);
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    throw new AuthError("Wrong password.");
  }
  await logSecurityEvent("account_deleted", { userId, ip: audit?.ip });
  await deleteAccount(userId);
}
