import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import {
  AuthError,
  clearSessionCookie,
  getAuthedUser,
  loginUser,
  registerUser,
  resendVerification,
  sessionFromRequest,
  setSessionCookie,
  userPublic,
  verifyEmailToken,
} from "./auth.ts";
import { APP_URL } from "./env.ts";
import { searchItunes } from "./itunes.ts";

const ORIGIN = process.env.CORS_ORIGIN || APP_URL || "http://localhost:5173";

export const app = express();
app.use(cors({ origin: ORIGIN, credentials: true }));
app.use(express.json());
app.use(cookieParser());

export function authFail(res: express.Response, err: unknown, fallback: string) {
  if (err instanceof AuthError) {
    const status = err.code === "unverified" || err.code === "cooldown" ? 403 : 400;
    res.status(status).json({ error: err.message, code: err.code, email: err.email });
    return;
  }
  res.status(400).json({ error: err instanceof Error ? err.message : fallback });
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/auth/me", async (req, res) => {
  const user = await getAuthedUser(req);
  res.json({ user: user ? userPublic(user) : null });
});

app.post("/api/auth/register", async (req, res) => {
  try {
    const { username, email, password } = req.body as {
      username?: string;
      email?: string;
      password?: string;
    };
    const { email: pending } = await registerUser(username || "", email || "", password || "");
    res.json({ pending: true, email: pending });
  } catch (err) {
    authFail(res, err, "Register failed.");
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body as { username?: string; password?: string };
    const { user, sid } = await loginUser(username || "", password || "");
    setSessionCookie(res, sid);
    res.json({ user: userPublic(user) });
  } catch (err) {
    authFail(res, err, "Login failed.");
  }
});

app.post("/api/auth/verify", async (req, res) => {
  try {
    const token = String((req.body as { token?: string })?.token || "");
    const { user, sid } = await verifyEmailToken(token);
    setSessionCookie(res, sid);
    res.json({ user: userPublic(user) });
  } catch (err) {
    authFail(res, err, "Verify failed.");
  }
});

app.post("/api/auth/resend-verification", async (req, res) => {
  try {
    const email = String((req.body as { email?: string })?.email || "");
    await resendVerification(email);
    res.json({ ok: true });
  } catch (err) {
    authFail(res, err, "Could not resend.");
  }
});

app.post("/api/auth/logout", async (req, res) => {
  await clearSessionCookie(res, sessionFromRequest(req));
  res.json({ ok: true });
});

app.get("/api/music/search", async (req, res) => {
  try {
    const q = String(req.query.q || "");
    const tracks = await searchItunes(q);
    res.json({ tracks });
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : "Search failed." });
  }
});
