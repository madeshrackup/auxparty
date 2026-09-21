import { Link, useLocation } from "react-router-dom";
import { IconTrophy } from "./PartyArt";

export default function TrophyLink() {
  const on = useLocation().pathname === "/achievements";
  return (
    <Link to="/achievements" className={`trophy-link ${on ? "on" : ""}`} viewTransition aria-label="Aux Party Badges">
      <IconTrophy />
    </Link>
  );
}
