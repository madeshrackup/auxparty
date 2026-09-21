import { Link, useLocation, useNavigate } from "react-router-dom";
import { IconTrophy } from "./PartyArt";
import { transitionNavigate } from "../transition";

export default function TrophyLink() {
  const navigate = useNavigate();
  const on = useLocation().pathname === "/achievements";
  return (
    <Link
      to="/achievements"
      className={`trophy-link ${on ? "on" : ""}`}
      aria-label="Trophies"
      onClick={(event) => {
        event.preventDefault();
        if (on) return;
        transitionNavigate(navigate, "/achievements");
      }}
    >
      <IconTrophy />
      <span>Trophies</span>
    </Link>
  );
}
