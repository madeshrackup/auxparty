import "./env.ts";
import http from "node:http";
import { parse as parseCookie } from "cookie";
import { Server } from "socket.io";
import { app } from "./app.ts";
import { findUserBySession } from "./db.ts";
import { APP_URL, SUPABASE_URL } from "./env.ts";
import { publicAvatarUrl, userIdFromPlayToken } from "./auth.ts";
import { RoomManager } from "./rooms.ts";
import type { GameMode, ImpostorGuess, LobbyPreview, Track } from "../../shared/types.ts";

const PORT = Number(process.env.PORT) || 3001;
const ORIGIN = process.env.CORS_ORIGIN || APP_URL || "http://localhost:5173";

const GAME_MODES: GameMode[] = ["classic", "buzzer", "impostor", "aux"];

function isGameMode(value: unknown): value is GameMode {
  return GAME_MODES.includes(value as GameMode);
}

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: ORIGIN, credentials: true },
});

const rooms = new RoomManager();
const socketsByPlayer = new Map<string, string>();

app.get("/api/rooms", (_req, res) => {
  res.json({ rooms: rooms.listLobbies() as LobbyPreview[] });
});

type Identity = { id: string; name: string; isGuest: boolean; avatar: string; avatarUrl: string | null };

function avatarFromAuth(auth: Record<string, unknown>) {
  const raw = String(auth.avatar || "disco");
  return raw.slice(0, 16) || "disco";
}

function photoFromAuth(auth: Record<string, unknown>, dbPath?: string | null) {
  const fromDb = publicAvatarUrl(dbPath);
  if (fromDb) return fromDb;
  const raw = String(auth.avatarUrl || "");
  const prefix = `${SUPABASE_URL}/storage/v1/object/public/avatars/`;
  return raw.startsWith(prefix) ? raw : null;
}

