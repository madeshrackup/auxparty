import { parse as parseCookie, serialize } from "cookie";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  AuthError,
  COOKIE,
  cookieOptions,
  getAuthedUserFromSid,
  loginUser,
  registerUser,
  resendVerification,
  userPublic,
  verifyEmailToken,
} from "./auth.ts";
import { deleteSession } from "./db.ts";
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
    const status = err.code === "unverified" || err.code === "cooldown" ? 403 : 400;
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

export async function health(_req: VercelRequest, res: VercelResponse) {
  res.status(200).json({ ok: true });
}

export async function me(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed." });
    return;
  }
  const user = await getAuthedUserFromSid(sidOf(req));
  res.status(200).json({ user: user ? userPublic(user) : null });
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
    const { user, sid } = await verifyEmailToken(String(body.token || ""));
    attachSid(res, sid);
    res.status(200).json({ user: userPublic(user) });
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
  if (sid) await deleteSession(sid);
  clearSid(res);
  res.status(200).json({ ok: true });
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
