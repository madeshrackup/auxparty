import type { GameMode, PartyInvite, SocialState } from "../../shared/types.ts";
import { publicAvatarUrl } from "./auth.ts";
import {
  acceptFriendRequest,
  areFriends,
  createFriendRequest,
  declineFriendRequest,
  insertFriendMessage,
  listFriendAccounts,
  listFriendIds,
  listFriendMessages,
  listFriendRequests,
  removeFriend,
  searchAccounts,
} from "./db.ts";
import type { Room } from "./rooms.ts";

export type Presence = {
  online: boolean;
  roomCode: string | null;
  mode: GameMode | null;
  inGame: boolean;
  isPrivate: boolean;
  canJoin: boolean;
};

const invites = new Map<string, PartyInvite[]>();

export function addInvite(toId: string, invite: PartyInvite) {
  const existing = invites.get(toId) || [];
  const next = [invite, ...existing.filter((item) => item.code !== invite.code || item.fromId !== invite.fromId)].slice(
    0,
    8,
  );
  invites.set(toId, next);
}

export function takeInvites(userId: string) {
  return invites.get(userId) || [];
}

export function clearInvite(userId: string, code: string) {
  const next = (invites.get(userId) || []).filter((item) => item.code !== code);
  invites.set(userId, next);
}

export async function buildSocialState(
  userId: string,
  presenceOf: (friendId: string) => Presence,
): Promise<SocialState> {
  const [friends, requests] = await Promise.all([listFriendAccounts(userId), listFriendRequests(userId)]);
  return {
    friends: friends.map((friend) => {
      const presence = presenceOf(friend.id);
      return {
        id: friend.id,
        username: friend.username,
        avatarUrl: publicAvatarUrl(friend.avatar_path),
        online: presence.online,
        roomCode: presence.canJoin ? presence.roomCode : null,
        mode: presence.mode,
        inGame: presence.inGame,
        isPrivate: presence.isPrivate,
        canJoin: presence.canJoin,
      };
    }),
    incoming: requests.incoming.map((row) => ({
      id: row.id,
      username: row.username,
      avatarUrl: publicAvatarUrl(row.avatar_path),
      message: row.message || null,
    })),
    outgoing: requests.outgoing.map((row) => ({
      id: row.id,
      username: row.username,
      avatarUrl: publicAvatarUrl(row.avatar_path),
      message: row.message || null,
    })),
    invites: takeInvites(userId),
  };
}

export async function requestFriend(userId: string, username: string, message = "") {
  return createFriendRequest(userId, username, message);
}

export async function searchFriends(userId: string, query: string) {
  const rows = await searchAccounts(userId, query);
  return rows.map((row) => ({
    id: row.id,
    username: row.username,
    avatarUrl: publicAvatarUrl(row.avatar_path),
    status: row.status,
  }));
}

export async function acceptFriend(userId: string, fromId: string) {
  await acceptFriendRequest(userId, fromId);
}

export async function declineFriend(userId: string, otherId: string) {
  await declineFriendRequest(userId, otherId);
}

export async function unfriend(userId: string, friendId: string) {
  await removeFriend(userId, friendId);
}

export async function sendFriendMessage(userId: string, toId: string, body: string) {
  const text = body.trim().slice(0, 500);
  if (text.length < 1) throw new Error("Type a message first.");
  const saved = await insertFriendMessage(userId, toId, text);
  return {
    id: saved.id,
    fromId: userId,
    toId,
    body: text,
    createdAt: saved.createdAt,
  };
}

export async function loadFriendMessages(userId: string, otherId: string) {
  const rows = await listFriendMessages(userId, otherId);
  return rows.map((row) => ({
    id: row.id,
    fromId: row.from_id,
    toId: row.to_id,
    body: row.body,
    createdAt: Date.parse(row.created_at) || Date.now(),
  }));
}

export async function friendIdsOf(userId: string) {
  return listFriendIds(userId);
}

export async function requireFriends(a: string, b: string) {
  if (!(await areFriends(a, b))) throw new Error("You're not friends with them.");
}

export function presenceFromRoom(room: Room | undefined, viewerId: string): Presence {
  if (!room) {
    return {
      online: false,
      roomCode: null,
      mode: null,
      inGame: false,
      isPrivate: true,
      canJoin: false,
    };
  }
  const inGame = room.phase !== "lobby" && room.phase !== "podium";
  const canJoin = room.canJoinWithoutCode(viewerId);
  return {
    online: true,
    roomCode: canJoin ? room.code : null,
    mode: room.mode,
    inGame,
    isPrivate: room.isPrivate,
    canJoin,
  };
}
