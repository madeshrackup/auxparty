import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AccountShell from "../components/AccountShell";
import PasswordField, { PasswordMeter } from "../components/PasswordField";
import { passwordIssues, passwordMeetsPolicy } from "@shared/credentials";
import { useAuth } from "../useAuth";

export default function ChangePasswordPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [code, setCode] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (auth.ready && !auth.user) navigate("/", { replace: true });
  }, [auth.ready, auth.user, navigate]);

  if (!auth.user) return null;

  async function startChange() {
    setBusy(true);
    setError("");
    try {
      if (newPassword !== confirm) throw new Error("Passwords don't match.");
      const problems = passwordIssues(newPassword);
      if (problems.length) throw new Error(problems[0]);
      const res = await auth.startPasswordChange(oldPassword, newPassword);
      setChallengeId(res.challengeId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start that change.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmChange() {
    setBusy(true);
    setError("");
    try {
      await auth.confirmPasswordChange(challengeId, code);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That code didn't work.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AccountShell showMenu>
      <section className="g-card account-card">
        {done ? (
          <>
            <h1 className="lime-title">Password changed</h1>
            <p className="play-copy">You're still signed in here. Other devices were signed out. Use the new password next time you log in.</p>
            <Link to="/account" className="start-btn" viewTransition>
              Back to profile
            </Link>
          </>
        ) : challengeId ? (
          <form
            className="auth-form"
            onSubmit={(e) => {
              e.preventDefault();
              void confirmChange();
            }}
          >
            <h1 className="lime-title">Enter your code</h1>
            <p className="play-copy">We emailed a 6-digit code to {auth.user.email}. It expires in 10 minutes.</p>
            <input
              className="nick-input"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            />
            <p className="error">{error}</p>
            <button className="start-btn" disabled={busy || code.length !== 6} type="submit">
              Confirm change
            </button>
          </form>
        ) : (
          <form
            className="auth-form"
            onSubmit={(e) => {
              e.preventDefault();
              void startChange();
            }}
          >
            <h1 className="lime-title">Change password</h1>
            <p className="play-copy">We'll email a 6-digit code before the new password sticks.</p>
            <PasswordField
              placeholder="Current password"
              autoComplete="current-password"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
            />
            <PasswordField
              placeholder="New password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <PasswordMeter password={newPassword} />
            <PasswordField
              placeholder="Verify new password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
            {confirm.length > 0 && newPassword !== confirm && (
              <p className="field-note bad">Passwords don't match.</p>
            )}
            <p className="error">{error}</p>
            <button className="start-btn" disabled={busy || !passwordMeetsPolicy(newPassword) || newPassword !== confirm} type="submit">
              Email me a code
            </button>
            <Link to="/account" className="text-link" viewTransition>
              ‹ Back to profile
            </Link>
          </form>
        )}
      </section>
    </AccountShell>
  );
}
