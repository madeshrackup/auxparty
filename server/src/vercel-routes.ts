import { parse as parseCookie, serialize } from "cookie";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  AuthError,
  COOKIE,
  completePasswordReset,
  confirmPasswordChange,
  cookieOptions,
  getAuthedUserFromSid,
  loginUser,
  registerUser,
  requestPasswordReset,
  resendVerification,
  saveAvatar,
  saveProfile,
  startPasswordChange,
  userPublic,
  verifyEmailToken,
} from "./auth.ts";
import { deleteSession, type DbUser } from "./db.ts";
import { searchItunes } from "./itunes.ts";

function bodyOf(req: VercelRequest) {
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body || "{}") as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return (req.body || {}) as Record<string, unknown>;
}

function sidOf(req: VercelRequest) {
  const fromCookies = req.cookies?.[COOKIE];
  if (fromCookies) return fromCookies;
  return parseCookie(req.headers.cookie || "")[COOKIE];
}

export function sendAuthError(res: VercelResponse, err: unknown, fallback: string) {
  if (err instanceof AuthError) {
    const status =
      err.code === "unauth" ? 401 : err.code === "unverified" || err.code === "cooldown" ? 403 : 400;
    res.status(status).json({ error: err.message, code: err.code, email: err.email });
    return;
  }
  res.status(400).json({ error: err instanceof Error ? err.message : fallback });
}

function attachSid(res: VercelResponse, sid: string) {
  res.setHeader(
    "Set-Cookie",
    serialize(COOKIE, sid, {
      httpOnly: cookieOptions.httpOnly,
      sameSite: cookieOptions.sameSite,
      secure: cookieOptions.secure,
      maxAge: Math.floor(cookieOptions.maxAge / 1000),
      path: cookieOptions.path,
    }),
  );
}

function clearSid(res: VercelResponse) {
  res.setHeader(
    "Set-Cookie",
    serialize(COOKIE, "", { path: "/", maxAge: 0, httpOnly: true }),
  );
}

async function requireUser(req: VercelRequest): Promise<DbUser> {
  const user = await getAuthedUserFromSid(sidOf(req));
  if (!user) throw new AuthError("Sign in first.", "unauth");
  return user;
}

export async function health(_req: VercelRequest, res: VercelResponse) {
  res.status(200).json({ ok: true });
}

export async function me(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed." });
    return;
  }
  try {
    const user = await getAuthedUserFromSid(sidOf(req));
    res.status(200).json({ user: user ? userPublic(user) : null });
  } catch {
    res.status(200).json({ user: null });
  }
}

export async function register(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed." });
    return;
  }
  try {
    const body = bodyOf(req);
    const { email } = await registerUser(
      String(body.username || ""),
      String(body.email || ""),
      String(body.password || ""),
    );
    res.status(200).json({ pending: true, email });
  } catch (err) {
    sendAuthError(res, err, "Register failed.");
  }
}

export async function login(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed." });
    return;
  }
  try {
    const body = bodyOf(req);
    const { user, sid } = await loginUser(String(body.username || ""), String(body.password || ""));
    attachSid(res, sid);
    res.status(200).json({ user: userPublic(user) });
  } catch (err) {
    sendAuthError(res, err, "Login failed.");
  }
}

export async function verify(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed." });
    return;
  }
  try {
    const body = bodyOf(req);
    await verifyEmailToken(String(body.token || ""));
    res.status(200).json({ ok: true });
  } catch (err) {
    sendAuthError(res, err, "Verify failed.");
  }
}

export async function resend(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed." });
    return;
  }
  try {
    const body = bodyOf(req);
    await resendVerification(String(body.email || ""));
    res.status(200).json({ ok: true });
  } catch (err) {
    sendAuthError(res, err, "Could not resend.");
  }
}

export async function logout(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed." });
    return;
  }
  const sid = sidOf(req);
  try {
    if (sid) await deleteSession(sid);
  } catch {
    /* still clear the cookie */
  }
  clearSid(res);
  res.status(200).json({ ok: true });
}

export async function forgot(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed." });
    return;
  }
  try {
    const body = bodyOf(req);
    await requestPasswordReset(String(body.email || ""));
    res.status(200).json({ ok: true });
  } catch (err) {
    sendAuthError(res, err, "Could not send that email.");
  }
}

export async function resetPassword(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed." });
    return;
  }
  try {
    const body = bodyOf(req);
    await completePasswordReset(String(body.token || ""), String(body.password || ""));
    res.status(200).json({ ok: true });
  } catch (err) {
    sendAuthError(res, err, "Could not reset that password.");
  }
}

export async function profile(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed." });
    return;
  }
  try {
    const user = await requireUser(req);
    const body = bodyOf(req);
    const next = await saveProfile(user.id, String(body.aboutMe ?? ""));
    res.status(200).json({ user: userPublic(next) });
  } catch (err) {
    sendAuthError(res, err, "Could not save that profile.");
  }
}

export async function avatar(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed." });
    return;
  }
  try {
    const user = await requireUser(req);
    const body = bodyOf(req);
    const next = await saveAvatar(user.id, String(body.image || ""), String(body.mime || "image/jpeg"));
    res.status(200).json({ user: userPublic(next) });
  } catch (err) {
    sendAuthError(res, err, "Could not save that photo.");
  }
}

export async function passwordStart(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed." });
    return;
  }
  try {
    const user = await requireUser(req);
    const body = bodyOf(req);
    const result = await startPasswordChange(
      user.id,
      String(body.oldPassword || ""),
      String(body.newPassword || ""),
    );
    res.status(200).json(result);
  } catch (err) {
    sendAuthError(res, err, "Could not start that password change.");
  }
}

export async function passwordConfirm(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed." });
    return;
  }
  try {
    const user = await requireUser(req);
    const body = bodyOf(req);
    await confirmPasswordChange(user.id, String(body.challengeId || ""), String(body.code || ""));
    res.status(200).json({ ok: true });
  } catch (err) {
    sendAuthError(res, err, "Could not confirm that password change.");
  }
}

export async function musicSearch(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed." });
    return;
  }
  try {
    const q = String(req.query.q || "");
    const tracks = await searchItunes(q);
    res.status(200).json({ tracks });
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : "Search failed." });
  }
}

const AUTH_ACTIONS = {
  me,
  register,
  login,
  verify,
  "resend-verification": resend,
  logout,
  forgot,
  reset: resetPassword,
  profile,
  avatar,
  "password-start": passwordStart,
  "password-confirm": passwordConfirm,
} as const;

export async function authAction(req: VercelRequest, res: VercelResponse) {
  const raw = req.query.action;
  const action = Array.isArray(raw) ? raw[0] : raw;
  const handler = AUTH_ACTIONS[action as keyof typeof AUTH_ACTIONS];
  if (!handler) {
    res.status(404).json({ error: "Not found." });
    return;
  }
  try {
    await handler(req, res);
  } catch (err) {
    sendAuthError(res, err, "Request failed.");
  }
}
