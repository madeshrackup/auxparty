import { io, type Socket } from "socket.io-client";
import { getAvatar, getGuestId } from "./identity";

let socket: Socket | null = null;

export function resetSocket() {
  socket?.disconnect();
  socket = null;
}

export function getSocket(name: string, forceGuest = false): Socket {
  const auth = { guestId: getGuestId(), name, avatar: getAvatar(), forceGuest };
  if (!socket) {
    socket = io({
      withCredentials: true,
      auth,
    });
    return socket;
  }
  socket.auth = auth;
  if (!socket.connected) socket.connect();
  return socket;
}

export function emitAck<T extends { ok: boolean; error?: string }>(
  sock: Socket,
  event: string,
  payload?: unknown,
  timeoutMs = 15000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    sock.timeout(timeoutMs).emit(event, payload ?? {}, (err: Error | null, res: T) => {
      if (err) reject(err);
      else resolve(res);
    });
  });
}
