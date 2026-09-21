import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { MAX_ROUNDS, MIN_ROUNDS } from "@shared/types";
import AccountShell from "../components/AccountShell";
import BackButton, { PLAY_HOME } from "../components/BackButton";
import Dropdown from "../components/Dropdown";
import { setMasterVolume } from "../audio";
import { loadPrefs, savePrefs } from "../prefs";
import { transitionNavigate } from "../transition";

const SECTIONS = [
  { id: "audio", label: "Audio" },
  { id: "room", label: "Room settings" },
  { id: "rounds", label: "Rounds" },
] as const;

export default function SettingsPage() {
  const navigate = useNavigate();
  const [prefs, setPrefs] = useState(loadPrefs);
  const [section, setSection] = useState<(typeof SECTIONS)[number]["id"]>("audio");

  function update(patch: Partial<typeof prefs>) {
    const next = savePrefs(patch);
    setPrefs(next);
    if (patch.volume !== undefined) setMasterVolume(next.volume / 100);
  }

  function goHome(event: { preventDefault: () => void }) {
    event.preventDefault();
    transitionNavigate(navigate, PLAY_HOME);
  }

  return (
    <AccountShell>
      <div className="settings-shell">
        <nav className="settings-nav" aria-label="Settings">
          {SECTIONS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={section === item.id ? "on" : ""}
              onClick={() => setSection(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <section className="g-card account-card settings-card">
          <h1 className="lime-title">Game settings</h1>
          <p className="play-copy">Saved on this browser for the next party.</p>
          {section === "audio" && (
            <div className="field">
              <label htmlFor="ingame-volume">In-game volume</label>
              <div className="volume-row">
                <input
                  id="ingame-volume"
                  className="volume-slider"
                  type="range"
                  min={0}
                  max={100}
                  value={prefs.volume}
                  onChange={(event) => update({ volume: Number(event.target.value) })}
                />
                <span className="volume-value">{prefs.volume}%</span>
              </div>
            </div>
          )}
          {section === "room" && (
            <div className="field">
              <label>Default lobby</label>
              <Dropdown
                value={prefs.privateLobby ? "private" : "public"}
                options={[
                  { value: "private", label: "Private" },
                  { value: "public", label: "Public" },
                ]}
                onChange={(value) => update({ privateLobby: value === "private" })}
              />
            </div>
          )}
          {section === "rounds" && (
            <div className="field rounds-field">
              <label>Default rounds</label>
              <div className="rounds-picker">
                <button
                  className="rounds-step"
                  type="button"
                  aria-label="Fewer rounds"
                  disabled={prefs.rounds <= MIN_ROUNDS}
                  onClick={() => update({ rounds: prefs.rounds - 1 })}
                >
                  −
                </button>
                <input
                  className="nick-input rounds-input"
                  inputMode="numeric"
                  value={prefs.rounds}
                  onChange={(event) => {
                    const n = Number(event.target.value);
                    if (!event.target.value) return;
                    if (Number.isFinite(n)) update({ rounds: n });
                  }}
                />
                <button
                  className="rounds-step"
                  type="button"
                  aria-label="More rounds"
                  disabled={prefs.rounds >= MAX_ROUNDS}
                  onClick={() => update({ rounds: prefs.rounds + 1 })}
                >
                  +
                </button>
              </div>
            </div>
          )}
          <button className="start-btn settings-done" type="button" onClick={goHome}>
            Save settings
          </button>
          <BackButton to={PLAY_HOME}>Back to Aux Party</BackButton>
        </section>
      </div>
    </AccountShell>
  );
}
