import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import AccountShell from "../components/AccountShell";
import { useAuth } from "../useAuth";

export default function StatsPage() {
  const auth = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (auth.ready && !auth.user) navigate("/", { replace: true });
  }, [auth.ready, auth.user, navigate]);

  if (!auth.user) return null;

  return (
    <AccountShell showMenu>
      <section className="g-card account-card">
        <p className="lime-title">Stats</p>
        <p className="play-copy">
          Your match record will land here. Play some rooms and this board will fill in.
        </p>
        <Link to="/" className="text-link" viewTransition>
          ‹ Back to Aux Party
        </Link>
      </section>
    </AccountShell>
  );
}
