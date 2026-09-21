import AccountShell from "../components/AccountShell";
import BackButton, { PLAY_HOME } from "../components/BackButton";

const STEPS = [
  {
    n: "1",
    title: "Share Code",
    body: "Host a room and send the 4-letter code. Up to 10 players can drop in.",
  },
  {
    n: "2",
    title: "Join Party",
    body: "Friends type the code on the home screen, pick a character, and jump in.",
  },
  {
    n: "3",
    title: "Play & Score",
    body: "Name songs, buzz in, or guess who added the track. Faster answers earn more points.",
  },
  {
    n: "4",
    title: "Have Fun",
    body: "Keep the party going across Classic, Buzzer Beater, Who Added This?, and Pass the Aux.",
  },
];

export default function HowToPlayPage() {
  return (
    <AccountShell>
      <section className="g-card account-card" style={{ width: "min(980px, 100%)" }}>
        <h1 className="lime-title">How to play</h1>
        <p className="play-copy">Four steps from code to podium.</p>
        <div className="howto-grid">
          {STEPS.map((step) => (
            <article key={step.n} className="g-card howto-step">
              <span className="howto-num">{step.n}</span>
              <h2>{step.title}</h2>
              <p className="play-copy">{step.body}</p>
            </article>
          ))}
        </div>
        <BackButton to={PLAY_HOME}>Back to Aux Party</BackButton>
      </section>
    </AccountShell>
  );
}
