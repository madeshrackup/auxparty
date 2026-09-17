import Avatar from "./Avatar";
import type { Player } from "@shared/types";

export default function Scoreboard({
  players,
  youId,
  deltas,
}: {
  players: Player[];
  youId: string;
  deltas?: Record<string, number> | null;
}) {
  const ranked = [...players].sort((a, b) => b.score - a.score);
  return (
    <aside className="panel">
      <div className="kicker">Players</div>
      <h2>Room</h2>
      <div className="players">
        {ranked.map((p, i) => (
          <div key={p.id} className={`player ${p.connected ? "" : "off"}`}>
            <span>
              <Avatar id={p.avatar} size={40} />
              {i + 1}. {p.name}
              {p.id === youId ? " (you)" : ""}
              {p.isHost ? " · host" : ""}
              <span className={`pill ${p.isGuest ? "guest" : "account"}`}>
                {p.isGuest ? "guest" : "account"}
              </span>
            </span>
            <strong>
              {p.score}
              {deltas?.[p.id] ? <span className="delta"> +{deltas[p.id]}</span> : null}
            </strong>
          </div>
        ))}
      </div>
    </aside>
  );
}
