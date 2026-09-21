import AccountShell from "../components/AccountShell";
import BackButton, { PLAY_HOME } from "../components/BackButton";

const CREDITS = [
  {
    heading: "Music",
    body: "30-second clips and artwork come from Apple's iTunes preview catalogue. Public Spotify and Apple Music playlists can be imported for Buzzer Beater; tracks are matched to iTunes so those previews can play. Aux Party is not affiliated with Apple or Spotify.",
  },
  {
    heading: "Type",
    body: "Fredoka, Lilita One, and Caveat are served by Google Fonts.",
  },
];

export default function CreditsPage() {
  return (
    <AccountShell>
      <article className="g-card account-card credits-page">
        <p className="kicker">Aux Party</p>
        <h1 className="lime-title">Credits</h1>
        <p className="play-copy">The people and catalogues that make the party possible.</p>
        <section className="legal-section">
          <h2>Owner / Lead developer</h2>
          <p className="credits-name">Madesh</p>
          <p>Designed, built, and runs Aux Party.</p>
        </section>
        {CREDITS.map((item) => (
          <section key={item.heading} className="legal-section">
            <h2>{item.heading}</h2>
            <p>{item.body}</p>
          </section>
        ))}
        <BackButton to={PLAY_HOME}>Back to Aux Party</BackButton>
      </article>
    </AccountShell>
  );
}
