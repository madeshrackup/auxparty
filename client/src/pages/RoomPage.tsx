import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { MIN_PLAYERS, MAX_ROUNDS, MIN_ROUNDS, BUZZER_CHARTS, GAME_MODE_BLURBS, GAME_MODE_LABELS, GAME_MODE_ORDER, type GameMode, type RoomPopup, type RoomState, type SocketAck, type Track } from "@shared/types";
import Artwork from "../components/Artwork";
import Avatar from "../components/Avatar";
import Dropdown from "../components/Dropdown";
import Scoreboard from "../components/Scoreboard";
import TimerBar from "../components/TimerBar";
import TrackSearch from "../components/TrackSearch";
import { pausePreview, playBuzz, playPreview, setMasterVolume, stopPreview, unlockAudio } from "../audio";
import { emitAck, emitLeave, getSocket } from "../socket";
import { useAuth } from "../useAuth";
import UserMenu from "../components/UserMenu";
import FriendsPanel from "../components/FriendsPanel";
import BackButton from "../components/BackButton";
import { getAvatar } from "../identity";
import { runViewTransition } from "../transition";
import { IconCopy, IconGear, IconLink, IconLock, IconNote, IconPeople } from "../components/PartyArt";
import { loadPrefs, savePrefs } from "../prefs";

function sceneOf(phase: RoomState["phase"]) {
  if (phase === "lobby" || phase === "podium") return phase;
  if (phase === "classic_submit") return phase;
  if (phase.startsWith("classic")) return "classic_play";
  if (phase.startsWith("buzzer")) return "buzzer";
  if (phase === "impostor_submit") return phase;
  if (phase === "impostor_recap") return phase;
  if (phase.startsWith("impostor")) return "impostor_play";
  if (phase.startsWith("aux")) return phase;
  return phase;
}

const MODE_COPY: Record<GameMode, { title: string; body: string }> = {
  classic: { title: GAME_MODE_LABELS.classic, body: GAME_MODE_BLURBS.classic },
  buzzer: { title: GAME_MODE_LABELS.buzzer, body: GAME_MODE_BLURBS.buzzer },
  impostor: { title: GAME_MODE_LABELS.impostor, body: GAME_MODE_BLURBS.impostor },
  aux: { title: GAME_MODE_LABELS.aux, body: GAME_MODE_BLURBS.aux },
};

