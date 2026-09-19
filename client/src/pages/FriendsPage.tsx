import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import AccountShell from "../components/AccountShell";
import FriendsPanel from "../components/FriendsPanel";
import { useAuth } from "../useAuth";

export default function FriendsPage() {
  const auth = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (auth.ready && !auth.user) navigate("/", { replace: true });
  }, [auth.ready, auth.user, navigate]);

  if (!auth.user) return null;

  return (
    <AccountShell showMenu>
      <FriendsPanel />
      <p className="account-back">
        <Link to="/" className="text-link" viewTransition>
          ‹ Back to Aux Party
        </Link>
      </p>
    </AccountShell>
  );
}
