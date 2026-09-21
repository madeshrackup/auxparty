import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  emptyPlayerStats,
  GAME_MODE_LABELS,
  GAME_MODE_ORDER,
  type PlayerStats,
} from "@shared/types";
import AccountShell from "../components/AccountShell";
import BackButton, { PLAY_HOME } from "../components/BackButton";
import { getStats } from "../api";
import { useAuth } from "../useAuth";

function formatCount(n: number) {
  return n.toLocaleString();
}

export default function StatsPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<PlayerStats | null>(null);

  useEffect(() => {
    if (auth.ready && !auth.user) navigate("/", { replace: true });
  }, [auth.ready, auth.user, navigate]);

  useEffect(() => {
    if (!auth.user) {
      setStats(null);
      return;
    }
    void getStats()
      .then((res) => {
        const base = emptyPlayerStats();
        setStats({
          ...base,
          ...res,
          modes: { ...base.modes, ...res.modes },
        });
      })
      .catch(() => setStats(emptyPlayerStats()));
  }, [auth.user]);

  if (!auth.user) return null;

  const board = stats || emptyPlayerStats();
  const loaded = stats !== null;
  const showPointsNote = loaded && board.wins > 0 && board.points === 0;

  return (
    <AccountShell showMenu>
      <section className="g-card account-card stats-card">
        <h1 className="lime-title">Stats</h1>
        {!loaded ? (
          <p className="play-copy">Loading your record…</p>
        ) : (
          <>
            <p className="stats-section-title">Overall</p>
            <div className="stats-overall">
              <div className="stat-tile">
                <b>{formatCount(board.wins)}</b>
                <span>{board.wins === 1 ? "win" : "wins"}</span>
              </div>
              <div className="stat-tile">
                <b>{formatCount(board.points)}</b>
                <span>{board.points === 1 ? "point" : "points"}</span>
              </div>
              <div className="stat-tile">
                <b>{formatCount(board.trophies)}</b>
                <span>trophies won</span>
              </div>
            </div>
            {showPointsNote && (
              <p className="play-copy">
                Older wins are still counted overall. Points and per-mode records start from games you finish from here on.
              </p>
            )}

            {GAME_MODE_ORDER.map((mode) => {
              const row = board.modes[mode];
              return (
                <div key={mode} className="stats-mode">
                  <p className="stats-mode-title">{GAME_MODE_LABELS[mode]}</p>
                  <div className="stats-mode-row">
                    <span>
                      <b>{formatCount(row.wins)}</b> {row.wins === 1 ? "win" : "wins"}
                    </span>
                    <span>
                      <b>{formatCount(row.points)}</b> {row.points === 1 ? "point" : "points"}
                    </span>
                  </div>
                </div>
              );
            })}
          </>
        )}
        <BackButton to={PLAY_HOME}>Back to Aux Party</BackButton>
      </section>
    </AccountShell>
  );
}
