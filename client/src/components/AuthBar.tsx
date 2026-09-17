import { useState } from "react";
import type { AuthState } from "../useAuth";

export default function AuthBar({ auth }: { auth: AuthState }) {
  const [open, setOpen] = useState<"login" | "register" | null>(null);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      if (open === "register") {
        if (password !== confirmPassword) throw new Error("Passwords don't match.");
        await auth.register(username, email, password);
      } else {
        await auth.login(username, password);
      }
      setOpen(null);
      setUsername("");
      setEmail("");
      setPassword("");
      setConfirmPassword("");
    } catch (err) {
      auth.setError(err instanceof Error ? err.message : "Auth failed");
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
        <div className="modal-back" onClick={() => setOpen(null)}>
          <form
            className="panel"
            style={{ width: 360 }}
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
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
            <p className="error">{auth.error}</p>
            <div className="row">
              <button className="btn btn-primary" disabled={busy} type="submit">
                {open === "register" ? "Sign up" : "Log in"}
              </button>
              <button className="btn btn-ghost" type="button" onClick={() => setOpen(null)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
