import { Link } from "react-router-dom";
import AccountShell from "../components/AccountShell";
import BackButton, { PLAY_HOME } from "../components/BackButton";
import { clearGuestData } from "../identity";
import { LEGAL, LEGAL_UPDATED, type LegalDoc } from "../legalContent";

export default function LegalPage({ doc }: { doc: LegalDoc }) {
  const page = LEGAL[doc];
  return (
    <AccountShell>
      <article className="g-card legal-card">
        <p className="kicker">Aux Party</p>
        <h1 className="lime-title">{page.title}</h1>
        <p className="hint">Last updated {LEGAL_UPDATED}</p>
        <p className="play-copy">{page.intro}</p>
        {page.sections.map((section) => (
          <section key={section.heading} className="legal-section">
            <h2>{section.heading}</h2>
            {section.body.map((para) => (
              <p key={para}>{para}</p>
            ))}
          </section>
        ))}
        {doc === "cookies" && (
          <button
            type="button"
            className="start-btn alt"
            onClick={() => {
              clearGuestData();
              window.location.assign("/");
            }}
          >
            Clear guest data on this device
          </button>
        )}
        <BackButton to={PLAY_HOME}>Back to Aux Party</BackButton>
        <p className="legal-links">
          <Link to="/privacy" viewTransition>
            Privacy
          </Link>
          <Link to="/terms" viewTransition>
            Terms
          </Link>
          <Link to="/cookies" viewTransition>
            Cookies
          </Link>
          <Link to="/" viewTransition>
            Home
          </Link>
        </p>
      </article>
    </AccountShell>
  );
}
