import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Avatar from "../components/Avatar";
import ModeGlyph from "../components/ModeGlyph";
import {
  IconGlobe,
  IconPeople,
  PersonBadge,
  VibeIcon,
  VinylBadge,
} from "../components/PartyArt";
import { emitAck, getSocket, resetSocket } from "../socket";
import { unlockAudio } from "../audio";
import { ApiError, forgotPassword } from "../api";
import { useAuth } from "../useAuth";
import { getAvatar, nextAvatar, setAvatar, type AvatarId } from "../identity";
import { runViewTransition } from "../transition";
import UserMenu from "../components/UserMenu";
import type { GameMode } from "@shared/types";

const HOWTO = [
  {
    step: "1. PICK A ROOM",
    title: "Jump in with friends",
    body: "Create a private room or drop in with a 4-character code. Up to 10 players.",
  },
  {
    step: "2. CLASSIC",
    title: "Pick, then guess",
    body: "Everyone has 30 seconds to queue a song. Then each pick plays and the room has 30 seconds to name it. Remaining seconds = your points. 5 rounds means 5 picks each.",
  },
  {
    step: "3. BUZZER BEATER",
    title: "Fastest finger",
    body: "A high-speed race to identify the song title and artist before anyone else beats you to the buzz.",
  },
  {
    step: "4. WHO ADDED THIS?",
    title: "Call out the culprit",
    body: "Secretly submit a guilty pleasure. Points go to whoever guesses the song and which friend queued it.",
  },
  {
    step: "5. PASS THE AUX",
    title: "Earn the cord",
    body: "One player picks a theme, everyone submits a track, and the room votes on who actually earned the aux.",
  },
];

const GAME_MODES: { id: GameMode; title: string; body: string }[] = [
  {
    id: "classic",
    title: "Classic",
    body: "Queue a song, then guess every clip. Seconds left on the clock are your points.",
  },
  {
    id: "buzzer",
    title: "Buzzer Beater",
    body: "First to buzz types the title and artist. Miss and you're out of that clip.",
  },
  {
    id: "impostor",
    title: "Who Added This?",
    body: "Name the track and the friend who snuck it in.",
  },
  {
    id: "aux",
    title: "Pass the Aux",
    body: "Play to a theme, then vote on who actually earned the cord.",
  },
];

const HOST_STEPS: { tone: GameMode; title: string; blurb: string }[] = [
  { tone: "classic", title: "Pick your game", blurb: "Hit CREATE, then lock in a mode for the night." },
  { tone: "buzzer", title: "Share the code", blurb: "Friends type the 4 letters on your screen." },
  { tone: "impostor", title: "Pack the room", blurb: "Up to 10 players can drop in before you start." },
  { tone: "aux", title: "Start the mix", blurb: "Set the rounds, then let the clips fly." },
];

