import { parse as parseCookie, serialize } from "cookie";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  AuthError,
  COOKIE,
  CSRF_COOKIE,
  completePasswordReset,
  confirmPasswordChange,
  cookieClearOptions,
  cookieOptions,
  csrfCookieOptions,
  csrfFromCookies,
  deleteOwnAccount,
  getAuthedUserFromSid,
  loginUser,
  newCsrfToken,
  registerUser,
  requestPasswordReset,
  resendVerification,
  saveAvatar,
  saveProfile,
  startPasswordChange,
  authBody,
  usernameAvailability,
  verifyEmailToken,
} from "./auth.ts";
import { deleteSession, loadAchievements, loadStats, logSecurityEvent, type DbUser } from "./db.ts";
import { assertProductionEnv } from "./env.ts";
import { searchItunes } from "./itunes.ts";
import {
  allowRequest,
  applySecurityHeaders,
  clientIp,
  csrfAllowed,
  csrfTokenAllowed,
  publicError,
  type GuardRequest,
} from "./security.ts";

assertProductionEnv();

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

function cookiesOf(req: VercelRequest) {
  return { ...parseCookie(req.headers.cookie || ""), ...(req.cookies || {}) };
}

function sidOf(req: VercelRequest) {
  return cookiesOf(req)[COOKIE];
}

function auditOf(req: VercelRequest) {
  return { ip: clientIp(req as GuardRequest) };
}

export function sendAuthError(res: VercelResponse, err: unknown, fallback: string) {
  if (err instanceof AuthError) {
    const status =
      err.code === "unauth"
        ? 401
        : err.code === "unverified" || err.code === "cooldown" || err.code === "locked"
          ? 403
          : 400;
    res.status(status).json({ error: err.message, code: err.code, email: err.email });
    return;
  }
  res.status(400).json({ error: publicError(err, fallback) });
}

function appendCookie(res: VercelResponse, value: string) {
  const prev = res.getHeader("Set-Cookie");
  const list = prev == null ? [] : Array.isArray(prev) ? prev.map(String) : [String(prev)];
  res.setHeader("Set-Cookie", [...list, value]);
}

function attachSid(res: VercelResponse, sid: string) {
  appendCookie(
    res,
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
  appendCookie(
    res,
    serialize(COOKIE, "", {
      path: cookieClearOptions.path,
      maxAge: 0,
      httpOnly: cookieClearOptions.httpOnly,
      sameSite: cookieClearOptions.sameSite,
      secure: cookieClearOptions.secure,
    }),
  );
}

function ensureCsrf(req: VercelRequest, res: VercelResponse) {
  const existing = csrfFromCookies(cookiesOf(req));
  if (existing) return existing;
  const token = newCsrfToken();
  appendCookie(
    res,
    serialize(CSRF_COOKIE, token, {
      httpOnly: csrfCookieOptions.httpOnly,
      sameSite: csrfCookieOptions.sameSite,
      secure: csrfCookieOptions.secure,
      maxAge: Math.floor(csrfCookieOptions.maxAge / 1000),
      path: csrfCookieOptions.path,
    }),
  );
  return token;
}

function guard(req: VercelRequest, res: VercelResponse): boolean {
  applySecurityHeaders(res);
  const request = { ...req, cookies: cookiesOf(req) } as GuardRequest;
  if (!csrfAllowed(request)) {
    void logSecurityEvent("csrf_reject", { ip: clientIp(request), detail: "origin" });
    res.status(403).json({ error: "Forbidden origin." });
    return false;
  }
  if (!csrfTokenAllowed(request)) {
    void logSecurityEvent("csrf_reject", { ip: clientIp(request), detail: "token" });
    res.status(403).json({ error: "Missing or invalid security token.", code: "csrf" });
    return false;
  }
  if (!allowRequest(request)) {
    res.status(429).json({ error: "Too many requests. Try again in a minute." });
    return false;
  }
  return true;
}

async function requireUser(req: VercelRequest): Promise<DbUser> {
  const user = await getAuthedUserFromSid(sidOf(req));
  if (!user) throw new AuthError("Sign in first.", "unauth");
  return user;
}

export async function health(req: VercelRequest, res: VercelResponse) {
  if (!guard(req, res)) return;
  res.status(200).json({ ok: true });
}

export async function me(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed." });
    return;
  }
  try {
    ensureCsrf(req, res);
    const user = await getAuthedUserFromSid(sidOf(req));
    res.status(200).json(authBody(user));
  } catch {
    ensureCsrf(req, res);
    res.status(200).json({ user: null });
  }
}

