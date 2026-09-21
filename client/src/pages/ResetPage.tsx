import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import AccountShell from "../components/AccountShell";
import PasswordField, { PasswordMeter } from "../components/PasswordField";
import { passwordIssues, passwordMeetsPolicy } from "@shared/credentials";
import { resetPassword } from "../api";

export default function ResetPage() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(token ? "" : "That reset link is missing.");
  const [done, setDone] = useState(false);

  async function submit() {
    setBusy(true);
    setError("");
    try {
      if (password !== confirm) throw new Error("Passwords don't match.");
      const problems = passwordIssues(password);
      if (problems.length) throw new Error(problems[0]);
      await resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reset that password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AccountShell>
      <section className="g-card account-card">
        {done ? (
          <>
            <h1 className="lime-title">Password updated</h1>
            <p className="play-copy">Return to Aux Party to re-login with your new details.</p>
            <Link to="/" className="start-btn" viewTransition>
              Return to Aux Party
            </Link>
          </>
        ) : (
          <form
            className="auth-form"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <h1 className="lime-title">Choose a new password</h1>
            <p className="play-copy">Then head back home and log in with it.</p>
            <PasswordField
              placeholder="New password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <PasswordMeter password={password} />
            <PasswordField
              placeholder="Verify password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
            {confirm.length > 0 && password !== confirm && (
              <p className="field-note bad">Passwords don't match.</p>
            )}
            <p className="error">{error}</p>
            <button className="start-btn" disabled={busy || !token || !passwordMeetsPolicy(password) || password !== confirm} type="submit">
              Save password
            </button>
          </form>
        )}
      </section>
    </AccountShell>
  );
}
