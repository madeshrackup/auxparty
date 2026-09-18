import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import {
  AuthError,
  COOKIE,
  clearSessionCookie,
  completePasswordReset,
  confirmPasswordChange,
  getAuthedUser,
  loginUser,
  registerUser,
  requestPasswordReset,
  resendVerification,
  saveAvatar,
  saveProfile,
  sessionFromRequest,
  setSessionCookie,
  startPasswordChange,
  authBody,
  verifyEmailToken,
} from "./auth.ts";
import { APP_URL } from "./env.ts";
import { searchItunes } from "./itunes.ts";

const ORIGIN = process.env.CORS_ORIGIN || APP_URL || "http://localhost:5173";

export const app = express();
app.use(cors({ origin: ORIGIN, credentials: true }));
app.use(express.json({ limit: "3mb" }));
app.use(cookieParser());

export function authFail(res: express.Response, err: unknown, fallback: string) {
  if (err instanceof AuthError) {
    const status =
      err.code === "unauth" ? 401 : err.code === "unverified" || err.code === "cooldown" ? 403 : 400;
    res.status(status).json({ error: err.message, code: err.code, email: err.email });
    return;
  }
  res.status(400).json({ error: err instanceof Error ? err.message : fallback });
}

async function requireUser(req: express.Request) {
  const user = await getAuthedUser(req);
  if (!user) throw new AuthError("Sign in first.", "unauth");
  return user;
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/auth/me", async (req, res) => {
  try {
    const user = await getAuthedUser(req);
    res.json(authBody(user));
  } catch {
    res.json({ user: null });
  }
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
    res.json(authBody(user));
  } catch (err) {
    authFail(res, err, "Login failed.");
  }
});

app.post("/api/auth/verify", async (req, res) => {
  try {
    const token = String((req.body as { token?: string })?.token || "");
    await verifyEmailToken(token);
    res.json({ ok: true });
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
  try {
    await clearSessionCookie(res, sessionFromRequest(req));
  } catch {
    res.clearCookie(COOKIE, { path: "/" });
  }
  res.json({ ok: true });
});

app.post("/api/auth/forgot", async (req, res) => {
  try {
    const email = String((req.body as { email?: string })?.email || "");
    await requestPasswordReset(email);
    res.json({ ok: true });
  } catch (err) {
    authFail(res, err, "Could not send that email.");
  }
});

app.post("/api/auth/reset", async (req, res) => {
  try {
    const { token, password } = req.body as { token?: string; password?: string };
    await completePasswordReset(token || "", password || "");
    res.json({ ok: true });
  } catch (err) {
    authFail(res, err, "Could not reset that password.");
  }
});

app.post("/api/auth/profile", async (req, res) => {
  try {
    const user = await requireUser(req);
    const aboutMe = String((req.body as { aboutMe?: string })?.aboutMe ?? "");
    const next = await saveProfile(user.id, aboutMe);
    res.json(authBody(next));
  } catch (err) {
    authFail(res, err, "Could not save that profile.");
  }
});

app.post("/api/auth/avatar", async (req, res) => {
  try {
    const user = await requireUser(req);
    const { image, mime } = req.body as { image?: string; mime?: string };
    const next = await saveAvatar(user.id, image || "", mime || "image/jpeg");
    res.json(authBody(next));
  } catch (err) {
    authFail(res, err, "Could not save that photo.");
  }
});

app.post("/api/auth/password-start", async (req, res) => {
  try {
    const user = await requireUser(req);
    const { oldPassword, newPassword } = req.body as { oldPassword?: string; newPassword?: string };
    const result = await startPasswordChange(user.id, oldPassword || "", newPassword || "");
    res.json(result);
  } catch (err) {
    authFail(res, err, "Could not start that password change.");
  }
});

app.post("/api/auth/password-confirm", async (req, res) => {
  try {
    const user = await requireUser(req);
    const { challengeId, code } = req.body as { challengeId?: string; code?: string };
    await confirmPasswordChange(user.id, challengeId || "", code || "");
    res.json({ ok: true });
  } catch (err) {
    authFail(res, err, "Could not confirm that password change.");
  }
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
