import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { emptyPlayerStats, type PlayerStats } from "@shared/types";
import { getStats } from "../api";
import { useAuth } from "../useAuth";
import { IconGear, IconTrophy } from "./PartyArt";
import { transitionNavigate } from "../transition";

function formatCount(n: number) {
  return n.toLocaleString();
}

export function StatsOverviewCard({ onRegister }: { onRegister: () => void }) {
  const auth = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<PlayerStats | null>(null);

  useEffect(() => {
    if (!auth.user) {
      setStats(emptyPlayerStats());
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

  const board = stats || emptyPlayerStats();

  function openStats() {
    transitionNavigate(navigate, "/account/stats");
  }

  const content = (
    <>
      <div className="play-hero">
        <span className="extras-hero-ico" aria-hidden>
          <IconTrophy />
        </span>
        <div>
          <span className="lime-title">Your stats</span>
          <span className="play-copy">
            {auth.user
              ? "Wins, points, and trophies from finished games."
              : "Register to keep wins, points, and trophies on this account."}
          </span>
        </div>
        {auth.user && (
          <span className="extras-card-go" aria-hidden>
            ›
          </span>
        )}
      </div>
      <div className="stats-overall">
        <div className="stat-tile">
          <b>{formatCount(board.wins)}</b>
          <span>{board.wins === 1 ? "win" : "wins"}</span>
        </div>
        <div className="stat-tile">
          <b>{formatCount(board.points)}</b>
          <span>{board.points === 1 ? "point" : "points"} (all time)</span>
        </div>
        <div className="stat-tile">
          <b>{formatCount(board.trophies)}</b>
          <span>trophies won</span>
        </div>
      </div>
    </>
  );

  if (auth.user) {
    return (
      <button
        type="button"
        className="g-card play-card extras-card extras-card-btn"
        onClick={openStats}
      >
        {content}
      </button>
    );
  }

  return (
    <section className="g-card play-card extras-card">
      {content}
      <button className="start-btn alt" type="button" onClick={onRegister}>
        Register
      </button>
    </section>
  );
}

export function GameSettingsCard() {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      className="g-card play-card extras-card extras-card-btn extras-card-compact"
      onClick={() => transitionNavigate(navigate, "/settings")}
    >
      <div className="play-hero">
        <span className="extras-hero-ico" aria-hidden>
          <IconGear />
        </span>
        <div>
          <span className="lime-title">Game settings</span>
          <span className="play-copy">Volume, lobby, and rounds.</span>
        </div>
        <span className="extras-card-go" aria-hidden>
          ›
        </span>
      </div>
    </button>
  );
}

export function CreditsCard() {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      className="g-card play-card extras-card extras-card-btn extras-card-compact credits-card"
      onClick={() => transitionNavigate(navigate, "/credits")}
    >
      <div className="play-hero">
        <span className="extras-hero-ico" aria-hidden>
          <svg viewBox="0 0 24 24">
            <path
              fill="currentColor"
              d="M12 2 13.7 8.3 20 10l-6.3 1.7L12 18l-1.7-6.3L4 10l6.3-1.7L12 2zm7.2 12.2 1.1 3.8 3.7 1.1-3.7 1.1-1.1 3.8-1.1-3.8-3.7-1.1 3.7-1.1 1.1-3.8zM3.8 14.5l.8 2.8 2.7.8-2.7.8-.8 2.8-.8-2.8-2.7-.8 2.7-.8.8-2.8z"
            />
          </svg>
        </span>
        <div>
          <span className="lime-title">Credits</span>
          <span className="play-copy">The people and catalogues behind Aux Party.</span>
        </div>
        <span className="extras-card-go" aria-hidden>
          ›
        </span>
      </div>
    </button>
  );
}
