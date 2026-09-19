import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { IconPeople } from "./PartyArt";
import TrophyLink from "./TrophyLink";
import UserMenu from "./UserMenu";
import { useAuth } from "../useAuth";

export default function AccountShell({
  children,
  showMenu = false,
}: {
  children: ReactNode;
  showMenu?: boolean;
}) {
  const auth = useAuth();
  return (
    <div className="home">
      <header className="home-top">
        <TrophyLink />
        <Link to="/" className="brand">
          <span className="brand-mark" aria-hidden />
          <span className="brand-name">AUX PARTY</span>
          <span className="brand-tag">THE MUSIC QUIZ</span>
        </Link>
        {showMenu && auth.user ? (
          <UserMenu />
        ) : (
          <span className="live-pill">
            <IconPeople /> PARTY MODE
          </span>
        )}
      </header>
      <main className="screen-stage account-stage">{children}</main>
    </div>
  );
}
