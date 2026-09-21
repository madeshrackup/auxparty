import Avatar from "./Avatar";
import type { Player } from "@shared/types";

const DEVELOPER_ID = "eb7ab08a-0751-4836-ada9-270db0a3a1fd";

function PlayerPills({ player }: { player: Player }) {
  const developer = player.id === DEVELOPER_ID;
  return (
    <>
      {developer ? <span className="pill developer">developer</span> : null}
      {player.isHost ? (
        <span className="pill host">host</span>
      ) : !developer && player.isGuest ? (
        <span className="pill guest">guest</span>
      ) : null}
    </>
  );
}

function PlayerFace({ player, size = 40 }: { player: Player; size?: number }) {
  if (player.avatarUrl) {
    return (
      <span className="player-photo" style={{ width: size, height: size }}>
        <img src={player.avatarUrl} alt={`${player.name}'s photo`} loading="lazy" decoding="async" />
      </span>
    );
  }
  return <Avatar id={player.avatar} size={size} />;
}

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
        {ranked.map((p, i) => {
          const delta = deltas?.[p.id];
          return (
          <div key={p.id} className={`player ${p.connected ? "" : "off"} ${p.id === youId ? "you" : ""}`}>
            <span>
              <PlayerFace player={p} />
              {i + 1}. {p.name}
              <PlayerPills player={p} />
            </span>
            <strong>
              {p.score}
              {delta ? (
                <span className={`delta ${delta < 0 ? "down" : ""}`}>
                  {delta > 0 ? `+${delta}` : delta}
                </span>
              ) : null}
            </strong>
          </div>
          );
        })}
      </div>
    </aside>
  );
}