function guestIdentity(auth: Record<string, unknown>): Identity {
  return {
    id: String(auth.guestId || crypto.randomUUID()),
    name: String(auth.name || "Guest").trim().slice(0, 20) || "Guest",
    isGuest: true,
    avatar: avatarFromAuth(auth),
    avatarUrl: photoFromAuth(auth),
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

async function identityFromHandshake(socket: {
  handshake: { headers: { cookie?: string }; auth: Record<string, unknown> };
}): Promise<Identity> {
  const auth = socket.handshake.auth;
  const avatar = avatarFromAuth(auth);
  if (!auth.forceGuest) {
    const tokenId = userIdFromPlayToken(auth.playToken);
    if (tokenId) {
      return {
        id: tokenId,
        name: String(auth.name || "").trim().slice(0, 20) || "Player",
        isGuest: false,
        avatar,
        avatarUrl: photoFromAuth(auth),
      };
    }
    const raw = socket.handshake.headers.cookie;
    const sid = raw ? parseCookie(raw).aux_sid : undefined;
    if (sid) {
      try {
        const user = await withTimeout(findUserBySession(sid), 2500);
        if (user?.email_verified) {
          return {
            id: user.id,
            name: user.username,
            isGuest: false,
            avatar,
            avatarUrl: photoFromAuth(auth, user.avatar_path),
          };
        }
      } catch {
        /* fall through to guest */
      }
    }
  }
  return guestIdentity(auth);
}

function broadcast(code: string) {
  const room = rooms.get(code);
  if (!room) return;
  room.onChange = () => broadcast(code);
  for (const player of room.players) {
    const sid = socketsByPlayer.get(player.id);
    if (!sid) continue;
    io.to(sid).emit("room:state", room.viewFor(player.id));
  }
}

function attachRoom(room: { code: string }) {
  const r = rooms.get(room.code);
  if (!r) return;
  r.onChange = () => broadcast(r.code);
}

io.use(async (socket, next) => {
  try {
    socket.data.identity = await withTimeout(identityFromHandshake(socket), 3000);
  } catch {
    socket.data.identity = guestIdentity(socket.handshake.auth);
  }
  next();
});

io.on("connection", (socket) => {
  let identity: Identity = socket.data.identity || guestIdentity(socket.handshake.auth);
  socketsByPlayer.set(identity.id, socket.id);
  socket.data.playerId = identity.id;
  socket.data.roomCode = "";

  socket.on("identity:update", (payload: { name?: string }, ack?: (a: { ok: boolean; error?: string }) => void) => {
    try {
      if (payload?.name) {
        identity = { ...identity, name: payload.name.trim().slice(0, 20) || identity.name };
      }
      socketsByPlayer.set(identity.id, socket.id);
      const code = socket.data.roomCode as string;
      if (code) {
        rooms.get(code)?.rename(identity.id, identity.name);
      }
      ack?.({ ok: true });
    } catch (err) {
      ack?.({ ok: false, error: err instanceof Error ? err.message : "Could not update name." });
    }
  });

  const ackError = (ack: ((a: { ok: boolean; error?: string; code?: string }) => void) | undefined, err: unknown) => {
    ack?.({ ok: false, error: err instanceof Error ? err.message : "Something went wrong." });
  };

  socket.on(
    "room:create",
    async (payload: { name?: string; avatar?: string; mode?: GameMode }, ack?: (a: { ok: boolean; error?: string; code?: string }) => void) => {
      try {
        if (payload?.name) {
          identity = { ...identity, name: payload.name.trim().slice(0, 20) || identity.name };
        }
        if (payload?.avatar) identity = { ...identity, avatar: payload.avatar.slice(0, 16) };
        socketsByPlayer.set(identity.id, socket.id);
        const mode = isGameMode(payload?.mode) ? payload.mode : undefined;
        const room = rooms.create(identity, mode);
        attachRoom(room);
        socket.data.roomCode = room.code;
        socket.join(room.code);
        broadcast(room.code);
        ack?.({ ok: true, code: room.code });
      } catch (err) {
        ackError(ack, err);
      }
    },
  );

  socket.on(
    "room:join",
    async (
      payload: { code?: string; name?: string; avatar?: string },
      ack?: (a: { ok: boolean; error?: string; code?: string }) => void,
    ) => {
      try {
        if (payload?.name) {
          identity = { ...identity, name: payload.name.trim().slice(0, 20) || identity.name };
        }
        if (payload?.avatar) identity = { ...identity, avatar: payload.avatar.slice(0, 16) };
        socketsByPlayer.set(identity.id, socket.id);
        const code = String(payload?.code || "").trim().toUpperCase();
        const room = rooms.get(code);
        if (!room) throw new Error("No party with that code.");
        room.join(identity);
        attachRoom(room);
        socket.data.roomCode = room.code;
        socket.join(room.code);
        broadcast(room.code);
        ack?.({ ok: true, code: room.code });
      } catch (err) {
        ackError(ack, err);
      }
    },
  );

  socket.on("room:leave", () => {
    const code = socket.data.roomCode as string;
    if (!code) return;
    rooms.get(code)?.leave(identity.id);
    socket.leave(code);
    socket.data.roomCode = "";
    broadcast(code);
  });

  socket.on("room:set-mode", (payload: { mode?: GameMode }, ack?: (a: { ok: boolean; error?: string }) => void) => {
    try {
      const room = rooms.get(socket.data.roomCode);
      if (!room) throw new Error("You're not in a room.");
      if (!payload?.mode) throw new Error("Pick a mode.");
      room.setMode(identity.id, payload.mode);
      ack?.({ ok: true });
    } catch (err) {
      ackError(ack, err);
    }
  });

  socket.on("room:set-rounds", (payload: { total?: number }, ack?: (a: { ok: boolean; error?: string }) => void) => {
    try {
      const room = rooms.get(socket.data.roomCode);
      if (!room) throw new Error("You're not in a room.");
      room.setRounds(identity.id, Number(payload?.total));
      ack?.({ ok: true });
    } catch (err) {
      ackError(ack, err);
    }
  });

  socket.on("room:queue", (payload: { track?: Track }, ack?: (a: { ok: boolean; error?: string }) => void) => {
    try {
      const room = rooms.get(socket.data.roomCode);
      if (!room) throw new Error("You're not in a room.");
      if (!payload?.track) throw new Error("Pick a track.");
      room.queueTrack(identity.id, payload.track);
      ack?.({ ok: true });
    } catch (err) {
      ackError(ack, err);
    }
  });

  socket.on("room:clear-queue", (_p, ack?: (a: { ok: boolean; error?: string }) => void) => {
    try {
      const room = rooms.get(socket.data.roomCode);
      if (!room) throw new Error("You're not in a room.");
      room.clearQueue(identity.id);
      ack?.({ ok: true });
    } catch (err) {
      ackError(ack, err);
    }
  });

  socket.on("game:start", async (_p, ack?: (a: { ok: boolean; error?: string }) => void) => {
    try {
      const room = rooms.get(socket.data.roomCode);
      if (!room) throw new Error("You're not in a room.");
      await room.start(identity.id);
      ack?.({ ok: true });
    } catch (err) {
      ackError(ack, err);
    }
  });

  socket.on("game:buzz", (_p, ack?: (a: { ok: boolean; error?: string }) => void) => {
    try {
      const room = rooms.get(socket.data.roomCode);
      if (!room) throw new Error("You're not in a room.");
      room.buzz(identity.id);
      ack?.({ ok: true });
    } catch (err) {
      ackError(ack, err);
    }
  });

  socket.on(
    "game:guess",
    (payload: { title?: string; artist?: string }, ack?: (a: { ok: boolean; error?: string }) => void) => {
      try {
        const room = rooms.get(socket.data.roomCode);
        if (!room) throw new Error("You're not in a room.");
        if (room.phase === "classic_playing") {
          room.classicGuess(identity.id, payload?.title || "", payload?.artist || "");
        } else {
          room.buzzerGuess(identity.id, payload?.title || "", payload?.artist || "");
        }
        ack?.({ ok: true });
      } catch (err) {
        ackError(ack, err);
      }
    },
  );

  socket.on("game:submit-track", (payload: { track?: Track }, ack?: (a: { ok: boolean; error?: string }) => void) => {
    try {
      const room = rooms.get(socket.data.roomCode);
      if (!room) throw new Error("You're not in a room.");
      if (!payload?.track) throw new Error("Pick a track.");
      room.submitTrack(identity.id, payload.track);
      ack?.({ ok: true });
    } catch (err) {
      ackError(ack, err);
    }
  });

  socket.on(
    "game:guess-impostor",
    (payload: ImpostorGuess, ack?: (a: { ok: boolean; error?: string }) => void) => {
      try {
        const room = rooms.get(socket.data.roomCode);
        if (!room) throw new Error("You're not in a room.");
        room.impostorGuess(identity.id, payload);
        ack?.({ ok: true });
      } catch (err) {
        ackError(ack, err);
      }
    },
  );

  socket.on("game:theme", (payload: { theme?: string }, ack?: (a: { ok: boolean; error?: string }) => void) => {
    try {
      const room = rooms.get(socket.data.roomCode);
      if (!room) throw new Error("You're not in a room.");
      room.setTheme(identity.id, payload?.theme || "");
      ack?.({ ok: true });
    } catch (err) {
      ackError(ack, err);
    }
  });

  socket.on("game:vote", (payload: { playerId?: string }, ack?: (a: { ok: boolean; error?: string }) => void) => {
    try {
      const room = rooms.get(socket.data.roomCode);
      if (!room) throw new Error("You're not in a room.");
      if (!payload?.playerId) throw new Error("Pick a track.");
      room.vote(identity.id, payload.playerId);
      ack?.({ ok: true });
    } catch (err) {
      ackError(ack, err);
    }
  });

  socket.on("game:advance", (_p, ack?: (a: { ok: boolean; error?: string }) => void) => {
    try {
      const room = rooms.get(socket.data.roomCode);
      if (!room) throw new Error("You're not in a room.");
      room.advance(identity.id);
      ack?.({ ok: true });
    } catch (err) {
      ackError(ack, err);
    }
  });

  socket.on("game:lobby", (_p, ack?: (a: { ok: boolean; error?: string }) => void) => {
    try {
      const room = rooms.get(socket.data.roomCode);
      if (!room) throw new Error("You're not in a room.");
      room.backToLobby(identity.id);
      ack?.({ ok: true });
    } catch (err) {
      ackError(ack, err);
    }
  });

  socket.on("disconnect", () => {
    const code = socket.data.roomCode as string;
    if (socketsByPlayer.get(identity.id) === socket.id) {
      socketsByPlayer.delete(identity.id);
    }
    if (code) {
      rooms.get(code)?.leave(identity.id);
      broadcast(code);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Aux Party API on http://localhost:${PORT}`);
});
