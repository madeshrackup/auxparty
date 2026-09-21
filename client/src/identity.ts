const GUEST_ID = "aux_guest_id";
const GUEST_NAME = "aux_guest_name";
const AVATAR_KEY = "aux_avatar";

export const AVATAR_IDS = ["disco", "bass", "vinyl", "mic", "wave", "aux"] as const;
export type AvatarId = (typeof AVATAR_IDS)[number];

export function getGuestId(): string {
  let id = localStorage.getItem(GUEST_ID);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(GUEST_ID, id);
  }
  return id;
}

function randomNickname(): string {
  return `AuxGuest${Math.floor(1000 + Math.random() * 9000)}`;
}

export function getGuestName(): string {
  let name = localStorage.getItem(GUEST_NAME);
  if (!name) {
    name = randomNickname();
    localStorage.setItem(GUEST_NAME, name);
  }
  return name;
}

export function setGuestName(name: string) {
  localStorage.setItem(GUEST_NAME, name.trim().slice(0, 20));
}

export function getAvatar(): AvatarId {
  const raw = localStorage.getItem(AVATAR_KEY);
  if (raw && (AVATAR_IDS as readonly string[]).includes(raw)) return raw as AvatarId;
  const picked = AVATAR_IDS[Math.floor(Math.random() * AVATAR_IDS.length)];
  localStorage.setItem(AVATAR_KEY, picked);
  return picked;
}

export function setAvatar(id: AvatarId) {
  localStorage.setItem(AVATAR_KEY, id);
}

export function clearGuestData() {
  localStorage.removeItem(GUEST_ID);
  localStorage.removeItem(GUEST_NAME);
  localStorage.removeItem(AVATAR_KEY);
}

export function nextAvatar(id: AvatarId, dir: 1 | -1): AvatarId {
  const i = AVATAR_IDS.indexOf(id);
  const next = (i + dir + AVATAR_IDS.length) % AVATAR_IDS.length;
  return AVATAR_IDS[next];
}