export default function RoomPage() {
  const { code = "" } = useParams();
  const auth = useAuth();
  const navigate = useNavigate();
  const [state, setState] = useState<RoomState | null>(null);
  const [toast, setToast] = useState("");
  const [joining, setJoining] = useState(true);
  const [quitOpen, setQuitOpen] = useState(false);
  const sceneRef = useRef<string | null>(null);
  const joiningRef = useRef(true);

  const name = auth.displayName.trim();
  const photo = auth.user?.avatarUrl;
  const playToken = auth.playToken;
  const asGuest = !auth.user;

  useEffect(() => {
    if (!auth.ready) return;
    if (name.length < 2) {
      setJoining(false);
      return;
    }
    unlockAudio();
    const sock = getSocket(name, asGuest, photo, playToken);
    const onState = (next: RoomState) => {
      const nextScene = sceneOf(next.phase);
      const prevScene = sceneRef.current;
      sceneRef.current = nextScene;
      const animate = !joiningRef.current && prevScene !== nextScene;
      if (animate) runViewTransition(() => setState(next));
      else setState(next);
    };
    sock.on("room:state", onState);
    let cancelled = false;
    const joinRoom = () => {
      void (async () => {
        try {
          const res = await emitAck<SocketAck>(sock, "room:join", {
            code: code.toUpperCase(),
            name,
            avatar: getAvatar(),
          });
          if (cancelled) return;
          if (!res.ok) throw new Error(res.error || "Join failed.");
        } catch (err) {
          if (cancelled || !joiningRef.current) return;
          setToast(err instanceof Error ? err.message : "Join failed.");
          setTimeout(() => navigate("/", { viewTransition: true }), 1400);
        } finally {
          if (!cancelled && joiningRef.current) {
            joiningRef.current = false;
            runViewTransition(() => setJoining(false));
          }
        }
      })();
    };
    sock.on("connect", joinRoom);
    if (sock.connected) joinRoom();
    return () => {
      cancelled = true;
      sock.off("room:state", onState);
      sock.off("connect", joinRoom);
    };
  }, [asGuest, auth.ready, code, name, navigate, photo, playToken]);

  useEffect(() => {
    return () => {
      emitLeave();
    };
  }, [code]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2800);
    return () => clearTimeout(t);
  }, [toast]);

  const preview = useMemo(() => {
    if (!state) return null;
    if (state.classic?.track && state.phase === "classic_playing") {
      return {
        url: state.classic.track.previewUrl,
        startedAt: state.classic.playStartedAt,
        serverNow: state.serverNow,
        paused: false,
      };
    }
    if (state.buzzer?.track && (state.phase === "buzzer_playing" || state.phase === "buzzer_buzzed")) {
      return {
        url: state.buzzer.track.previewUrl,
        startedAt: state.buzzer.playStartedAt,
        serverNow: state.serverNow,
        paused: state.phase === "buzzer_buzzed",
      };
    }
    if (state.impostor?.track && state.phase === "impostor_playing") {
      return {
        url: state.impostor.track.previewUrl,
        startedAt: state.impostor.playStartedAt,
        serverNow: state.serverNow,
        paused: false,
      };
    }
    if (state.phase === "aux_listen" && state.aux?.entries) {
      const entry = state.aux.entries[state.aux.listenIndex];
      if (entry) {
        return {
          url: entry.track.previewUrl,
          startedAt: state.aux.listenStartedAt,
          serverNow: state.serverNow,
          paused: false,
        };
      }
    }
    return null;
  }, [state]);

  useEffect(() => {
    if (!preview?.url || !preview.startedAt) {
      stopPreview();
      return;
    }
    if (preview.paused) {
      pausePreview();
      return;
    }
    playPreview(preview.url, preview.startedAt, preview.serverNow);
    return () => pausePreview();
  }, [preview?.url, preview?.startedAt, preview?.paused]);

  useEffect(() => () => stopPreview(), []);

  useEffect(() => {
    if (!quitOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setQuitOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [quitOpen]);

  async function send(event: string, payload?: unknown, timeoutMs = 15000) {
    try {
      const sock = getSocket(name, asGuest, photo, playToken);
      const res = await emitAck<SocketAck>(sock, event, payload, timeoutMs);
      if (!res.ok) setToast(res.error || "That didn't work.");
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Network error.");
    }
  }

  function confirmQuit() {
    stopPreview();
    emitLeave();
    setQuitOpen(false);
    navigate("/", { viewTransition: true });
  }

  if (!auth.ready || joining) {
    return (
      <div className="page">
        <p className="screen-stage hint">Dropping into {code.toUpperCase()}…</p>
      </div>
    );
  }

  if (name.length < 2) {
    return (
      <div className="page">
        <div className="screen-stage">
          <p>Set a guest name or log in before joining.</p>
          <Link to="/" viewTransition>
            Back
          </Link>
        </div>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="page">
        <p className="screen-stage hint">Waiting for the room…</p>
      </div>
    );
  }

  const youHost = state.youId === state.hostId;

  return (
    <div className="page">
      <header className="topbar">
        <Link
          to="/"
          className="brand compact"
          onClick={(event) => {
            event.preventDefault();
            setQuitOpen(true);
          }}
        >
          <span className="brand-mark" aria-hidden />
          <h1 className="brand-name">AUX PARTY</h1>
          <span className="brand-tag">ROOM {state.code}</span>
        </Link>
        {auth.user ? (
          <UserMenu />
        ) : (
          <span className="you-chip">
            <Avatar id={getAvatar()} size={28} />
            {auth.displayName}
          </span>
        )}
      </header>

      <div className="screen-stage" key={sceneOf(state.phase)}>
        {state.phase === "lobby" && (
          <Lobby state={state} youHost={youHost} onSend={send} />
        )}
        {state.phase.startsWith("classic") && (
          <ClassicView state={state} onSend={send} />
        )}
        {state.phase.startsWith("buzzer") && (
          <BuzzerView state={state} onSend={send} />
        )}
        {state.phase.startsWith("impostor") && (
          <ImpostorView state={state} onSend={send} />
        )}
        {state.phase.startsWith("aux") && <AuxView state={state} onSend={send} />}
        {state.phase === "podium" && <Podium state={state} youHost={youHost} onSend={send} />}
      </div>

      {toast && <div className="toast">{toast}</div>}
      <PenaltyPopup popup={state.popup} />
      {quitOpen && (
        <div className="modal-back" onClick={() => setQuitOpen(false)}>
          <div
            className="panel quit-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="quit-title"
            aria-describedby="quit-copy"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="kicker">Leave party</div>
            <h2 id="quit-title">Quit the game?</h2>
            <p className="hint" id="quit-copy">
              Are you sure you want to exit and quit the game?
            </p>
            <div className="row quit-actions">
              <button className="btn btn-ghost" type="button" onClick={() => setQuitOpen(false)}>
                Stay
              </button>
              <button className="btn btn-danger" type="button" onClick={confirmQuit}>
                Quit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PenaltyPopup({ popup }: { popup: RoomPopup | null }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!popup) {
      setOpen(false);
      return;
    }
    setOpen(true);
    const timer = setTimeout(() => setOpen(false), 2800);
    return () => clearTimeout(timer);
  }, [popup?.id]);
  if (!open || !popup) return null;
  return <div className="toast penalty-toast">{popup.message}</div>;
}

function RoundsField({
  value,
  onCommit,
}: {
  value: number;
  onCommit: (total: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  function clamp(n: number) {
    return Math.min(MAX_ROUNDS, Math.max(MIN_ROUNDS, Math.round(n)));
  }

  function commit(raw: string) {
    const n = Number(raw);
    if (!Number.isFinite(n)) {
      setDraft(String(value));
      return;
    }
    const next = clamp(n);
    setDraft(String(next));
    if (next !== value) onCommit(next);
  }

  return (
    <div className="field rounds-field">
      <label>Rounds</label>
      <div className="rounds-picker">
        <button
          className="rounds-step"
          type="button"
          aria-label="Fewer rounds"
          disabled={value <= MIN_ROUNDS}
          onClick={() => onCommit(clamp(value - 1))}
        >
          −
        </button>
        <input
          className="nick-input rounds-input"
          inputMode="numeric"
          min={MIN_ROUNDS}
          max={MAX_ROUNDS}
          value={draft}
          onChange={(event) => setDraft(event.target.value.replace(/[^\d]/g, ""))}
          onBlur={() => commit(draft)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commit(draft);
            }
          }}
        />
        <button
          className="rounds-step"
          type="button"
          aria-label="More rounds"
          disabled={value >= MAX_ROUNDS}
          onClick={() => onCommit(clamp(value + 1))}
        >
          +
        </button>
      </div>
    </div>
  );
}

function Lobby({
  state,
  youHost,
  onSend,
}: {
  state: RoomState;
  youHost: boolean;
  onSend: (event: string, payload?: unknown, timeoutMs?: number) => void;
}) {
  const connected = state.players.filter((p) => p.connected).length;
  const minPlayers = MIN_PLAYERS[state.mode];
  const canStart = connected >= minPlayers;
  const [tab, setTab] = useState<"party" | "settings">("party");
  const [playlistUrl, setPlaylistUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [volume, setVolume] = useState(() => loadPrefs().volume);
  const customMix = state.mode === "buzzer" && state.buzzerChart === "custom";
  const needed = Math.max(0, minPlayers - connected);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(state.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="grid-2 lobby-grid">
      <div className="panel">
        <div className="lobby-tabs">
          <button
            type="button"
            className={`lobby-tab ${tab === "party" ? "on" : ""}`}
            onClick={() => setTab("party")}
          >
            <IconPeople /> Party
          </button>
          <button
            type="button"
            className={`lobby-tab ${tab === "settings" ? "on" : ""}`}
            onClick={() => setTab("settings")}
          >
            <IconGear /> Game settings
          </button>
        </div>

        {tab === "settings" ? (
          <div className="lobby-settings">
            <div className="kicker">Game settings</div>
            <h2>Tune this party</h2>
            <p className="hint">Pick a mode, rounds, audio, and who can join.</p>
            <div className="mode-pick-grid">
              {GAME_MODE_ORDER.map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={`mode-pick-card ${state.mode === mode ? "on" : ""}`}
                  disabled={!youHost}
                  onClick={() => youHost && onSend("room:set-mode", { mode })}
                >
                  <b>{GAME_MODE_LABELS[mode]}</b>
                  <span>{GAME_MODE_BLURBS[mode]}</span>
                </button>
              ))}
            </div>
            <div className="field">
              <label htmlFor="lobby-volume">In-game volume</label>
              <div className="volume-row">
                <input
                  id="lobby-volume"
                  className="volume-slider"
                  type="range"
                  min={0}
                  max={100}
                  value={volume}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    setVolume(next);
                    savePrefs({ volume: next });
                    setMasterVolume(next / 100);
                  }}
                />
                <span className="volume-value">{volume}%</span>
              </div>
            </div>
            <div className="field" style={{ marginTop: 16 }}>
              <label>Lobby</label>
              <Dropdown
                value={state.isPrivate ? "private" : "public"}
                options={[
                  { value: "private", label: "Private" },
                  { value: "public", label: "Public" },
                ]}
                onChange={(value) => youHost && onSend("room:set-private", { isPrivate: value === "private" })}
                disabled={!youHost}
              />
              <p className="hint" style={{ marginTop: 8 }}>
                {state.isPrivate
                  ? "Friends need this code or an invite to join."
                  : "Friends can join this party from your friends list."}
              </p>
            </div>
            <div style={{ marginTop: 16 }}>
              {youHost ? (
                <RoundsField
                  value={state.totalRounds}
                  onCommit={(total) => onSend("room:set-rounds", { total })}
                />
              ) : (
                <p className="hint">
                  This party is set to {state.totalRounds} {state.totalRounds === 1 ? "round" : "rounds"}.
                </p>
              )}
            </div>
            {state.mode === "buzzer" && (
              <div style={{ marginTop: 20 }}>
                <div className="field">
                  <label>Chart</label>
                  <Dropdown
                    value={state.buzzerChart}
                    options={BUZZER_CHARTS.map((chart) => ({ value: chart.id, label: chart.label }))}
                    onChange={(chart) => youHost && onSend("room:set-chart", { chart })}
                    disabled={!youHost}
                  />
                </div>
                {customMix && (
                  <>
                    <p className="hint" style={{ marginTop: 10 }}>
                      Paste public Spotify or Apple Music playlist links.
                    </p>
                    {youHost && (
                      <form
                        className="row"
                        style={{ marginTop: 12 }}
                        onSubmit={(event) => {
                          event.preventDefault();
                          const url = playlistUrl.trim();
                          if (!url) return;
                          onSend("room:add-playlist", { url }, 60000);
                          setPlaylistUrl("");
                        }}
                      >
                        <div className="field" style={{ flex: 1 }}>
                          <label>Playlist link</label>
                          <input
                            value={playlistUrl}
                            placeholder="Spotify or Apple Music playlist URL"
                            onChange={(e) => setPlaylistUrl(e.target.value)}
                          />
                        </div>
                        <button className="btn btn-gold" type="submit">
                          Add
                        </button>
                      </form>
                    )}
                    <div className="queue" style={{ marginTop: 12 }}>
                      {state.buzzerPlaylists.map((playlist) => (
                        <div key={playlist.url} className="player">
                          <span>
                            {playlist.label}
                            <span className="hint"> · {playlist.trackCount} tracks</span>
                          </span>
                          {youHost && (
                            <button
                              className="btn btn-ghost"
                              type="button"
                              onClick={() => onSend("room:remove-playlist", { url: playlist.url })}
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
            <button className="start-btn settings-done" type="button" onClick={() => setTab("party")}>
              Done
            </button>
          </div>
        ) : (
          <>
            <div className="share-head">
              <IconLink />
              <p className="kicker">Share this code</p>
            </div>
            <div className="code-row">
              <div className="room-code">{state.code}</div>
              <button
                className={`copy-code-btn ${copied ? "copied" : ""}`}
                type="button"
                onClick={() => void copyCode()}
              >
                <IconCopy /> {copied ? "Copied!" : "Copy Code"}
              </button>
            </div>
            <div className="mode-lock">
              <div className="mode-lock-head">
                <span className="mode-ico" aria-hidden>
                  <IconNote />
                </span>
                <div>
                  <span className="kicker playing-dot">Playing</span>
                  <strong>{MODE_COPY[state.mode].title}</strong>
                </div>
              </div>
              <p>{MODE_COPY[state.mode].body}</p>
            </div>
            <p className="lobby-meta">
              <span className="lobby-chip">
                <IconLock />
                {state.isPrivate ? "Private lobby" : "Public lobby"}
              </span>
              <span className="lobby-chip">
                {state.totalRounds} {state.totalRounds === 1 ? "round" : "rounds"}
              </span>
              {state.mode === "buzzer" ? (
                <span className="lobby-chip">
                  {BUZZER_CHARTS.find((chart) => chart.id === state.buzzerChart)?.label || "Chart"}
                </span>
              ) : null}
            </p>
            {youHost ? (
              <button
                className="start-btn lobby-cta"
                type="button"
                disabled={!canStart}
                onClick={() => onSend("game:start")}
              >
                Let's Party!
              </button>
            ) : (
              <p className="hint" style={{ marginTop: 16 }}>
                Waiting for the host to start.
              </p>
            )}
            {youHost && !canStart && (
              <p className="hint" style={{ marginTop: 10 }}>
                Wait for {needed} more {needed === 1 ? "player" : "players"} to join. This mode needs {minPlayers}.
              </p>
            )}
          </>
        )}
      </div>
      <div className="lobby-side">
        <Scoreboard players={state.players} youId={state.youId} />
        <FriendsPanel compact canInvite />
      </div>
    </div>
  );
}

function ClassicView({
  state,
  onSend,
}: {
  state: RoomState;
  onSend: (event: string, payload?: unknown) => void;
}) {
  const [title, setTitle] = useState("");
  const classic = state.classic;
  const youHost = state.youId === state.hostId;
  const connected = state.players.filter((p) => p.connected).length;

  useEffect(() => {
    setTitle("");
  }, [state.phase, classic?.clipIndex]);

  if (state.phase === "classic_submit") {
    return (
      <div className="game-layout">
        <div className="panel">
          <div className="kicker">
            Classic · Pick {state.round}/{state.totalRounds}
          </div>
          <h2>You have 30 seconds to pick a song</h2>
          <p className="hint">
            Everyone picks one track. Miss the window and it's -15pts.
          </p>
          <TimerBar
            endsAt={state.timerEndsAt}
            duration={state.timerDurationMs || 30000}
            serverNow={state.serverNow}
          />
          {classic?.yourSubmission ? (
            <p>
              Locked in: {classic.yourSubmission.title} — {classic.yourSubmission.artist}
            </p>
          ) : (
            <TrackSearch onPick={(track) => onSend("game:submit-track", { track })} />
          )}
          <p className="hint">
            Submitted {classic?.submittedIds.length || 0}/{connected}
          </p>
        </div>
        <Scoreboard players={state.players} youId={state.youId} deltas={state.lastDeltas} />
      </div>
    );
  }

  const reveal = state.phase === "classic_reveal";
  const playing = state.phase === "classic_playing";

  return (
    <div className="game-layout">
      <div className="panel stage">
        <div className="kicker">
          Classic · Round {state.round}/{state.totalRounds}
          {classic && classic.clipTotal > 0
            ? ` · clip ${(classic.clipIndex || 0) + 1}/${classic.clipTotal}`
            : ""}
        </div>
        <Artwork
          src={classic?.track?.artworkUrl}
          spinning={playing}
          blurred={!reveal}
        />
        <TimerBar
          endsAt={state.timerEndsAt}
          duration={state.timerDurationMs || 30000}
          serverNow={state.serverNow}
        />
        {reveal ? (
          <>
            <h2>
              {classic?.track?.title}
              <div className="hint">{classic?.track?.artist}</div>
            </h2>
            {classic?.yourPoints != null && (
              <p className="delta">You scored {classic.yourPoints}</p>
            )}
            {youHost && (
              <button className="btn btn-primary" type="button" onClick={() => onSend("game:advance")}>
                Next
              </button>
            )}
          </>
        ) : classic?.isYours && connected > 1 ? (
          <p>You picked this one. Let them sweat.</p>
        ) : classic?.scored ? (
          <p className="delta">Locked in · +{classic.yourPoints} points</p>
        ) : (
          <form
            className="row"
            style={{ width: "100%" }}
            onSubmit={(e) => {
              e.preventDefault();
              onSend("game:guess", { title });
            }}
          >
            <div className="field">
              <label>Title</label>
              <input value={title} autoFocus onChange={(e) => setTitle(e.target.value)} />
            </div>
            <button className="btn btn-gold" type="submit">
              Guess
            </button>
            <p className="hint">Remaining seconds = your points. Wrong guesses keep the clock running.</p>
          </form>
        )}
      </div>
      <Scoreboard players={state.players} youId={state.youId} deltas={state.lastDeltas} />
    </div>
  );
}

function BuzzerView({
  state,
  onSend,
}: {
  state: RoomState;
  onSend: (event: string, payload?: unknown) => void;
}) {
  const [title, setTitle] = useState("");
  const buzzedLocally = useRef(false);
  const buzzer = state.buzzer;
  const you = state.youId;
  const answering = state.phase === "buzzer_buzzed";
  const buzzed = answering && buzzer?.buzzedBy === you;
  const eliminated = buzzer?.eliminated.includes(you);
  const playing = state.phase === "buzzer_playing";
  const reveal = state.phase === "buzzer_reveal";
  const youHost = state.youId === state.hostId;
  const buzzerName = state.players.find((p) => p.id === buzzer?.buzzedBy)?.name || "Someone";
  const timerEndsAt = answering
    ? buzzer?.buzzDeadline || state.timerEndsAt
    : playing && buzzer?.playStartedAt
      ? buzzer.playStartedAt + buzzer.previewMs
      : state.timerEndsAt;
  const timerDuration = answering
    ? buzzer?.answerMs || 10000
    : playing
      ? buzzer?.previewMs || 30000
      : state.timerDurationMs || 30000;

  useEffect(() => {
    setTitle("");
  }, [state.round, state.phase]);

  useEffect(() => {
    if (!answering) return;
    if (buzzed && buzzedLocally.current) {
      buzzedLocally.current = false;
      return;
    }
    buzzedLocally.current = false;
    playBuzz();
  }, [answering, buzzed, buzzer?.buzzDeadline]);

  return (
    <div className="game-layout">
      <div className="panel stage">
        <div className="kicker">
          Buzzer Beater · Round {state.round}/{state.totalRounds}
        </div>
        <Artwork src={buzzer?.track?.artworkUrl} spinning={playing} blurred={!reveal} />
        <TimerBar endsAt={timerEndsAt} duration={timerDuration} serverNow={state.serverNow} />
        {reveal ? (
          <>
            <h2>
              {buzzer?.track?.title}
              <div className="hint">{buzzer?.track?.artist}</div>
            </h2>
            {youHost && (
              <button className="btn btn-primary" type="button" onClick={() => onSend("game:advance")}>
                Next
              </button>
            )}
          </>
        ) : buzzed ? (
          <form
            className="row"
            style={{ width: "100%" }}
            onSubmit={(e) => {
              e.preventDefault();
              onSend("game:guess", { title });
            }}
          >
            <div className="field">
              <label>Title</label>
              <input value={title} autoFocus onChange={(e) => setTitle(e.target.value)} />
            </div>
            <button className="btn btn-gold" type="submit">
              Lock in
            </button>
            <p className="hint">Song paused. Type the title — you have 10 seconds.</p>
          </form>
        ) : (
          <>
            <p>
              {answering
                ? `${buzzerName} buzzed. Song paused.`
                : "Hit buzz when you know it."}
            </p>
            <button
              className="btn btn-buzz"
              type="button"
              disabled={!playing || eliminated}
              onClick={() => {
                playBuzz();
                buzzedLocally.current = true;
                onSend("game:buzz");
              }}
            >
              BUZZ
            </button>
            {eliminated && <p className="hint">You're out for this clip only. Next song you're back in.</p>}
          </>
        )}
      </div>
      <Scoreboard players={state.players} youId={state.youId} deltas={state.lastDeltas} />
    </div>
  );
}

function ImpostorView({
  state,
  onSend,
}: {
  state: RoomState;
  onSend: (event: string, payload?: unknown) => void;
}) {
  const impostor = state.impostor;
  const isYourTrack = Boolean(impostor?.isYours);
  const youHost = state.youId === state.hostId;
  const names = state.players.filter((p) => p.connected || p.id === state.youId);

  if (state.phase === "impostor_submit") {
    return (
      <div className="game-layout">
        <div className="panel">
          <div className="kicker">
            Who Added This? · Round {state.round}/{state.totalRounds}
          </div>
          <h2>Sneak a track into the pile</h2>
          <p className="hint">
            Any song. Everyone picks one, then the room guesses who added each clip — not the title.
          </p>
          <TimerBar
            endsAt={state.timerEndsAt}
            duration={state.timerDurationMs || 30000}
            serverNow={state.serverNow}
          />
          {impostor?.yourSubmission ? (
            <p>
              Locked in: {impostor.yourSubmission.title} — {impostor.yourSubmission.artist}
            </p>
          ) : (
            <TrackSearch onPick={(track) => onSend("game:submit-track", { track })} />
          )}
          <p className="hint">
            Submitted {impostor?.submittedIds.length || 0}/{state.players.filter((p) => p.connected).length}
          </p>
        </div>
        <Scoreboard players={state.players} youId={state.youId} deltas={state.lastDeltas} />
      </div>
    );
  }

  if (state.phase === "impostor_recap") {
    return (
      <div className="game-layout">
        <div className="panel">
          <div className="kicker">
            Who Added This? · Round {state.round}/{state.totalRounds}
          </div>
          <h2>Who added what?</h2>
          <p className="hint">Green means you nailed it. Red means you missed. Points just hit the scoreboard.</p>
          <TimerBar
            endsAt={state.timerEndsAt}
            duration={state.timerDurationMs || 12000}
            serverNow={state.serverNow}
          />
          <div className="impostor-recap-scroller">
            {impostor?.recap?.map((entry, index) => {
              const tone = entry.yours ? "yours" : entry.correct ? "ok" : "bad";
              return (
                <div key={`${entry.track.trackId}-${index}`} className={`impostor-recap-card ${tone}`}>
                  <img src={entry.track.artworkUrl} alt={`${entry.track.title} by ${entry.track.artist}`} loading="lazy" decoding="async" />
                  <strong className="impostor-recap-title">{entry.track.title}</strong>
                  {entry.yours ? (
                    <p className="impostor-recap-name">You</p>
                  ) : entry.correct ? (
                    <p className="impostor-recap-name">{entry.submitterName}</p>
                  ) : (
                    <>
                      <p className="impostor-recap-wrong">
                        <span aria-hidden>✕</span>
                        {entry.guessedName || "No guess"}
                      </p>
                      <p className="impostor-recap-actual">{entry.submitterName}</p>
                    </>
                  )}
                </div>
              );
            })}
          </div>
          {youHost && (
            <button className="btn btn-primary" type="button" onClick={() => onSend("game:advance")}>
              Continue
            </button>
          )}
        </div>
        <Scoreboard players={state.players} youId={state.youId} deltas={state.lastDeltas} />
      </div>
    );
  }

  const reveal = state.phase === "impostor_reveal";

  return (
    <div className="game-layout">
      <div className="panel stage">
        <div className="kicker">
          Who Added This? · Round {state.round}/{state.totalRounds}
          {impostor && impostor.clipTotal > 0
            ? ` · song ${(impostor.clipIndex || 0) + 1}/${impostor.clipTotal}`
            : ""}
        </div>
        <Artwork
          src={impostor?.track?.artworkUrl}
          spinning={state.phase === "impostor_playing"}
          blurred={!reveal}
        />
        <TimerBar
          endsAt={state.timerEndsAt}
          duration={state.timerDurationMs || 30000}
          serverNow={state.serverNow}
        />
        {reveal ? (
          <>
            <h2>
              {impostor?.track?.title}
              <div className="hint">{impostor?.track?.artist}</div>
            </h2>
            <p className="hint">Guesses are locked. Who added it stays secret until the round reveal.</p>
            {youHost && (
              <button className="btn btn-primary" type="button" onClick={() => onSend("game:advance")}>
                Next
              </button>
            )}
          </>
        ) : isYourTrack ? (
          <p>You added this one. No guessing for you — look innocent.</p>
        ) : impostor?.yourGuess ? (
          <p>
            Locked in {names.find((p) => p.id === impostor.yourGuess?.submitterId)?.name || "someone"}.
            Waiting on {Math.max(0, (impostor.guesserTotal || 0) - (impostor.guessedCount || 0))} more.
          </p>
        ) : (
          <div className="name-grid">
            <p className="hint">Who put this on?</p>
            {names
              .filter((p) => p.id !== state.youId)
              .map((player) => (
                <button
                  key={player.id}
                  type="button"
                  className="btn btn-gold name-guess"
                  onClick={() => onSend("game:guess-impostor", { submitterId: player.id })}
                >
                  {player.name}
                </button>
              ))}
          </div>
        )}
      </div>
      <Scoreboard players={state.players} youId={state.youId} deltas={state.lastDeltas} />
    </div>
  );
}

function AuxView({
  state,
  onSend,
}: {
  state: RoomState;
  onSend: (event: string, payload?: unknown) => void;
}) {
  const [theme, setTheme] = useState("");
  const aux = state.aux;
  const setter = state.players.find((p) => p.id === aux?.themeSetterId);
  const isDj = state.youId === aux?.themeSetterId;
  const youHost = state.youId === state.hostId;
  const current = aux?.entries?.[aux.listenIndex];

  if (state.phase === "aux_theme") {
    return (
      <div className="game-layout">
        <div className="panel">
          <div className="kicker">
            Pass the Aux · Round {state.round}/{state.totalRounds}
          </div>
          <h2>{isDj ? "You're the DJ this round" : `${setter?.name || "Someone"} is the DJ`}</h2>
          {isDj ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                onSend("game:theme", { theme });
              }}
            >
              <p className="hint">
                Only you set the prompt. After that, you still pick a song and vote with everyone else.
              </p>
              <div className="field">
                <label>Theme</label>
                <input
                  value={theme}
                  placeholder="songs about rain, 2014 gym, villain era…"
                  onChange={(e) => setTheme(e.target.value)}
                />
              </div>
              <button className="btn btn-primary" type="submit" style={{ marginTop: 12 }}>
                Drop the theme
              </button>
            </form>
          ) : (
            <p>Waiting for {setter?.name || "the DJ"} to set this round's prompt. Only they can choose it.</p>
          )}
        </div>
        <Scoreboard players={state.players} youId={state.youId} deltas={state.lastDeltas} />
      </div>
    );
  }

  if (state.phase === "aux_submit") {
    return (
      <div className="game-layout">
        <div className="panel">
          <div className="kicker">Theme</div>
          <h2>{aux?.theme}</h2>
          <p className="hint">Everyone picks a track for this theme, including the DJ. Miss the 30 seconds and it's -15pts.</p>
          <TimerBar
            endsAt={state.timerEndsAt}
            duration={state.timerDurationMs || 30000}
            serverNow={state.serverNow}
          />
          {aux?.yourSubmission ? (
            <p>
              Your pick: {aux.yourSubmission.title} — {aux.yourSubmission.artist}
            </p>
          ) : (
            <TrackSearch
              placeholder="Find a track that fits"
              onPick={(track: Track) => onSend("game:submit-track", { track })}
            />
          )}
          <p className="hint">
            Submitted {aux?.submittedIds.length || 0}/{state.players.filter((p) => p.connected).length}
          </p>
        </div>
        <Scoreboard players={state.players} youId={state.youId} deltas={state.lastDeltas} />
      </div>
    );
  }

  if (state.phase === "aux_listen") {
    return (
      <div className="game-layout">
        <div className="panel stage">
          <div className="kicker">
            Listening · {aux ? aux.listenIndex + 1 : 0}/{aux?.entries?.length || 0}
          </div>
          <h2>{aux?.theme}</h2>
          <Artwork src={current?.track.artworkUrl} spinning />
          <TimerBar
            endsAt={state.timerEndsAt}
            duration={state.timerDurationMs || 18000}
            serverNow={state.serverNow}
          />
          <p>
            {current?.track.title} — {current?.track.artist}
            <span className="hint"> added by {current?.playerName}</span>
          </p>
          {youHost && (
            <button className="btn btn-ghost" type="button" onClick={() => onSend("game:advance")}>
              Skip clip
            </button>
          )}
        </div>
        <Scoreboard players={state.players} youId={state.youId} deltas={state.lastDeltas} />
      </div>
    );
  }

  if (state.phase === "aux_vote") {
    const runoff = aux?.runoffIds;
    const ballot = runoff?.length
      ? aux?.entries?.filter((entry) => runoff.includes(entry.playerId))
      : aux?.entries;
    return (
      <div className="game-layout">
        <div className="panel">
          <h2>{runoff?.length ? "Tie-breaker" : "Who earned the aux?"}</h2>
          <p className="hint">
            {runoff?.length
              ? `It's a draw. Vote again between the tied tracks. You still can't vote for yourself. Theme: ${aux?.theme}`
              : `Everyone votes, including the DJ. You just can't vote for your own track. Theme: ${aux?.theme}`}
          </p>
          <div className="vote-grid">
            {ballot?.map((entry) => (
              <button
                key={entry.playerId}
                type="button"
                className={`vote-card ${aux?.yourVote === entry.playerId ? "mine" : ""}`}
                disabled={entry.playerId === state.youId}
                onClick={() => onSend("game:vote", { playerId: entry.playerId })}
              >
                <img src={entry.track.artworkUrl} alt={`${entry.track.title} artwork`} loading="lazy" decoding="async" />
                <strong>{entry.track.title}</strong>
                <div className="hint">{entry.playerName}</div>
              </button>
            ))}
          </div>
          <p className="hint">
            Votes in {aux?.votedCount ?? 0}/{aux?.voterTotal ?? 0}
          </p>
        </div>
        <Scoreboard players={state.players} youId={state.youId} deltas={state.lastDeltas} />
      </div>
    );
  }

  const winner = state.players.find((p) => p.id === aux?.winnerId);
  return (
    <div className="game-layout">
      <div className="panel stage">
        <div className="kicker">Aux awarded</div>
        <h2>
          {aux?.uncontested
            ? `${winner?.name || "Someone"} takes the aux uncontested`
            : `${winner?.name || "Someone"} keeps the cord`}
        </h2>
        <p className="hint">
          {aux?.uncontested
            ? "Only one track was submitted, so they get the points and the aux."
            : aux?.theme}
        </p>
        <TimerBar
          endsAt={state.timerEndsAt}
          duration={state.timerDurationMs || 10000}
          serverNow={state.serverNow}
        />
        <div className="vote-grid">
          {aux?.entries
            ?.slice()
            .sort((a, b) => b.votes - a.votes)
            .map((entry) => (
              <div
                key={entry.playerId}
                className={`vote-card ${entry.playerId === aux.winnerId ? "mine" : ""}`}
              >
                <img src={entry.track.artworkUrl} alt={`${entry.track.title} artwork`} loading="lazy" decoding="async" />
                <strong>{entry.track.title}</strong>
                <div className="hint">
                  {entry.playerName}
                  {aux.uncontested
                    ? " · uncontested"
                    : ` · ${entry.votes} vote${entry.votes === 1 ? "" : "s"}`}
                </div>
              </div>
            ))}
        </div>
        {youHost && (
          <button className="btn btn-primary" type="button" onClick={() => onSend("game:advance")}>
            Continue
          </button>
        )}
      </div>
      <Scoreboard players={state.players} youId={state.youId} deltas={state.lastDeltas} />
    </div>
  );
}

function Podium({
  state,
  youHost,
  onSend,
}: {
  state: RoomState;
  youHost: boolean;
  onSend: (event: string, payload?: unknown) => void;
}) {
  const ranked = [...state.players].sort((a, b) => b.score - a.score);
  const top = ranked.slice(0, 3);
  return (
    <div className="panel" style={{ textAlign: "center" }}>
      <div className="kicker">Final</div>
      <h2>Podium</h2>
      <div className="podium">
        {top[1] && (
          <div className="place second">
            <div>2</div>
            <strong>{top[1].name}</strong>
            <div>{top[1].score}</div>
          </div>
        )}
        {top[0] && (
          <div className="place first">
            <div>1</div>
            <strong>{top[0].name}</strong>
            <div>{top[0].score}</div>
          </div>
        )}
        {top[2] && (
          <div className="place third">
            <div>3</div>
            <strong>{top[2].name}</strong>
            <div>{top[2].score}</div>
          </div>
        )}
      </div>
      {youHost && (
        <BackButton onClick={() => onSend("game:lobby")}>Back to lobby</BackButton>
      )}
    </div>
  );
}
