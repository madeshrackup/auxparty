import { io, type Socket } from "socket.io-client";
import { SOCKET_URL } from "./config";
import { getAvatar, getGuestId } from "./identity";

type SocketAuth = {
  guestId: string;
  name: string;
  avatar: string;
  forceGuest: boolean;
  avatarUrl?: string;
  playToken?: string;
};

let socket: Socket | null = null;
let watchingVisibility = false;

const CONNECT_MS = 12000;

function identityKey(auth: SocketAuth) {
  return JSON.stringify({
    guestId: auth.guestId,
    forceGuest: auth.forceGuest,
    playToken: auth.playToken || "",
  });
}

function watchTab() {
  if (watchingVisibility) return;
  watchingVisibility = true;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && socket && !socket.connected) {
      socket.connect();
    }
  });
}

export function resetSocket() {
  socket?.disconnect();
  socket = null;
}

export function emitLeave() {
  socket?.emit("room:leave");
}

export function getSocket(
  name: string,
  forceGuest = false,
  avatarUrl?: string | null,
  playToken?: string | null,
): Socket {
  const auth: SocketAuth = {
    guestId: getGuestId(),
    name,
    avatar: getAvatar(),
    forceGuest,
    avatarUrl: avatarUrl || undefined,
    playToken: forceGuest ? undefined : playToken || undefined,
  };
  if (!socket) {
    socket = io(SOCKET_URL || undefined, {
      withCredentials: true,
      auth,
      timeout: CONNECT_MS,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
      reconnectionDelayMax: 8000,
    });
    watchTab();
    return socket;
  }
  const prev = socket.auth as SocketAuth;
  const identityChanged = identityKey(prev) !== identityKey(auth);
  socket.auth = auth;
  if (identityChanged && socket.connected) {
    socket.disconnect().connect();
  } else if (!socket.connected) {
    socket.connect();
  } else if (prev.name !== auth.name) {
    socket.emit("identity:update", { name: auth.name });
  }
  return socket;
}

export function ensureConnected(sock: Socket, timeoutMs = CONNECT_MS): Promise<void> {
  if (sock.connected) return Promise.resolve();
  if (!SOCKET_URL && !import.meta.env.DEV) {
    return Promise.reject(
      new Error("Live rooms need the Aux Party game server. This website host can't run a match on its own."),
    );
  }
  return new Promise((resolve, reject) => {
    const finish = (err?: Error) => {
      window.clearTimeout(timer);
      sock.off("connect", onConnect);
      sock.off("connect_error", onError);
      if (err) reject(err);
      else resolve();
    };
    const onConnect = () => finish();
    const onError = (_err: Error) => {
      finish(new Error("Can't reach the party server. Try again in a moment."));
    };
    const timer = window.setTimeout(() => {
      finish(new Error("Can't reach the party server. Try again in a moment."));
    }, timeoutMs);
    sock.once("connect", onConnect);
    sock.on("connect_error", onError);
    if (!sock.connected) sock.connect();
  });
}

export async function emitAck<T extends { ok: boolean; error?: string }>(
  sock: Socket,
  event: string,
  payload?: unknown,
  timeoutMs = 15000,
): Promise<T> {
  await ensureConnected(sock);
  return new Promise((resolve, reject) => {
    sock.timeout(timeoutMs).emit(event, payload ?? {}, (err: Error | null, res: T) => {
      if (err) reject(err);
      else resolve(res);
    });
  });
}
