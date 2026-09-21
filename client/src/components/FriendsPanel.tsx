import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { FriendMessage, FriendPresence, FriendSearchHit, SocialState, SocketAck } from "@shared/types";
import { emitAck, getSocket, resetSocket } from "../socket";
import { useAuth } from "../useAuth";
import { IconLock } from "./PartyArt";
import { UserBadge } from "./UserMenu";

const EMPTY: SocialState = { friends: [], incoming: [], outgoing: [], invites: [] };

export function useSocial() {
  const auth = useAuth();
  const [state, setState] = useState<SocialState>(EMPTY);
  const [messages, setMessages] = useState<Record<string, FriendMessage[]>>({});
  const [error, setError] = useState("");
  const user = auth.user;
  const playToken = auth.playToken;

  const sock = useMemo(() => {
    if (!auth.ready || !user) return null;
    return getSocket(user.username, false, user.avatarUrl, playToken);
  }, [auth.ready, playToken, user]);

  const refresh = useCallback(async () => {
    if (!sock) return;
    try {
      const res = await emitAck<SocketAck>(sock, "social:sync");
      if (!res.ok) setError(res.error || "Could not load friends.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load friends.");
    }
  }, [sock]);

  useEffect(() => {
    if (!sock) return;
    const onState = (next: SocialState) => setState(next);
    const onMessage = (message: FriendMessage) => {
      const other = message.fromId === user?.id ? message.toId : message.fromId;
      setMessages((prev) => ({
        ...prev,
        [other]: [...(prev[other] || []), message].slice(-80),
      }));
    };
    sock.on("social:state", onState);
    sock.on("social:message", onMessage);
    void refresh();
    return () => {
      sock.off("social:state", onState);
      sock.off("social:message", onMessage);
    };
  }, [refresh, sock, user?.id]);

  async function send(event: string, payload?: unknown, timeoutMs = 15000) {
    if (!sock) throw new Error("Log in to use friends.");
    setError("");
    const res = await emitAck<SocketAck & { messages?: FriendMessage[]; code?: string }>(
      sock,
      event,
      payload,
      timeoutMs,
    );
    if (!res.ok) throw new Error(res.error || "That didn't work.");
    return res;
  }

  return {
    ready: Boolean(user),
    state,
    messages,
    error,
    setError,
    refresh,
    send,
    loadHistory: async (userId: string) => {
      const res = await send("social:history", { userId });
      if (res.messages) {
        setMessages((prev) => ({ ...prev, [userId]: res.messages || [] }));
      }
    },
  };
}

