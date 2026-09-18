import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { MIN_PLAYERS, type GameMode, type RoomState, type SocketAck, type Track } from "@shared/types";
import Artwork from "../components/Artwork";
import Dropdown from "../components/Dropdown";
import Scoreboard from "../components/Scoreboard";
import TimerBar from "../components/TimerBar";
import TrackSearch from "../components/TrackSearch";
import { playPreview, stopPreview, unlockAudio } from "../audio";
import { emitAck, getSocket } from "../socket";
import { useAuth } from "../useAuth";
import UserMenu from "../components/UserMenu";
import { getAvatar } from "../identity";
import { runViewTransition } from "../transition";

function sceneOf(phase: RoomState["phase"]) {
  if (phase === "lobby" || phase === "podium") return phase;
  if (phase === "classic_submit") return phase;
  if (phase.startsWith("classic")) return "classic_play";
  if (phase.startsWith("buzzer")) return "buzzer";
  if (phase === "impostor_submit") return phase;
  if (phase.startsWith("impostor")) return "impostor_play";
  if (phase.startsWith("aux")) return phase;
  return phase;
}

const MODE_COPY: Record<GameMode, { title: string; body: string }> = {
  classic: {
    title: "Classic",
    body: "Everyone has 30 seconds to pick a song. Then each clip plays and you race the clock — remaining seconds are your points.",
  },
  buzzer: {
    title: "Buzzer Beater",
    body: "Buzz in, then type the title before anyone else locks it.",
  },
  impostor: {
    title: "Who Added This?",
    body: "Everyone sneaks in a track. Guess the song and the culprit.",
  },
  aux: {
    title: "Pass the Aux",
    body: "One DJ sets the theme each round. Everyone — including the DJ — picks a track and votes.",
  },
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
        if (!cancelled) {
          setToast(err instanceof Error ? err.message : "Join failed.");
          setTimeout(() => navigate("/", { viewTransition: true }), 1400);
        }
      } finally {
        if (!cancelled) {
          joiningRef.current = false;
          runViewTransition(() => setJoining(false));
        }
      }
    })();
    return () => {
      cancelled = true;
      joiningRef.current = true;
      sceneRef.current = null;
      sock.off("room:state", onState);
      sock.emit("room:leave");
    };
  }, [asGuest, auth.ready, code, name, navigate, photo, playToken]);

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
      };
    }
    if (state.buzzer?.track && (state.phase === "buzzer_playing" || state.phase === "buzzer_buzzed")) {
      return {
        url: state.buzzer.track.previewUrl,
        startedAt: state.buzzer.playStartedAt,
      };
    }
    if (state.impostor?.track && state.phase === "impostor_playing") {
      return {
        url: state.impostor.track.previewUrl,
        startedAt: state.impostor.playStartedAt,
      };
    }
    if (state.phase === "aux_listen" && state.aux?.entries) {
      const entry = state.aux.entries[state.aux.listenIndex];
      if (entry) {
        return { url: entry.track.previewUrl, startedAt: state.aux.listenStartedAt };
      }
    }
    return null;
  }, [state]);

  useEffect(() => {
    if (!preview?.url || !preview.startedAt || !state) {
      stopPreview();
      return;
    }
    playPreview(preview.url, preview.startedAt, state.serverNow);
    return () => stopPreview();
  }, [preview?.url, preview?.startedAt, state?.serverNow]);

  useEffect(() => {
    if (!quitOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setQuitOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [quitOpen]);

  async function send(event: string, payload?: unknown) {
    try {
      const sock = getSocket(name, asGuest, photo, playToken);
      const res = await emitAck<SocketAck>(sock, event, payload);
      if (!res.ok) setToast(res.error || "That didn't work.");
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Network error.");
    }
  }

  function confirmQuit() {
    stopPreview();
    getSocket(name, asGuest, photo, playToken).emit("room:leave");
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
          <span className="brand-name">AUX PARTY</span>
          <span className="brand-tag">ROOM {state.code}</span>
        </Link>
        {auth.user ? <UserMenu /> : <span className="you-chip">{auth.displayName}</span>}
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
      {quitOpen && (
        <div className="modal-back" onClick={() => setQuitOpen(false)}>
          <div
            className="panel quit-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="quit-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="kicker">Leave party</div>
            <h2 id="quit-title">Quit the game?</h2>
            <p className="hint">Are you sure you want to exit and quit the game?</p>
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

function Lobby({
  state,
  youHost,
  onSend,
}: {
  state: RoomState;
  youHost: boolean;
  onSend: (event: string, payload?: unknown) => void;
}) {
  const connected = state.players.filter((p) => p.connected).length;
  const minPlayers = MIN_PLAYERS[state.mode];
  const canStart = connected >= minPlayers;
  return (
    <div className="grid-2">
      <div className="panel">
        <div className="kicker">Share this code</div>
        <div className="room-code">{state.code}</div>
        <p className="hint">Share this code so friends can drop in. The game mode is locked for this room.</p>
        <div className="mode-lock">
          <span className="kicker">Playing</span>
          <strong>{MODE_COPY[state.mode].title}</strong>
          <p>{MODE_COPY[state.mode].body}</p>
          <p className="hint">{minPlayers} players minimum</p>
        </div>
        {youHost && (
          <div className="row" style={{ marginTop: 16 }}>
            <div className="field" style={{ flex: "0 0 140px" }}>
              <label>Rounds</label>
              <Dropdown
                value={state.totalRounds}
                options={[
                  { value: 3, label: "3" },
                  { value: 5, label: "5" },
                  { value: 8, label: "8" },
                ]}
                onChange={(total) => onSend("room:set-rounds", { total })}
              />
            </div>
            <button
              className="btn btn-primary"
              type="button"
              disabled={!canStart}
              onClick={() => onSend("game:start")}
            >
              Start {MODE_COPY[state.mode].title}
            </button>
          </div>
        )}
        {youHost && !canStart && (
          <p className="hint" style={{ marginTop: 10 }}>
            Wait for {minPlayers - connected} more {minPlayers - connected === 1 ? "player" : "players"} to join.
            This mode needs {minPlayers}.
          </p>
        )}
        {state.mode === "buzzer" && (
          <div style={{ marginTop: 24 }}>
            <h2>Bring tracks</h2>
            <p className="hint">
              Optional queue. If it's empty, we'll pull a mixed seed catalogue from iTunes.
            </p>
            <TrackSearch onPick={(track) => onSend("room:queue", { track })} />
            <div className="queue" style={{ marginTop: 12 }}>
              {state.queue.map((q) => (
                <div key={q.trackId} className="player">
                  <span>
                    {q.title} — {q.artist}
                  </span>
                </div>
              ))}
            </div>
            {youHost && state.queue.length > 0 && (
              <button className="btn btn-ghost" type="button" onClick={() => onSend("room:clear-queue")}>
                Clear mix
              </button>
            )}
          </div>
        )}
      </div>
      <Scoreboard players={state.players} youId={state.youId} />
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
    const startedAt = classic?.submitEndsAt ? classic.submitEndsAt - 30000 : null;
    return (
      <div className="game-layout">
        <div className="panel">
          <div className="kicker">
            Classic · Pick {state.round}/{state.totalRounds}
          </div>
          <h2>You have 30 seconds to pick a song</h2>
          <p className="hint">Everyone queues one track. Then we play them one by one.</p>
          <TimerBar
            startedAt={startedAt}
            duration={30000}
            serverNow={state.serverNow}
            showSeconds
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
        <Scoreboard players={state.players} youId={state.youId} />
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
          startedAt={classic?.playStartedAt || null}
          duration={classic?.previewMs || 30000}
          serverNow={state.serverNow}
          showSeconds
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
  const buzzer = state.buzzer;
  const you = state.youId;
  const buzzed = buzzer?.buzzedBy === you;
  const eliminated = buzzer?.eliminated.includes(you);
  const playing = state.phase === "buzzer_playing";
  const reveal = state.phase === "buzzer_reveal";
  const youHost = state.youId === state.hostId;

  useEffect(() => {
    setTitle("");
  }, [state.round, state.phase]);

  return (
    <div className="game-layout">
      <div className="panel stage">
        <div className="kicker">
          Buzzer Beater · Round {state.round}/{state.totalRounds}
        </div>
        <Artwork
          src={buzzer?.track?.artworkUrl}
          spinning={playing || state.phase === "buzzer_buzzed"}
          blurred={!reveal}
        />
        <TimerBar
          startedAt={buzzer?.playStartedAt || null}
          duration={buzzer?.previewMs || 30000}
          serverNow={state.serverNow}
          showSeconds
        />
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
            {buzzer?.buzzDeadline && (
              <p className="hint">Answer before the buzz clock runs out.</p>
            )}
          </form>
        ) : (
          <>
            <p>
              {buzzer?.buzzedBy
                ? `${state.players.find((p) => p.id === buzzer.buzzedBy)?.name || "Someone"} has the aux.`
                : "Hit buzz when you know it."}
            </p>
            <button
              className="btn btn-buzz"
              type="button"
              disabled={!playing || eliminated}
              onClick={() => onSend("game:buzz")}
            >
              BUZZ
            </button>
            {eliminated && <p className="hint">You're out for this clip.</p>}
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
  const [title, setTitle] = useState(state.impostor?.yourGuess?.title || "");
  const [submitterId, setSubmitterId] = useState(state.impostor?.yourGuess?.submitterId || "");
  const impostor = state.impostor;

  const isYourTrack = Boolean(impostor?.isYours);

  const youHost = state.youId === state.hostId;

  if (state.phase === "impostor_submit") {
    return (
      <div className="game-layout">
        <div className="panel">
          <div className="kicker">Who Added This?</div>
          <h2>Sneak a track into the pile</h2>
          <p className="hint">
            Guilty pleasure, middle-school throwback, or a hype cut. Don't tell anyone.
          </p>
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
        <Scoreboard players={state.players} youId={state.youId} />
      </div>
    );
  }

  return (
    <div className="game-layout">
      <div className="panel stage">
        <div className="kicker">
          Who Added This? · {state.round}/{state.totalRounds}
        </div>
        <Artwork
          src={impostor?.track?.artworkUrl || impostor?.reveal?.track.artworkUrl}
          spinning={state.phase === "impostor_playing"}
          blurred={state.phase !== "impostor_reveal"}
        />
        <TimerBar
          startedAt={impostor?.playStartedAt || null}
          duration={impostor?.previewMs || 30000}
          serverNow={state.serverNow}
        />
        {state.phase === "impostor_reveal" && impostor?.reveal ? (
          <>
            <h2>
              {impostor.reveal.track.title}
              <div className="hint">
                {impostor.reveal.track.artist} · added by {impostor.reveal.submitterName}
              </div>
            </h2>
            <div className="queue" style={{ width: "100%", textAlign: "left" }}>
              {impostor.reveal.guesses.map((g) => (
                <div key={g.playerId} className="player">
                  <span>{g.playerName}</span>
                  <span>
                    {g.songOk ? "song ✓" : "song ✗"} · {g.whoOk ? "who ✓" : "who ✗"}
                  </span>
                </div>
              ))}
            </div>
            {youHost && (
              <button className="btn btn-primary" type="button" onClick={() => onSend("game:advance")}>
                Next
              </button>
            )}
          </>
        ) : isYourTrack ? (
          <p>You added this one. Look innocent.</p>
        ) : (
          <form
            style={{ width: "100%", textAlign: "left" }}
            onSubmit={(e) => {
              e.preventDefault();
              onSend("game:guess-impostor", { title, submitterId });
            }}
          >
            <div className="row">
              <div className="field">
                <label>Title</label>
                <input value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
            </div>
            <div className="field" style={{ marginTop: 10 }}>
              <label>Who added this?</label>
              <Dropdown
                value={submitterId}
                placeholder="Pick a friend"
                options={state.players
                  .filter((p) => p.id !== state.youId)
                  .map((p) => ({ value: p.id, label: p.name }))}
                onChange={setSubmitterId}
              />
            </div>
            <button className="btn btn-gold" type="submit" style={{ marginTop: 12 }}>
              {impostor?.yourGuess ? "Update guess" : "Submit guess"}
            </button>
          </form>
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
        <Scoreboard players={state.players} youId={state.youId} />
      </div>
    );
  }

  if (state.phase === "aux_submit") {
    return (
      <div className="game-layout">
        <div className="panel">
          <div className="kicker">Theme</div>
          <h2>{aux?.theme}</h2>
          <p className="hint">Everyone picks a track for this theme, including the DJ.</p>
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
        <Scoreboard players={state.players} youId={state.youId} />
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
            startedAt={aux?.listenStartedAt || null}
            duration={aux?.listenMs || 18000}
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
        <Scoreboard players={state.players} youId={state.youId} />
      </div>
    );
  }

  if (state.phase === "aux_vote") {
    return (
      <div className="game-layout">
        <div className="panel">
          <h2>Who earned the aux?</h2>
          <p className="hint">Everyone votes, including the DJ. You just can't vote for your own track. Theme: {aux?.theme}</p>
          <div className="vote-grid">
            {aux?.entries?.map((entry) => (
              <button
                key={entry.playerId}
                type="button"
                className={`vote-card ${aux.yourVote === entry.playerId ? "mine" : ""}`}
                disabled={entry.playerId === state.youId}
                onClick={() => onSend("game:vote", { playerId: entry.playerId })}
              >
                <img src={entry.track.artworkUrl} alt="" />
                <strong>{entry.track.title}</strong>
                <div className="hint">{entry.playerName}</div>
              </button>
            ))}
          </div>
          <p className="hint">
            Votes in {aux?.votedCount}/{state.players.filter((p) => p.connected).length}
          </p>
        </div>
        <Scoreboard players={state.players} youId={state.youId} />
      </div>
    );
  }

  const winner = state.players.find((p) => p.id === aux?.winnerId);
  return (
    <div className="game-layout">
      <div className="panel stage">
        <div className="kicker">Aux awarded</div>
        <h2>{winner?.name || "Someone"} keeps the cord</h2>
        <p className="hint">{aux?.theme}</p>
        <div className="vote-grid">
          {aux?.entries
            ?.slice()
            .sort((a, b) => b.votes - a.votes)
            .map((entry) => (
              <div key={entry.playerId} className="vote-card">
                <img src={entry.track.artworkUrl} alt="" />
                <strong>{entry.track.title}</strong>
                <div className="hint">
                  {entry.playerName} · {entry.votes} vote{entry.votes === 1 ? "" : "s"}
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
        <button className="btn btn-primary" type="button" onClick={() => onSend("game:lobby")}>
          Back to lobby
        </button>
      )}
    </div>
  );
}