export default function Landing() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"anon" | "auth">(auth.user ? "auth" : "anon");
  const [screen, setScreen] = useState<"identity" | "play" | "modes">("identity");
  const [avatar, setAvatarState] = useState<AvatarId>(getAvatar);
  const [code, setCode] = useState("");
  const [slide, setSlide] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "register" | "forgot">("login");
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

  function pickAvatar(dir: 1 | -1) {
    const next = nextAvatar(avatar, dir);
    setAvatar(next);
    setAvatarState(next);
  }

  function goScreen(next: "identity" | "play" | "modes") {
    if (next === screen) return;
    runViewTransition(() => setScreen(next));
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
      const sock = getSocket(name, asGuest);
      const res = await emitAck<{ ok: boolean; error?: string; code?: string }>(
        sock,
        "room:create",
        { name, avatar, mode },
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
      const sock = getSocket(name, asGuest);
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
        if (password !== confirmPassword) {
          throw new Error("Passwords don't match.");
        }
        const res = await auth.register(username, email, password);
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

  useEffect(() => {
    if (auth.user) setTab("auth");
  }, [auth.user]);

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
        <span className="lang-pill">
          <IconGlobe /> EN
        </span>
        <Link to="/" className="brand">
          <span className="brand-mark" aria-hidden />
          <span className="brand-name">AUX PARTY</span>
          <span className="brand-tag">THE MUSIC QUIZ</span>
        </Link>
        {screen !== "identity" && auth.user ? (
          <UserMenu />
        ) : (
          <span className="live-pill">
            <IconPeople /> PARTY MODE
          </span>
        )}
      </header>

      {screen === "identity" ? (
        <main key="identity" className="screen-stage home-grid">
          <section className="identity-wrap" data-tab={tab}>
            <div className="folder-tabs">
              <button
                type="button"
                className={`folder-tab ${tab === "anon" ? "on" : ""}`}
                onClick={() => {
                  resetSocket();
                  setTab("anon");
                }}
              >
                Anonymous
              </button>
              <button
                type="button"
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
                  <Avatar id={avatar} size={176} />
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
                  <button
                    className="text-link"
                    type="button"
                    onClick={() => {
                      setAuthMode("login");
                      setForgotSent(false);
                      setError("");
                    }}
                  >
                    Back to log in
                  </button>
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
                  {authMode === "register" ? "Create an account" : "Log in or create an account"}
                </p>
                <input
                  className="nick-input"
                  placeholder="Username"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
                {authMode === "register" && (
                  <input
                    className="nick-input"
                    type="email"
                    placeholder="Email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                )}
                <input
                  className="nick-input"
                  type="password"
                  placeholder="Password"
                  autoComplete={authMode === "register" ? "new-password" : "current-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                {authMode === "register" && (
                  <input
                    className="nick-input"
                    type="password"
                    placeholder="Confirm password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                )}
                {authMode === "register" && (
                  <p className="play-copy">Password needs at least 8 characters. We’ll email you a verify link.</p>
                )}
                {authMode === "register" ? (
                  <div className="start-row">
                    <button
                      className="start-btn"
                      disabled={
                        busy ||
                        !username.trim() ||
                        !email.trim() ||
                        password.length < 8 ||
                        password !== confirmPassword
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

          <aside className="g-card howto-card">
            <p className="lime-title">How to play</p>
            <div className="howto-mid">
              <div className="howto-art" data-slide={slide}>
                <Avatar id={AVATAR_IDS_FOR_SLIDE[slide]} size={72} />
                <Avatar id={AVATAR_IDS_FOR_SLIDE[(slide + 2) % 6]} size={72} />
              </div>
              <h3>{how.step}</h3>
              <p>{how.body}</p>
            </div>
            <div className="howto-nav">
              <button type="button" className="arrow-btn sm" onClick={() => setSlide((s) => (s + HOWTO.length - 1) % HOWTO.length)}>
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
              <button type="button" className="arrow-btn sm" onClick={() => setSlide((s) => (s + 1) % HOWTO.length)}>
                ›
              </button>
            </div>
          </aside>
        </main>
      ) : screen === "modes" ? (
        <main key="modes" className="screen-stage mode-choice">
          <p className="lime-title mode-choice-title">Which game are we playing?</p>
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
              </button>
            ))}
          </div>
          <p className="error play-error">{error}</p>
          <button className="text-link back-link" type="button" onClick={() => goScreen("play")}>
            ‹ Back to create / join
          </button>
        </main>
      ) : (
        <main key="play" className="screen-stage play-grid">
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
          <section className="g-card play-card join-card">
            <div className="play-hero">
              <PersonBadge />
              <div>
                <p className="lime-title">Join a room</p>
                <p className="play-copy">Enter the 4-character code on the host's screen.</p>
              </div>
            </div>
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
            <div className="create-row">
              <button
                className="start-btn alt join-wide"
                disabled={busy || code.trim().length < 4}
                type="button"
                onClick={() => void joinRoom()}
              >
                JOIN
              </button>
              <span className="scribble scribble-vibe">Get in and pick your vibe!</span>
            </div>
            <div className="how-it">
              <p className="how-it-title">How it works</p>
              <div className="how-steps">
                <div>
                  <span className="step-num">1</span>
                  <span>Join or create a room</span>
                </div>
                <span className="how-arrow">→</span>
                <div>
                  <span className="step-num">2</span>
                  <span>Listen to a snippet</span>
                </div>
                <span className="how-arrow">→</span>
                <div>
                  <span className="step-num">3</span>
                  <span>Guess the song</span>
                </div>
                <span className="how-arrow">→</span>
                <div>
                  <span className="step-num">4</span>
                  <span>Get points &amp; win</span>
                </div>
              </div>
            </div>
          </section>
          <p className="error play-error">{error}</p>
          <button className="text-link back-link back-pill" type="button" onClick={() => goScreen("identity")}>
            ‹ Back to character
          </button>
        </main>
      )}
    </div>
  );
}

const AVATAR_IDS_FOR_SLIDE: AvatarId[] = ["disco", "bass", "vinyl", "mic", "wave", "aux"];
