import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import Avatar from "../components/Avatar";
import ModeGlyph from "../components/ModeGlyph";
import {
  PersonBadge,
  VibeIcon,
  VinylBadge,
} from "../components/PartyArt";
import { emitAck, getSocket, resetSocket } from "../socket";
import { unlockAudio } from "../audio";
import { ApiError, forgotPassword } from "../api";
import PasswordField, { PasswordMeter } from "../components/PasswordField";
import UsernameField, { type UsernameLiveStatus } from "../components/UsernameField";
import { passwordIssues, passwordMeetsPolicy, usernameIssues } from "@shared/credentials";
import { useAuth } from "../useAuth";
import { getAvatar, nextAvatar, setAvatar, type AvatarId } from "../identity";
import { runViewTransition } from "../transition";
import FriendsPanel from "../components/FriendsPanel";
import { CreditsCard, GameSettingsCard, StatsOverviewCard } from "../components/PlayExtras";
import TrophyLink from "../components/TrophyLink";
import UserMenu from "../components/UserMenu";
import BackButton from "../components/BackButton";
import { loadPrefs } from "../prefs";
import { GAME_MODE_BLURBS, GAME_MODE_LABELS, GAME_MODE_ORDER, MIN_PLAYERS, type GameMode } from "@shared/types";

const HOWTO = [
  {
    step: "1. PICK A ROOM",
    title: "Jump in with friends",
    body: "Create a private room or drop in with a 4-character code. Up to 10 players.",
  },
  {
    step: "2. CLASSIC",
    title: "Classic",
    body: GAME_MODE_BLURBS.classic,
  },
  {
    step: "3. BUZZER BEATER",
    title: "Buzzer Beater",
    body: GAME_MODE_BLURBS.buzzer,
  },
  {
    step: "4. WHO ADDED THIS?",
    title: "Who Added This?",
    body: GAME_MODE_BLURBS.impostor,
  },
  {
    step: "5. PASS THE AUX",
    title: "Pass the Aux",
    body: GAME_MODE_BLURBS.aux,
  },
];

const GAME_MODES: { id: GameMode; title: string; body: string }[] = GAME_MODE_ORDER.map((id) => ({
  id,
  title: GAME_MODE_LABELS[id],
  body: GAME_MODE_BLURBS[id],
}));

const HOST_STEPS: { tone: GameMode; title: string; blurb: string }[] = [
  { tone: "classic", title: "Pick your game", blurb: "Hit CREATE, then lock in a mode for the night." },
  { tone: "buzzer", title: "Share the code", blurb: "Friends type the 4 letters on your screen." },
  { tone: "impostor", title: "Pack the room", blurb: "Up to 10 players can drop in before you start." },
  { tone: "aux", title: "Start the mix", blurb: "Set the rounds, then let the clips fly." },
];

const PLAY_HUB_PAGES = 2;

