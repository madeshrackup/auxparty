import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ACHIEVEMENTS, ACHIEVEMENT_SECTIONS, type AchievementId } from "@shared/types";
import { getAchievements } from "../api";
import AccountShell from "../components/AccountShell";
import TrophyBadge from "../components/TrophyBadge";
import { useAuth } from "../useAuth";

export default function AchievementsPage() {
  const auth = useAuth();
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
  const description = useMemo(() => {
    if (selected.id === "maestro" && !unlocked) {
      return `${selected.description} ${Math.min(wins, 100)}/100.`;
    }
    return selected.description;
  }, [selected, unlocked, wins]);

  return (
    <AccountShell showMenu>
      <section className="g-card achievements-card">
        <div className="achieve-top">
          <p className="lime-title">Achievements</p>
          <div className="achieve-progress">
            <span>Progress</span>
            <div className="achieve-progress-track">
              <i style={{ width: `${ACHIEVEMENTS.length ? (earned / ACHIEVEMENTS.length) * 100 : 0}%` }} />
            </div>
            <b>
              {earned}/{ACHIEVEMENTS.length}
            </b>
          </div>
          <Link to="/" className="achieve-close" viewTransition aria-label="Close achievements">
            ×
          </Link>
        </div>

        <div className="achieve-featured">
          <TrophyBadge id={selected.id} name={selected.name} unlocked={unlocked} selected size={118} />
          <div>
            <p className={`achieve-name ${unlocked ? "on" : ""}`}>{selected.name}</p>
            <p className="play-copy">{description}</p>
            {!auth.user && selected.id === "welcome" && (
              <p className="hint">Register to earn this trophy.</p>
            )}
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
    </AccountShell>
  );
}
