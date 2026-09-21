import { Link } from "react-router-dom";

export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <nav className="site-footer-nav" aria-label="Site">
        <Link to="/" viewTransition>
          Home
        </Link>
        <Link to={{ pathname: "/", hash: "how-to-play" }} viewTransition>
          How to play
        </Link>
        <Link to="/achievements" viewTransition>
          Badges
        </Link>
        <Link to="/privacy" viewTransition>
          Privacy
        </Link>
        <Link to="/terms" viewTransition>
          Terms
        </Link>
        <Link to="/cookies" viewTransition>
          Cookies
        </Link>
      </nav>
    </footer>
  );
}