export default function Landing() {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<"anon" | "auth">(auth.user ? "auth" : "anon");
  const [screen, setScreen] = useState<"identity" | "play" | "modes">(() =>
    searchParams.get("play") === "1" ? "play" : "identity",
  );
  const [hubPage, setHubPage] = useState(0);
  const swipeRef = useRef<{ x: number; page: number } | null>(null);
  const [avatar, setAvatarState] = useState<AvatarId>(getAvatar);
  const [code, setCode] = useState("");
  const [slide, setSlide] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [usernameStatus, setUsernameStatus] = useState<UsernameLiveStatus>("idle");
  const [authMode, setAuthMode] = useState<"login" | "register" | "forgot">("login");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [verifyBanner, setVerifyBanner] = useState("");
  const [forgotSent, setForgotSent] = useState(false);

  useEffect(() => {
    const stored = sessionStorage.getItem("aux_verify_banner") || "";
    if (stored) setVerifyBanner(stored);
  }, []);

  const name =
    tab === "auth" && auth.user ? auth.user.username.trim() : auth.guestName.trim();
  const ready = name.length >= 2;
  const asGuest = tab !== "auth" || !auth.user;
  const usernameLooksReady =
    usernameIssues(username).length === 0 && username.trim().length > 0 && usernameStatus === "free";

  function pickAvatar(dir: 1 | -1) {
    const next = nextAvatar(avatar, dir);
    setAvatar(next);
    setAvatarState(next);
  }

  function goScreen(next: "identity" | "play" | "modes") {
    if (next === screen) return;
    if (next !== "play") setHubPage(0);
    runViewTransition(() => {
      setScreen(next);
      const onPlay = searchParams.get("play") === "1";
      if (next === "identity") {
        if (onPlay) setSearchParams({}, { replace: true });
      } else if (!onPlay) {
        setSearchParams({ play: "1" }, { replace: true });
      }
    });
  }

  function startParty() {
    if (!ready) {
      setError("Pick a nickname first.");
      return;
    }
    unlockAudio();
    setError("");
    goScreen("play");
  }

  async function createRoom(mode: GameMode) {
    if (!ready) return;
    setBusy(true);
    setError("");
    unlockAudio();
    try {
      const sock = getSocket(name, asGuest, asGuest ? null : auth.user?.avatarUrl, asGuest ? null : auth.playToken);
      const prefs = loadPrefs();
      const res = await emitAck<{ ok: boolean; error?: string; code?: string }>(
        sock,
        "room:create",
        { name, avatar, mode, isPrivate: prefs.privateLobby, totalRounds: prefs.rounds },
      );
      if (!res.ok || !res.code) throw new Error(res.error || "Could not create room.");
      navigate(`/room/${res.code}`, { viewTransition: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create room.");
    } finally {
      setBusy(false);
    }
  }

  async function joinRoom(joinCode = code) {
    if (!ready) return;
    setBusy(true);
    setError("");
    unlockAudio();
    try {
      const sock = getSocket(name, asGuest, asGuest ? null : auth.user?.avatarUrl, asGuest ? null : auth.playToken);
      const res = await emitAck<{ ok: boolean; error?: string; code?: string }>(
        sock,
        "room:join",
        { code: joinCode.trim().toUpperCase(), name, avatar },
      );
      if (!res.ok || !res.code) throw new Error(res.error || "Could not join.");
      navigate(`/room/${res.code}`, { viewTransition: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join.");
    } finally {
      setBusy(false);
    }
  }

  async function submitAuth(mode: "login" | "register") {
    setBusy(true);
    setError("");
    try {
      if (mode === "register") {
        const nameProblems = usernameIssues(username);
        if (nameProblems.length) throw new Error(nameProblems[0]);
        if (usernameStatus === "taken") throw new Error("That username is taken.");
        const pwProblems = passwordIssues(password);
        if (pwProblems.length) throw new Error(pwProblems[0]);
        if (password !== confirmPassword) {
          throw new Error("Passwords don't match.");
        }
        const res = await auth.register(username, email, password, {
          acceptedTerms,
          ageConfirmed,
        });
        sessionStorage.setItem("aux_verify_banner", res.email);
        setVerifyBanner(res.email);
        setAuthMode("login");
        setEmail("");
        setConfirmPassword("");
        setPassword("");
        return;
      }
      try {
        await auth.login(username, password);
        setPassword("");
        sessionStorage.removeItem("aux_verify_banner");
        setVerifyBanner("");
      } catch (err) {
        if (err instanceof ApiError && err.code === "unverified" && err.email) {
          sessionStorage.setItem("aux_verify_banner", err.email);
          setVerifyBanner(err.email);
        }
        throw err;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Auth failed");
    } finally {
      setBusy(false);
    }
  }

  async function sendForgot() {
    setBusy(true);
    setError("");
    try {
      await forgotPassword(email);
      setForgotSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send that email.");
    } finally {
      setBusy(false);
    }
  }

  async function resendPending() {
    if (!verifyBanner) return;
    setBusy(true);
    setError("");
    try {
      await auth.resendVerification(verifyBanner);
      setError("Sent another email. Check your inbox.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resend.");
    } finally {
      setBusy(false);
    }
  }

  const how = HOWTO[slide];

  function openSignup() {
    resetSocket();
    setError("");
    setTab("auth");
    setAuthMode("register");
    setForgotSent(false);
    goScreen("identity");
  }

  useEffect(() => {
    if (auth.user) setTab("auth");
  }, [auth.user]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("signup") === "1") {
      openSignup();
      setSearchParams({}, { replace: true });
      return;
    }
    if (params.get("play") === "1") {
      setScreen((current) => (current === "identity" ? "play" : current));
    }
  }, [location.search]);

  useEffect(() => {
    if (location.hash !== "#how-to-play") return;
    goScreen("identity");
    window.requestAnimationFrame(() => {
      document.getElementById("how-to-play")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [location.hash]);

  useEffect(() => {
    if (screen !== "play") return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable) return;
      }
      if (event.key === "ArrowRight") setHubPage((page) => Math.min(PLAY_HUB_PAGES - 1, page + 1));
      if (event.key === "ArrowLeft") setHubPage((page) => Math.max(0, page - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [screen]);

  return (
    <div className="home">
      {verifyBanner && (
        <div className="verify-banner" role="status">
          <p>
            Verify your account via the link in your email before logging in. We sent it to{" "}
            <b>{verifyBanner}</b>.
          </p>
          <div className="verify-banner-actions">
            <button type="button" className="text-link" disabled={busy} onClick={() => void resendPending()}>
              Resend email
            </button>
            <button
              type="button"
              className="text-link"
              onClick={() => {
                sessionStorage.removeItem("aux_verify_banner");
                setVerifyBanner("");
              }}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
      <header className="home-top">
        <TrophyLink />
        <Link to="/" className="brand">
          <span className="brand-mark" aria-hidden />
          <h1 className="brand-name">AUX PARTY</h1>
          <span className="brand-tag">THE MUSIC QUIZ</span>
        </Link>
        {auth.user ? <UserMenu /> : null}
      </header>

      {screen === "identity" ? (
        <main key="identity" className="screen-stage home-grid">
          <section className="identity-wrap" data-tab={tab}>
            <div className="folder-tabs" role="tablist" aria-label="Play as">
              <button
                type="button"
                role="tab"
                aria-selected={tab === "anon"}
                className={`folder-tab ${tab === "anon" ? "on" : ""}`}
                onClick={() => {
                  resetSocket();
                  setTab("anon");
                  if (auth.user) void auth.logout();
                }}
              >
                Anonymous
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === "auth"}
                className={`folder-tab ${tab === "auth" ? "on" : ""}`}
                onClick={() => {
                  resetSocket();
                  setTab("auth");
                  setAuthMode("login");
                  setForgotSent(false);
                }}
              >
                Sign up / Log in
              </button>
            </div>
            <div className="identity-panel">

            {tab === "anon" || (tab === "auth" && auth.user) ? (
              <div className="identity-body">
                <div className="avatar-picker">
                  <button type="button" className="arrow-btn" onClick={() => pickAvatar(-1)} aria-label="Previous character">
                    ‹
                  </button>
                  <Avatar id={avatar} size={176} label="Selected character" />
                  <button type="button" className="arrow-btn" onClick={() => pickAvatar(1)} aria-label="Next character">
                    ›
                  </button>
                </div>
                <div className="identity-copy">
                  <p className="lime-title">
                    {tab === "auth" && auth.user
                      ? "Your account is ready"
                      : "Choose a character and a nickname"}
                  </p>
                  {tab === "auth" && auth.user ? (
                    <div className="nick-lock">{auth.user.username}</div>
                  ) : (
                    <input
                      className="nick-input"
                      value={auth.guestName}
                      maxLength={20}
                      aria-label="Nickname"
                      onChange={(e) => auth.setGuestName(e.target.value)}
                    />
                  )}
                  <button className="start-btn" type="button" disabled={!ready} onClick={startParty}>
                    <span className="play-tri" /> START
                  </button>
                  {tab === "auth" && auth.user && (
                    <button className="text-link" type="button" onClick={() => void auth.logout()}>
                      Log out
                    </button>
                  )}
                </div>
              </div>
            ) : authMode === "forgot" ? (
              <form
                className="auth-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void sendForgot();
                }}
              >
                <p className="lime-title">Forgot password</p>
                {forgotSent ? (
                  <p className="play-copy">
                    If an account exists with that email, we sent a reset link. Open it, pick a new password,
                    then return to Aux Party to log in.
                  </p>
                ) : (
                  <>
                    <p className="play-copy">Enter the email on your account. We'll send a reset link if it matches.</p>
                    <input
                      className="nick-input"
                      type="email"
                      placeholder="Email"
                      autoComplete="email"
                      aria-label="Email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </>
                )}
                <div className="start-row">
                  {!forgotSent && (
                    <button className="start-btn" disabled={busy || !email.trim()} type="submit">
                      Send reset email
                    </button>
                  )}
                  <BackButton
                    onClick={() => {
                      setAuthMode("login");
                      setForgotSent(false);
                      setError("");
                    }}
                  >
                    Back to login
                  </BackButton>
                </div>
              </form>
            ) : (
              <form
                className={`auth-form ${authMode === "register" ? "signup" : ""}`}
                onSubmit={(e) => {
                  e.preventDefault();
                  void submitAuth(authMode === "register" ? "register" : "login");
                }}
              >
                <p className="lime-title">
                  {authMode === "register" ? "Create an account" : "Log in"}
                </p>
                <UsernameField
                  value={username}
                  onChange={setUsername}
                  liveCheck={authMode === "register"}
                  onLiveStatus={setUsernameStatus}
                />
                {authMode === "register" && (
                  <input
                    className="nick-input"
                    type="email"
                    placeholder="Email"
                    autoComplete="email"
                    aria-label="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                )}
                <PasswordField
                  placeholder="Password"
                  autoComplete={authMode === "register" ? "new-password" : "current-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                {authMode === "register" && <PasswordMeter password={password} />}
                {authMode === "register" && (
                  <PasswordField
                    placeholder="Confirm password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                )}
                {authMode === "register" && confirmPassword.length > 0 && password !== confirmPassword && (
                  <p className="field-note bad">Passwords don't match.</p>
                )}
                {authMode === "register" && (
                  <div className="consent-stack">
                    <label className="consent-check">
                      <input
                        type="checkbox"
                        checked={acceptedTerms}
                        onChange={(e) => setAcceptedTerms(e.target.checked)}
                      />
                      <span>
                        I agree to the{" "}
                        <Link to="/terms" viewTransition>
                          Terms of Service
                        </Link>{" "}
                        and{" "}
                        <Link to="/privacy" viewTransition>
                          Privacy Policy
                        </Link>
                        .
                      </span>
                    </label>
                    <label className="consent-check">
                      <input
                        type="checkbox"
                        checked={ageConfirmed}
                        onChange={(e) => setAgeConfirmed(e.target.checked)}
                      />
                      <span>I confirm I am 13 years of age or older. Aux Party does not collect birthdays.</span>
                    </label>
                  </div>
                )}
                {authMode === "register" ? (
                  <div className="start-row">
                    <button
                      className="start-btn"
                      disabled={
                        busy ||
                        !email.trim() ||
                        !usernameLooksReady ||
                        !passwordMeetsPolicy(password) ||
                        password !== confirmPassword ||
                        !acceptedTerms ||
                        !ageConfirmed
                      }
                      type="submit"
                    >
                      Sign up
                    </button>
                    <button
                      className="text-link"
                      type="button"
                      onClick={() => {
                        setAuthMode("login");
                        setError("");
                      }}
                    >
                      Already have an account? Log in
                    </button>
                  </div>
                ) : (
                  <>
                  <div className="start-row">
                    <button className="start-btn" disabled={busy} type="submit">
                      Log in
                    </button>
                    <button
                      className="start-btn alt"
                      disabled={busy}
                      type="button"
                      onClick={() => {
                        setAuthMode("register");
                        setError("");
                      }}
                    >
                      Sign up
                    </button>
                  </div>
                  <button
                    className="text-link"
                    type="button"
                    onClick={() => {
                      setAuthMode("forgot");
                      setForgotSent(false);
                      setError("");
                    }}
                  >
                    Forgot password?
                  </button>
                  </>
                )}
              </form>
            )}
            <p className="error">{error || auth.error}</p>
            </div>
          </section>

          <aside className="g-card howto-card" id="how-to-play">
            <h2 className="lime-title">How to play</h2>
            <div className="howto-mid">
              <div className="howto-art" data-slide={slide}>
                <Avatar id={AVATAR_IDS_FOR_SLIDE[slide]} size={72} />
                <Avatar id={AVATAR_IDS_FOR_SLIDE[(slide + 2) % 6]} size={72} />
              </div>
              <h3>{how.step}</h3>
              <p>{how.body}</p>
            </div>
            <div className="howto-nav">
              <button
                type="button"
                className="arrow-btn sm"
                onClick={() => setSlide((s) => (s + HOWTO.length - 1) % HOWTO.length)}
                aria-label="Previous how to play slide"
              >
                ‹
              </button>
              <div className="dots">
                {HOWTO.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    className={`dot ${i === slide ? "on" : ""}`}
                    onClick={() => setSlide(i)}
                    aria-label={`How to play ${i + 1}`}
                  />
                ))}
              </div>
              <button
                type="button"
                className="arrow-btn sm"
                onClick={() => setSlide((s) => (s + 1) % HOWTO.length)}
                aria-label="Next how to play slide"
              >
                ›
              </button>
            </div>
          </aside>
        </main>
      ) : screen === "modes" ? (
        <main key="modes" className="screen-stage mode-choice">
          <p className="lime-title mode-choice-title">
            {busy ? "Starting the room…" : "Which game are we playing?"}
          </p>
          <div className="mode-choice-grid">
            {GAME_MODES.map((mode) => (
              <button
                key={mode.id}
                type="button"
                className="g-card mode-choice-card"
                disabled={busy}
                onClick={() => void createRoom(mode.id)}
              >
                <span className="mode-choice-head">
                  <ModeGlyph mode={mode.id} />
                  <span className="lime-title">{mode.title}</span>
                </span>
                <span className="play-copy">{mode.body}</span>
                <span className="mode-min">{MIN_PLAYERS[mode.id]} players min</span>
              </button>
            ))}
          </div>
          <p className="error play-error">{error}</p>
          <BackButton onClick={() => goScreen("play")}>Back to create / join</BackButton>
        </main>
      ) : (
        <main key="play" className="screen-stage play-hub">
          <button
            type="button"
            className="play-hub-arrow left"
            aria-label="Previous cards"
            disabled={hubPage <= 0}
            onClick={() => setHubPage((page) => Math.max(0, page - 1))}
          >
            ‹
          </button>
          <div
            className="play-hub-viewport"
            onPointerDown={(event) => {
              const target = event.target;
              if (
                target instanceof HTMLElement &&
                target.closest("button, input, a, textarea, select, .dropdown")
              ) {
                swipeRef.current = null;
                return;
              }
              swipeRef.current = { x: event.clientX, page: hubPage };
            }}
            onPointerUp={(event) => {
              const start = swipeRef.current;
              swipeRef.current = null;
              if (!start) return;
              const dx = event.clientX - start.x;
              if (dx < -48) setHubPage(Math.min(PLAY_HUB_PAGES - 1, start.page + 1));
              if (dx > 48) setHubPage(Math.max(0, start.page - 1));
            }}
            onPointerCancel={() => {
              swipeRef.current = null;
            }}
          >
            <div
              className="play-hub-track"
              style={{ transform: `translateX(calc(${hubPage} * -1 * (100% + var(--hub-gap))))` }}
            >
              <div className="play-grid play-hub-page" {...(hubPage !== 0 ? { inert: true } : {})}>
          <section className="g-card play-card create-card">
            <div className="play-hero">
              <VinylBadge />
              <div>
                <p className="lime-title">Create a room</p>
                <p className="play-copy">Host your own music quiz and share the code with your friends.</p>
              </div>
              <span className="hero-note" aria-hidden>
                ♪
              </span>
            </div>
            <div className="create-row">
              <button
                className="start-btn"
                disabled={busy}
                type="button"
                onClick={() => {
                  setError("");
                  goScreen("modes");
                }}
              >
                <span className="play-tri" /> CREATE
              </button>
              <span className="scribble scribble-dj">Be the DJ!</span>
            </div>
            <div className="host-guide">
              <div className="featured-head">
                <span className="featured-title">
                  <VibeIcon tone="aux" /> How to host
                </span>
              </div>
              <div className="featured-list">
                {HOST_STEPS.map((step, i) => (
                  <div className="host-row" key={step.title}>
                    <VibeIcon tone={step.tone} />
                    <div className="room-meta">
                      <b>{step.title}</b>
                      <span>{step.blurb}</span>
                    </div>
                    <span className="step-num">{i + 1}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
          <div className="play-right">
            <section className="g-card play-card join-card join-card-slim">
              <div className="play-hero">
                <PersonBadge />
                <div>
                  <p className="lime-title">Join a game</p>
                  <p className="play-copy">Enter the code on the host's screen.</p>
                </div>
              </div>
              <div className="join-slim-row">
                <div className="code-wrap">
                  <input
                    className="nick-input code-input"
                    value={code}
                    maxLength={4}
                    placeholder="CODE"
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                  />
                  {code && (
                    <button className="code-clear" type="button" onClick={() => setCode("")} aria-label="Clear code">
                      ×
                    </button>
                  )}
                </div>
                <button
                  className="start-btn alt"
                  disabled={busy || code.trim().length < 4}
                  type="button"
                  onClick={() => void joinRoom()}
                >
                  JOIN
                </button>
              </div>
            </section>
            <FriendsPanel onRegister={openSignup} />
          </div>
              </div>
              <div className="play-grid play-hub-page play-hub-extras" {...(hubPage !== 1 ? { inert: true } : {})}>
                <StatsOverviewCard onRegister={openSignup} />
                <div className="play-side-stack">
                  <GameSettingsCard />
                  <CreditsCard />
                </div>
              </div>
            </div>
          </div>
          <button
            type="button"
            className="play-hub-arrow right"
            aria-label="More cards"
            disabled={hubPage >= PLAY_HUB_PAGES - 1}
            onClick={() => setHubPage((page) => Math.min(PLAY_HUB_PAGES - 1, page + 1))}
          >
            ›
          </button>
          <p className="error play-error">{error}</p>
          <BackButton
            onClick={() => {
              setTab("auth");
              setAuthMode("login");
              goScreen("identity");
            }}
          >
            Back to login
          </BackButton>
        </main>
      )}
    </div>
  );
}

const AVATAR_IDS_FOR_SLIDE: AvatarId[] = ["disco", "bass", "vinyl", "mic", "wave", "aux"];
