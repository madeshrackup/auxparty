import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { verifyEmail } from "../api";

export default function VerifyPage() {
  const navigate = useNavigate();
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
      .then((res) => {
        if (!alive) return;
        setStatus("ok");
        setMessage(`You're in, ${res.user.username}.`);
        setTimeout(() => navigate("/", { viewTransition: true }), 1200);
      })
      .catch((err) => {
        if (!alive) return;
        setStatus("err");
        setMessage(err instanceof Error ? err.message : "That link didn't work.");
      });
    return () => {
      alive = false;
    };
  }, [navigate, token]);

  return (
    <div className="page">
      <header className="topbar">
        <Link to="/" viewTransition className="brand compact">
          <span className="brand-mark" aria-hidden />
          <span className="brand-name">AUX PARTY</span>
          <span className="brand-tag">THE MUSIC QUIZ</span>
        </Link>
      </header>
      <div className="panel quit-modal">
        <div className="kicker">Account</div>
        <h2>{status === "ok" ? "Email verified" : status === "working" ? "One second" : "Couldn't verify"}</h2>
        <p className="hint">{message}</p>
        {status !== "working" && (
          <Link to="/" viewTransition className="btn btn-primary">
            Back home
          </Link>
        )}
      </div>
    </div>
  );
}
