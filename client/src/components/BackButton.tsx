import type { MouseEvent, ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { IconBack } from "./PartyArt";
import { runViewTransition, transitionNavigate } from "../transition";

/** Home create / join hub — not the login screen. */
export const PLAY_HOME = "/?play=1";

export default function BackButton({
  children,
  to,
  onClick,
}: {
  children: ReactNode;
  to?: string;
  onClick?: () => void;
}) {
  const navigate = useNavigate();
  const chip = (
    <span className="back-btn-chip">
      <IconBack />
      <span>{children}</span>
    </span>
  );

  function go(event?: MouseEvent<HTMLAnchorElement | HTMLButtonElement>) {
    event?.preventDefault();
    if (onClick && !to) {
      onClick();
      return;
    }
    if (onClick) {
      runViewTransition(onClick);
      return;
    }
    if (to) transitionNavigate(navigate, to);
  }

  if (to) {
    return (
      <Link to={to} className="back-btn" onClick={go}>
        {chip}
      </Link>
    );
  }

  return (
    <button type="button" className="back-btn" onClick={() => go()}>
      {chip}
    </button>
  );
}
