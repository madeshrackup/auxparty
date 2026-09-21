import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ACHIEVEMENTS, ACHIEVEMENT_SECTIONS, type AchievementId } from "@shared/types";
import { getAchievements } from "../api";
import AccountShell from "../components/AccountShell";
import BackButton, { PLAY_HOME } from "../components/BackButton";
import { IconLock } from "../components/PartyArt";
import TrophyBadge from "../components/TrophyBadge";
import { resetSocket } from "../socket";
import { transitionNavigate } from "../transition";
import { useAuth } from "../useAuth";

export default function AchievementsPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [picked, setPicked] = useState<AchievementId>("welcome");
  const [unlockedIds, setUnlockedIds] = useState<Set<AchievementId>>(new Set());
  const [wins, setWins] = useState(0);

  useEffect(() => {
    if (!auth.ready) return;
    if (!auth.user) {
      setUnlockedIds(new Set());
      setWins(0);
      return;
    }
    void getAchievements()
      .then((res) => {
        setWins(res.wins || 0);
        setUnlockedIds(new Set(res.unlocked.map((row) => row.id as AchievementId)));
      })
      .catch(() => {
        setUnlockedIds(new Set());
        setWins(0);
      });
  }, [auth.ready, auth.user]);

  const selected = ACHIEVEMENTS.find((item) => item.id === picked) || ACHIEVEMENTS[0];
  const unlocked = unlockedIds.has(selected.id);
  const earned = ACHIEVEMENTS.filter((item) => unlockedIds.has(item.id)).length;
  const how = useMemo(() => {
    if (selected.id === "maestro" && !unlocked) {
      return `${selected.how} ${Math.min(wins, 100)}/100.`;
    }
    return selected.how;
  }, [selected, unlocked, wins]);

  function goHome(event: { preventDefault: () => void }) {
    event.preventDefault();
    transitionNavigate(navigate, PLAY_HOME);
  }

  if (!auth.user) {
    return (
      <AccountShell>
        <section className="g-card achievements-card achievements-card-locked">
          <div className="achieve-top">
            <h1 className="lime-title">Aux Party Badges</h1>
            <Link to="/" className="achieve-close" aria-label="Close badges" onClick={goHome}>
              ×
            </Link>
          </div>
          <div className="friends-locked">
            <IconLock />
            <p className="friends-locked-copy">Only registered users have access to trophies!</p>
            <button
              className="start-btn alt"
              type="button"
              onClick={() => {
                resetSocket();
                navigate("/?signup=1");
              }}
            >
              Register
            </button>
          </div>
        </section>
        <BackButton to={PLAY_HOME}>Back to Aux Party</BackButton>
      </AccountShell>
    );
  }

  return (
    <AccountShell showMenu>
      <section className="g-card achievements-card">
        <div className="achieve-top">
          <h1 className="lime-title">Aux Party Badges</h1>
          <div className="achieve-progress">
            <span>Progress</span>
            <div className="achieve-progress-track">
              <i style={{ width: `${ACHIEVEMENTS.length ? (earned / ACHIEVEMENTS.length) * 100 : 0}%` }} />
            </div>
            <b>
              {earned}/{ACHIEVEMENTS.length}
            </b>
          </div>
          <Link to="/" className="achieve-close" aria-label="Close badges" onClick={goHome}>
            ×
          </Link>
        </div>

        <div className="achieve-featured">
          <TrophyBadge id={selected.id} name={selected.name} unlocked={unlocked} selected size={118} />
          <div>
            <p className={`achieve-name ${unlocked ? "on" : ""}`}>{selected.name}</p>
            <p className="play-copy">{selected.description}</p>
            <p className="achieve-how">{how}</p>
          </div>
        </div>

        {ACHIEVEMENT_SECTIONS.map((section) => {
          const items = ACHIEVEMENTS.filter((item) => item.section === section.id);
          if (items.length === 0) return null;
          return (
            <div key={section.id} className="achieve-section">
              <p className="achieve-section-title">{section.title}</p>
              <div className="achieve-grid">
                {items.map((item) => (
                  <TrophyBadge
                    key={item.id}
                    id={item.id}
                    name={item.name}
                    unlocked={unlockedIds.has(item.id)}
                    selected={picked === item.id}
                    onClick={() => setPicked(item.id)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </section>
      <BackButton to={PLAY_HOME}>Back to Aux Party</BackButton>
    </AccountShell>
  );
}