export async function csrf(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed." });
    return;
  }
  ensureCsrf(req, res);
  res.status(200).json({ ok: true });
}

export async function achievements(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed." });
    return;
  }
  try {
    const user = await getAuthedUserFromSid(sidOf(req));
    if (!user) {
      res.status(200).json({ unlocked: [], wins: 0 });
      return;
    }
    res.status(200).json(await loadAchievements(user.id));
  } catch {
    res.status(200).json({ unlocked: [], wins: 0 });
  }
}

export async function stats(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed." });
    return;
  }
  try {
    const user = await getAuthedUserFromSid(sidOf(req));
    if (!user) {
      res.status(401).json({ error: "Sign in first.", code: "unauth" });
      return;
    }
    res.status(200).json(await loadStats(user.id));
  } catch (err) {
    sendAuthError(res, err, "Could not load stats.");
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
      {
        acceptedTerms: Boolean(body.acceptedTerms),
        ageConfirmed: Boolean(body.ageConfirmed),
      },
    );
    res.status(200).json({ pending: true, email });
  } catch (err) {
    sendAuthError(res, err, "Register failed.");
  }
}

export async function username(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed." });
    return;
  }
  try {
    const raw = req.query.username;
    const value = Array.isArray(raw) ? raw[0] : raw;
    res.status(200).json(await usernameAvailability(String(value || "")));
  } catch (err) {
    sendAuthError(res, err, "Could not check that username.");
  }
}

export async function login(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed." });
    return;
  }
  try {
    const body = bodyOf(req);
    const { user, sid } = await loginUser(
      String(body.username || ""),
      String(body.password || ""),
      auditOf(req),
    );
    attachSid(res, sid);
    ensureCsrf(req, res);
    res.status(200).json(authBody(user));
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
    await requestPasswordReset(String(body.email || ""), auditOf(req));
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
    await completePasswordReset(String(body.token || ""), String(body.password || ""), auditOf(req));
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
    res.status(200).json(authBody(next));
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
    res.status(200).json(authBody(next));
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
    const { sid } = await confirmPasswordChange(
      user.id,
      String(body.challengeId || ""),
      String(body.code || ""),
      auditOf(req),
    );
    attachSid(res, sid);
    res.status(200).json({ ok: true });
  } catch (err) {
    sendAuthError(res, err, "Could not confirm that password change.");
  }
}

export async function removeAccount(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed." });
    return;
  }
  try {
    const user = await requireUser(req);
    const body = bodyOf(req);
    await deleteOwnAccount(user.id, String(body.password || ""), auditOf(req));
    clearSid(res);
    res.status(200).json({ ok: true });
  } catch (err) {
    sendAuthError(res, err, "Could not delete that account.");
  }
}

export async function musicSearch(req: VercelRequest, res: VercelResponse) {
  if (!guard(req, res)) return;
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed." });
    return;
  }
  try {
    const q = String(req.query.q || "");
    const tracks = await searchItunes(q);
    res.status(200).json({ tracks });
  } catch (err) {
    res.status(502).json({ error: publicError(err, "Search failed.") });
  }
}

const AUTH_ACTIONS = {
  me,
  csrf,
  achievements,
  stats,
  register,
  username,
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
  delete: removeAccount,
} as const;

export async function authAction(req: VercelRequest, res: VercelResponse) {
  if (!guard(req, res)) return;
  const raw = req.query.action;
  const action = Array.isArray(raw) ? raw[0] : raw;
  const handler = AUTH_ACTIONS[action as keyof typeof AUTH_ACTIONS];
  if (!handler) {
    res.status(404).json({ error: "Not found." });
    return;
  }
  const method = (req.method || "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
    const encoded = typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? {});
    const max = action === "avatar" ? 3 * 1024 * 1024 : 48 * 1024;
    if (encoded.length > max) {
      res.status(413).json({ error: "Payload too large." });
      return;
    }
  }
  try {
    await handler(req, res);
  } catch (err) {
    sendAuthError(res, err, "Request failed.");
  }
}
