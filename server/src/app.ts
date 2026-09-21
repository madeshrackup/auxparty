import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import {
  AuthError,
  COOKIE,
  cookieClearOptions,
  clearSessionCookie,
  completePasswordReset,
  confirmPasswordChange,
  deleteOwnAccount,
  ensureCsrfCookie,
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
  usernameAvailability,
  verifyEmailToken,
} from "./auth.ts";
import { loadAchievements, loadStats, logSecurityEvent } from "./db.ts";
import { IS_PROD } from "./env.ts";
import { searchItunes } from "./itunes.ts";
import {
  allowRequest,
  applySecurityHeaders,
  clientIp,
  corsOriginOption,
  csrfAllowed,
  csrfTokenAllowed,
  publicError,
} from "./security.ts";

export const app = express();
app.disable("x-powered-by");
if (IS_PROD) app.set("trust proxy", 1);
app.use((_req, res, next) => {
  applySecurityHeaders(res);
  next();
});
app.use(cors({ origin: corsOriginOption(), credentials: true }));
app.use(cookieParser());
app.use((req, res, next) => {
  if (!csrfAllowed(req)) {
    void logSecurityEvent("csrf_reject", { ip: clientIp(req), detail: "origin" });
    res.status(403).json({ error: "Forbidden origin." });
    return;
  }
  if (!csrfTokenAllowed(req)) {
    void logSecurityEvent("csrf_reject", { ip: clientIp(req), detail: "token" });
    res.status(403).json({ error: "Missing or invalid security token.", code: "csrf" });
    return;
  }
  if (!allowRequest(req)) {
    res.status(429).json({ error: "Too many requests. Try again in a minute." });
    return;
  }
  next();
});
app.use(
  express.json({
    limit: "3mb",
    verify: (req, _res, buf) => {
      const path = String(req.url || "");
      if (!path.includes("/api/auth/avatar") && buf.length > 48 * 1024) {
        const err = new Error("Payload too large.") as Error & { status: number };
        err.status = 413;
        throw err;
      }
    },
  }),
);

export function authFail(res: express.Response, err: unknown, fallback: string) {
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
  const status = (err as { status?: number })?.status === 413 ? 413 : 400;
  res.status(status).json({ error: publicError(err, fallback) });
}

async function requireUser(req: express.Request) {
  const user = await getAuthedUser(req);
  if (!user) throw new AuthError("Sign in first.", "unauth");
  return user;
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/auth/csrf", (req, res) => {
  ensureCsrfCookie(req, res);
  res.json({ ok: true });
});

app.get("/api/auth/me", async (req, res) => {
  try {
    ensureCsrfCookie(req, res);
    const user = await getAuthedUser(req);
    res.json(authBody(user));
  } catch {
    ensureCsrfCookie(req, res);
    res.json({ user: null });
  }
});

app.get("/api/auth/achievements", async (req, res) => {
  try {
    const user = await getAuthedUser(req);
    if (!user) {
      res.json({ unlocked: [], wins: 0 });
      return;
    }
    res.json(await loadAchievements(user.id));
  } catch {
    res.json({ unlocked: [], wins: 0 });
  }
});

app.get("/api/auth/stats", async (req, res) => {
  try {
    const user = await getAuthedUser(req);
    if (!user) {
      res.status(401).json({ error: "Sign in first.", code: "unauth" });
      return;
    }
    res.json(await loadStats(user.id));
  } catch {
    res.status(400).json({ error: "Could not load stats." });
  }
});

app.post("/api/auth/register", async (req, res) => {
  try {
    const { username, email, password, acceptedTerms, ageConfirmed } = req.body as {
      username?: string;
      email?: string;
      password?: string;
      acceptedTerms?: boolean;
      ageConfirmed?: boolean;
    };
    const { email: pending } = await registerUser(username || "", email || "", password || "", {
      acceptedTerms: Boolean(acceptedTerms),
      ageConfirmed: Boolean(ageConfirmed),
    });
    res.json({ pending: true, email: pending });
  } catch (err) {
    authFail(res, err, "Register failed.");
  }
});

app.get("/api/auth/username", async (req, res) => {
  try {
    const username = String(req.query.username || "");
    res.json(await usernameAvailability(username));
  } catch (err) {
    authFail(res, err, "Could not check that username.");
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body as { username?: string; password?: string };
    const { user, sid } = await loginUser(username || "", password || "", { ip: clientIp(req) });
    setSessionCookie(res, sid);
    ensureCsrfCookie(req, res);
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
    res.clearCookie(COOKIE, cookieClearOptions);
  }
  res.json({ ok: true });
});

app.post("/api/auth/forgot", async (req, res) => {
  try {
    const email = String((req.body as { email?: string })?.email || "");
    await requestPasswordReset(email, { ip: clientIp(req) });
    res.json({ ok: true });
  } catch (err) {
    authFail(res, err, "Could not send that email.");
  }
});

app.post("/api/auth/reset", async (req, res) => {
  try {
    const { token, password } = req.body as { token?: string; password?: string };
    await completePasswordReset(token || "", password || "", { ip: clientIp(req) });
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
    const { sid } = await confirmPasswordChange(user.id, challengeId || "", code || "", {
      ip: clientIp(req),
    });
    setSessionCookie(res, sid);
    res.json({ ok: true });
  } catch (err) {
    authFail(res, err, "Could not confirm that password change.");
  }
});

app.post("/api/auth/delete", async (req, res) => {
  try {
    const user = await requireUser(req);
    const password = String((req.body as { password?: string })?.password || "");
    await deleteOwnAccount(user.id, password, { ip: clientIp(req) });
    await clearSessionCookie(res, sessionFromRequest(req));
    res.json({ ok: true });
  } catch (err) {
    authFail(res, err, "Could not delete that account.");
  }
});

app.get("/api/music/search", async (req, res) => {
  try {
    const q = String(req.query.q || "");
    const tracks = await searchItunes(q);
    res.json({ tracks });
  } catch (err) {
    res.status(502).json({ error: publicError(err, "Search failed.") });
  }
});

app.use((err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (!err) {
    next();
    return;
  }
  if (res.headersSent) {
    next(err);
    return;
  }
  authFail(res, err, "Request failed.");
});
