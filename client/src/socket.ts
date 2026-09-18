import { io, type Socket } from "socket.io-client";
import { SOCKET_URL } from "./config";
import { getAvatar, getGuestId } from "./identity";

let socket: Socket | null = null;

const CONNECT_MS = 8000;

export function resetSocket() {
  socket?.disconnect();
  socket = null;
}

export function getSocket(name: string, forceGuest = false, avatarUrl?: string | null): Socket {
  const auth = {
    guestId: getGuestId(),
    name,
    avatar: getAvatar(),
    forceGuest,
    avatarUrl: avatarUrl || undefined,
  };
  if (!socket) {
    socket = io(SOCKET_URL || undefined, {
      withCredentials: true,
      auth,
      timeout: CONNECT_MS,
      reconnectionAttempts: 4,
      reconnectionDelay: 400,
    });
    return socket;
  }
  socket.auth = auth;
  if (!socket.connected) socket.connect();
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
    const onError = (err: Error) => {
      if (sock.active) return;
      finish(err);
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
