import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import AccountShell from "../components/AccountShell";
import BackButton, { PLAY_HOME } from "../components/BackButton";
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
      <FriendsPanel headingAs="h1" />
      <BackButton to={PLAY_HOME}>Back to Aux Party</BackButton>
    </AccountShell>
  );
}