export default function FriendsPanel({
  compact = false,
  canInvite = false,
  onRegister,
  headingAs = "p",
}: {
  compact?: boolean;
  canInvite?: boolean;
  onRegister?: () => void;
  headingAs?: "h1" | "p";
}) {
  const auth = useAuth();
  const navigate = useNavigate();
  const social = useSocial();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [tab, setTab] = useState<"add" | "requests">("add");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<FriendSearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<FriendSearchHit | null>(null);
  const [note, setNote] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const Title = headingAs;
  const activeFriend = social.state.friends.find((f) => f.id === activeId) || null;
  const thread = activeId ? social.messages[activeId] || [] : [];
  const incoming = social.state.incoming;
  const outgoing = social.state.outgoing;

  useEffect(() => {
    if (!activeId) return;
    void social.loadHistory(activeId).catch((err: Error) => social.setError(err.message));
  }, [activeId]);

  useEffect(() => {
    if (!sheetOpen) return;
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = window.setTimeout(() => {
      void social
        .send("social:search", { query: q })
        .then((res) => {
          setHits(res.people || []);
          setPicked((prev) => (prev ? (res.people || []).find((hit) => hit.id === prev.id) || prev : null));
        })
        .catch((err: Error) => social.setError(err.message))
        .finally(() => setSearching(false));
    }, 280);
    return () => window.clearTimeout(timer);
  }, [query, sheetOpen]);

  if (!auth.user) {
    return (
      <section className={`g-card friends-card friends-card-locked ${compact ? "compact" : ""}`}>
        <div className="friends-head">
          <Title className="lime-title">Friends</Title>
        </div>
        <div className="friends-locked">
          <IconLock />
          <p className="friends-locked-copy">
            Register to add friends and join their games from your friends list.
          </p>
          <button
            className="start-btn alt"
            type="button"
            onClick={() => {
              resetSocket();
              if (onRegister) {
                onRegister();
                return;
              }
              navigate("/?signup=1");
            }}
          >
            Register
          </button>
        </div>
      </section>
    );
  }

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    social.setError("");
    try {
      await fn();
    } catch (err) {
      social.setError(err instanceof Error ? err.message : "That didn't work.");
    } finally {
      setBusy(false);
    }
  }

  async function joinFriend(friend: FriendPresence) {
    await run(async () => {
      const res = await social.send("social:join-friend", { userId: friend.id });
      if (res.code) navigate(`/room/${res.code}`, { viewTransition: true });
    });
  }

  function openSheet() {
    setActiveId(null);
    setSheetOpen(true);
    setTab(incoming.length > 0 ? "requests" : "add");
  }

  function closeSheet() {
    setSheetOpen(false);
    setQuery("");
    setHits([]);
    setPicked(null);
    setNote("");
  }

  return (
    <section className={`g-card friends-card ${compact ? "compact" : ""}`}>
      <div className="friends-head">
        <Title className="lime-title">Friends</Title>
        <button
          className={`friend-plus ${sheetOpen ? "on" : ""}`}
          type="button"
          aria-label={sheetOpen ? "Close add friends" : "Add friends"}
          onClick={() => (sheetOpen ? closeSheet() : openSheet())}
        >
          {sheetOpen ? "×" : "+"}
          {!sheetOpen && incoming.length > 0 && <span className="friend-plus-badge">{incoming.length}</span>}
        </button>
      </div>
      {social.state.invites.length > 0 && (
        <div className="friend-invites">
          {social.state.invites.map((invite) => (
            <div key={`${invite.fromId}-${invite.code}`} className="friend-row">
              <span>
                <b>{invite.fromName}</b> invited you to {invite.code}
              </span>
              <button
                className="btn btn-gold"
                type="button"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const sock = getSocket(
                      auth.user!.username,
                      false,
                      auth.user!.avatarUrl,
                      auth.playToken,
                    );
                    const res = await emitAck<SocketAck & { code?: string }>(sock, "room:join", {
                      code: invite.code,
                      name: auth.user!.username,
                    });
                    if (!res.ok || !res.code) throw new Error(res.error || "Could not join.");
                    navigate(`/room/${res.code}`, { viewTransition: true });
                  })
                }
              >
                Join
              </button>
            </div>
          ))}
        </div>
      )}
      {sheetOpen ? (
        <div className="friend-sheet">
          <div className="friend-sheet-tabs">
            <button className={tab === "add" ? "on" : ""} type="button" onClick={() => setTab("add")}>
              Add
            </button>
            <button className={tab === "requests" ? "on" : ""} type="button" onClick={() => setTab("requests")}>
              Requests
              {incoming.length > 0 ? ` (${incoming.length})` : ""}
            </button>
          </div>
          {tab === "add" ? (
            <div className="friend-add-pane">
              <input
                className="nick-input"
                placeholder="Search by username"
                value={query}
                autoFocus
                onChange={(e) => setQuery(e.target.value)}
              />
              <div className="friend-list">
                {searching && <p className="hint">Looking…</p>}
                {!searching && query.trim().length < 2 && <p className="hint">Type at least 2 characters.</p>}
                {!searching && query.trim().length >= 2 && hits.length === 0 && (
                  <p className="hint">No players match that name.</p>
                )}
                {hits.map((hit) => (
                  <div key={hit.id} className={`friend-row ${picked?.id === hit.id ? "on" : ""}`}>
                    <button
                      type="button"
                      className="friend-who"
                      onClick={() => {
                        setPicked(hit);
                        setNote("");
                      }}
                    >
                      {hit.avatarUrl ? (
                        <UserBadge user={{ id: hit.id, username: hit.username, avatarUrl: hit.avatarUrl }} size={32} />
                      ) : (
                        <span className="friend-dot" data-on={false} />
                      )}
                      <span>
                        <b>{hit.username}</b>
                        <span className="hint">
                          {hit.status === "friends"
                            ? "Already friends"
                            : hit.status === "outgoing"
                              ? "Request sent"
                              : hit.status === "incoming"
                                ? "Sent you a request"
                                : "Tap to add"}
                        </span>
                      </span>
                    </button>
                    {hit.status === "incoming" && (
                      <button
                        className="btn btn-gold"
                        type="button"
                        disabled={busy}
                        onClick={() => void run(() => social.send("social:accept", { userId: hit.id }))}
                      >
                        Accept
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {picked && picked.status === "none" && (
                <form
                  className="friend-request-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void run(async () => {
                      await social.send("social:add", { username: picked.username, message: note });
                      setNote("");
                      setPicked((prev) => (prev ? { ...prev, status: "outgoing" } : prev));
                      setHits((prev) =>
                        prev.map((hit) => (hit.id === picked.id ? { ...hit, status: "outgoing" } : hit)),
                      );
                    });
                  }}
                >
                  <p className="hint">
                    Send a request to <b>{picked.username}</b>
                  </p>
                  <textarea
                    className="nick-input friend-note"
                    rows={2}
                    maxLength={200}
                    placeholder="Add a message (optional)"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                  <button className="btn btn-primary" type="submit" disabled={busy}>
                    Send request
                  </button>
                </form>
              )}
            </div>
          ) : (
            <div className="friend-list">
              {incoming.length === 0 && outgoing.length === 0 && (
                <p className="hint">No friend requests right now.</p>
              )}
              {incoming.map((req) => (
                <div key={req.id} className="friend-row friend-request-row">
                  <span>
                    <b>{req.username}</b>
                    {req.message && <span className="friend-req-note">“{req.message}”</span>}
                  </span>
                  <span className="friend-actions">
                    <button
                      className="btn btn-gold"
                      type="button"
                      disabled={busy}
                      onClick={() => void run(() => social.send("social:accept", { userId: req.id }))}
                    >
                      Accept
                    </button>
                    <button
                      className="btn btn-ghost"
                      type="button"
                      disabled={busy}
                      onClick={() => void run(() => social.send("social:decline", { userId: req.id }))}
                    >
                      No
                    </button>
                  </span>
                </div>
              ))}
              {outgoing.map((req) => (
                <div key={req.id} className="friend-row">
                  <span>
                    <b>{req.username}</b>
                    <span className="hint">Waiting for them to accept</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="friend-list">
          {social.state.friends.length === 0 && (
            <p className="hint">No friends yet. Hit + to search and send a request.</p>
          )}
          {social.state.friends.map((friend) => (
            <div key={friend.id} className={`friend-row ${activeId === friend.id ? "on" : ""}`}>
              <button type="button" className="friend-who" onClick={() => setActiveId(friend.id)}>
                {auth.user && friend.avatarUrl ? (
                  <UserBadge user={{ id: friend.id, username: friend.username, avatarUrl: friend.avatarUrl }} size={32} />
                ) : (
                  <span className="friend-dot" data-on={friend.online} />
                )}
                <span>
                  <b>{friend.username}</b>
                  <span className="hint">
                    {friend.canJoin
                      ? friend.inGame
                        ? `In ${friend.mode || "a game"} · ${friend.roomCode}`
                        : `Lobby ${friend.roomCode}`
                      : friend.online
                        ? friend.inGame && friend.isPrivate
                          ? "In a private game"
                          : "Online"
                        : "Offline"}
                  </span>
                </span>
              </button>
              <span className="friend-actions">
                {friend.canJoin && friend.roomCode && (
                  <button className="btn btn-gold" type="button" disabled={busy} onClick={() => void joinFriend(friend)}>
                    Join
                  </button>
                )}
                {canInvite && (
                  <button
                    className="btn btn-ghost"
                    type="button"
                    disabled={busy}
                    onClick={() => void run(() => social.send("social:invite", { userId: friend.id }))}
                  >
                    Invite
                  </button>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
      {activeFriend && (
        <div className="friend-chat">
          <div className="friend-chat-head">
            <strong>{activeFriend.username}</strong>
            <button className="text-link" type="button" onClick={() => setActiveId(null)}>
              Close
            </button>
          </div>
          <div className="friend-thread">
            {thread.map((message) => (
              <p key={message.id} className={message.fromId === auth.user?.id ? "mine" : ""}>
                {message.body}
              </p>
            ))}
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const body = draft.trim();
              if (!body) return;
              void run(async () => {
                await social.send("social:message", { userId: activeFriend.id, body });
                setDraft("");
              });
            }}
          >
            <input
              className="nick-input"
              placeholder="Message"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
          </form>
        </div>
      )}
      {social.error && <p className="error">{social.error}</p>}
    </section>
  );
}
