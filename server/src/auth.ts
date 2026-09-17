import bcrypt from "bcryptjs";
import type { Request, Response } from "express";
import {
  createSession,
  deleteSession,
  findUserByEmail,
  findUserBySession,
  findUserByUsername,
  insertUser,
  type DbUser,
} from "./db.ts";

const COOKIE = "aux_sid";
const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  maxAge: 1000 * 60 * 60 * 24 * 30,
  path: "/",
};

export function userPublic(user: DbUser) {
  return { id: user.id, username: user.username, email: user.email };
}

export function sessionFromRequest(req: Request): string | undefined {
  const raw = req.cookies?.[COOKIE];
  return typeof raw === "string" && raw.length > 0 ? raw : undefined;
}

export function getAuthedUser(req: Request): DbUser | undefined {
  const sid = sessionFromRequest(req);
  if (!sid) return undefined;
  return findUserBySession(sid);
}

export async function registerUser(username: string, email: string, password: string) {
  const name = username.trim();
  const mail = email.trim().toLowerCase();
  if (!USERNAME_RE.test(name)) {
    throw new Error("Username must be 3–20 letters, numbers, or underscores.");
  }
  if (!EMAIL_RE.test(mail)) {
    throw new Error("Enter a valid email.");
  }
  if (password.length < 4) {
    throw new Error("Password must be at least 4 characters.");
  }
  if (findUserByUsername(name)) {
    throw new Error("That username is taken.");
  }
  if (findUserByEmail(mail)) {
    throw new Error("That email is already in use.");
  }
  const user: DbUser = {
    id: crypto.randomUUID(),
    username: name,
    email: mail,
    email_verified: 0,
    password_hash: await bcrypt.hash(password, 10),
  };
  insertUser(user);
  const sid = createSession(user.id);
  return { user, sid };
}

export async function loginUser(username: string, password: string) {
  const user = findUserByUsername(username.trim());
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    throw new Error("Wrong username or password.");
  }
  const sid = createSession(user.id);
  return { user, sid };
}

export function setSessionCookie(res: Response, sid: string) {
  res.cookie(COOKIE, sid, cookieOptions);
}

export function clearSessionCookie(res: Response, sid?: string) {
  if (sid) deleteSession(sid);
  res.clearCookie(COOKIE, { path: "/" });
}
