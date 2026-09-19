import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { FriendMessage, FriendPresence, SocialState, SocketAck } from "@shared/types";
import { emitAck, getSocket } from "../socket";
import { useAuth } from "../useAuth";
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
}: {
  compact?: boolean;
  canInvite?: boolean;
}) {
  const auth = useAuth();
  const navigate = useNavigate();
  const social = useSocial();
  const [username, setUsername] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const activeFriend = social.state.friends.find((f) => f.id === activeId) || null;
  const thread = activeId ? social.messages[activeId] || [] : [];

  useEffect(() => {
    if (!activeId) return;
    void social.loadHistory(activeId).catch((err: Error) => social.setError(err.message));
  }, [activeId]);

  if (!auth.user) {
    return (
      <section className={`g-card friends-card ${compact ? "compact" : ""}`}>
        <p className="lime-title">Friends</p>
        <p className="play-copy">Log in to add friends, message them, and jump into their lobbies.</p>
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

  return (
    <section className={`g-card friends-card ${compact ? "compact" : ""}`}>
      <p className="lime-title">Friends</p>
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
      <form
        className="friend-add"
        onSubmit={(event) => {
          event.preventDefault();
          const name = username.trim();
          if (!name) return;
          void run(async () => {
            await social.send("social:add", { username: name });
            setUsername("");
          });
        }}
      >
        <input
          className="nick-input"
          placeholder="Add by username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <button className="btn btn-primary" type="submit" disabled={busy || username.trim().length < 3}>
          Add
        </button>
      </form>
      {social.state.incoming.length > 0 && (
        <div>
          <p className="hint">Requests</p>
          {social.state.incoming.map((req) => (
            <div key={req.id} className="friend-row">
              <span>{req.username}</span>
              <span className="friend-actions">
                <button className="btn btn-gold" type="button" disabled={busy} onClick={() => void run(() => social.send("social:accept", { userId: req.id }))}>
                  Accept
                </button>
                <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => void run(() => social.send("social:decline", { userId: req.id }))}>
                  No
                </button>
              </span>
            </div>
          ))}
        </div>
      )}
      <div className="friend-list">
        {social.state.friends.length === 0 && <p className="hint">No friends yet. Add someone by username.</p>}
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
                <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => void run(() => social.send("social:invite", { userId: friend.id }))}>
                  Invite
                </button>
              )}
            </span>
          </div>
        ))}
      </div>
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
