import { useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../api";
import type { AuthState } from "../useAuth";

export default function AuthBar({ auth }: { auth: AuthState }) {
  const [open, setOpen] = useState<"login" | "register" | null>(null);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [pendingEmail, setPendingEmail] = useState("");
  const [busy, setBusy] = useState(false);

  function close() {
    setOpen(null);
    setUsername("");
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setPendingEmail("");
  }

  async function submit() {
    setBusy(true);
    try {
      if (open === "register") {
        if (password !== confirmPassword) throw new Error("Passwords don't match.");
        if (!acceptedTerms) throw new Error("Accept the Terms of Service and Privacy Policy to create an account.");
        if (!ageConfirmed) throw new Error("You must be 13 or older to create an Aux Party account.");
        const res = await auth.register(username, email, password, { acceptedTerms, ageConfirmed });
        setPendingEmail(res.email);
        setPassword("");
        setConfirmPassword("");
        return;
      }
      try {
        await auth.login(username, password);
        close();
      } catch (err) {
        if (err instanceof ApiError && err.code === "unverified" && err.email) {
          setPendingEmail(err.email);
        }
        throw err;
      }
    } catch (err) {
      auth.setError(err instanceof Error ? err.message : "Auth failed");
    } finally {
      setBusy(false);
    }
  }

  async function resendPending() {
    if (!pendingEmail) return;
    setBusy(true);
    try {
      await auth.resendVerification(pendingEmail);
      auth.setError("Sent another email. Check your inbox.");
    } catch (err) {
      auth.setError(err instanceof Error ? err.message : "Could not resend.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-box">
      {auth.user ? (
        <>
          <span className="pill account">signed in as {auth.user.username}</span>
          <button className="btn btn-ghost" type="button" onClick={() => void auth.logout()}>
            Log out
          </button>
        </>
      ) : (
        <>
          <div className="field" style={{ minWidth: 160 }}>
            <label>Guest name</label>
            <input
              value={auth.guestName}
              placeholder="What should we call you?"
              onChange={(e) => auth.setGuestName(e.target.value)}
            />
          </div>
          <button className="btn btn-ghost" type="button" onClick={() => setOpen("login")}>
            Log in
          </button>
          <button className="btn btn-cyan" type="button" onClick={() => setOpen("register")}>
            Sign up
          </button>
        </>
      )}

      {open && (
        <div className="modal-back" onClick={close}>
          <form
            className="panel"
            style={{ width: 360 }}
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            {pendingEmail ? (
              <>
                <h2>Check your inbox</h2>
                <p className="hint">We sent a verify link to {pendingEmail}.</p>
                <p className="error">{auth.error}</p>
                <div className="row">
                  <button className="btn btn-primary" disabled={busy} type="button" onClick={() => void resendPending()}>
                    Resend email
                  </button>
                  <button className="btn btn-ghost" type="button" onClick={close}>
                    Close
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2>{open === "register" ? "Create account" : "Welcome back"}</h2>
                <div className="field">
                  <label>Username</label>
                  <input value={username} autoComplete="username" onChange={(e) => setUsername(e.target.value)} />
                </div>
                {open === "register" && (
                  <div className="field" style={{ marginTop: 10 }}>
                    <label>Email</label>
                    <input
                      type="email"
                      value={email}
                      autoComplete="email"
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                )}
                <div className="field" style={{ marginTop: 10 }}>
                  <label>Password</label>
                  <input
                    type="password"
                    value={password}
                    autoComplete={open === "register" ? "new-password" : "current-password"}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                {open === "register" && (
                  <div className="field" style={{ marginTop: 10 }}>
                    <label>Confirm password</label>
                    <input
                      type="password"
                      value={confirmPassword}
                      autoComplete="new-password"
                      onChange={(e) => setConfirmPassword(e.target.value)}
                    />
                  </div>
                )}
                {open === "register" && (
                  <div className="consent-stack" style={{ marginTop: 12 }}>
                    <label className="consent-check">
                      <input
                        type="checkbox"
                        checked={acceptedTerms}
                        onChange={(e) => setAcceptedTerms(e.target.checked)}
                      />
                      <span>
                        I agree to the <Link to="/terms">Terms of Service</Link> and{" "}
                        <Link to="/privacy">Privacy Policy</Link>.
                      </span>
                    </label>
                    <label className="consent-check">
                      <input
                        type="checkbox"
                        checked={ageConfirmed}
                        onChange={(e) => setAgeConfirmed(e.target.checked)}
                      />
                      <span>I confirm I am 13 years of age or older.</span>
                    </label>
                  </div>
                )}
                <p className="error">{auth.error}</p>
                <div className="row">
                  <button
                    className="btn btn-primary"
                    disabled={busy || (open === "register" && (!acceptedTerms || !ageConfirmed))}
                    type="submit"
                  >
                    {open === "register" ? "Sign up" : "Log in"}
                  </button>
                  <button className="btn btn-ghost" type="button" onClick={close}>
                    Cancel
                  </button>
                </div>
              </>
            )}
          </form>
        </div>
      )}
    </div>
  );
}
