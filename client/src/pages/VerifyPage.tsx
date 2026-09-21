import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import AccountShell from "../components/AccountShell";
import BackButton, { PLAY_HOME } from "../components/BackButton";
import { verifyEmail } from "../api";

export default function VerifyPage() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [status, setStatus] = useState<"working" | "ok" | "err">(token ? "working" : "err");
  const [message, setMessage] = useState(
    token ? "Confirming your email…" : "That verification link is missing.",
  );

  useEffect(() => {
    if (!token) return;
    let alive = true;
    void verifyEmail(token)
      .then(() => {
        if (!alive) return;
        setStatus("ok");
        setMessage("Your account is verified. Return to Aux Party to log in.");
      })
      .catch((err) => {
        if (!alive) return;
        setStatus("err");
        setMessage(err instanceof Error ? err.message : "That link didn't work.");
      });
    return () => {
      alive = false;
    };
  }, [token]);

  return (
    <AccountShell>
      <section className="g-card account-card">
        <h1 className="lime-title">
          {status === "ok" ? "Account verified" : status === "working" ? "One second" : "Couldn't verify"}
        </h1>
        <p className="play-copy">{message}</p>
        {status !== "working" && (
          <BackButton to={PLAY_HOME}>Back to Aux Party</BackButton>
        )}
      </section>
    </AccountShell>
  );
}
