export type GameMode = "classic" | "buzzer" | "impostor" | "aux";

export const MIN_PLAYERS: Record<GameMode, number> = {
  classic: 2,
  buzzer: 2,
  impostor: 3,
  aux: 3,
};

export type RoomPhase =
  | "lobby"
  | "classic_submit"
  | "classic_playing"
  | "classic_reveal"
  | "buzzer_playing"
  | "buzzer_buzzed"
  | "buzzer_reveal"
  | "impostor_submit"
  | "impostor_playing"
  | "impostor_reveal"
  | "impostor_recap"
  | "aux_theme"
  | "aux_submit"
  | "aux_listen"
  | "aux_vote"
  | "aux_reveal"
  | "podium";

export type Track = {
  trackId: number;
  title: string;
  artist: string;
  album: string;
  artworkUrl: string;
  previewUrl: string;
};

export type PublicTrack = {
  artworkUrl: string;
  previewUrl: string;
  title?: string;
  artist?: string;
  album?: string;
  trackId?: number;
};

export type Player = {
  id: string;
  name: string;
  avatar: string;
  avatarUrl?: string | null;
  isGuest: boolean;
  score: number;
  isHost: boolean;
  connected: boolean;
};

export type BuzzerView = {
  playStartedAt: number | null;
  previewMs: number;
  buzzedBy: string | null;
  buzzDeadline: number | null;
  track: PublicTrack | null;
  eliminated: string[];
};

export type ClassicView = {
  submitEndsAt: number | null;
  submittedIds: string[];
  yourSubmission: Track | null;
  playStartedAt: number | null;
  previewMs: number;
  roundEndsAt: number | null;
  track: PublicTrack | null;
  isYours: boolean;
  scored: boolean;
  yourPoints: number | null;
  clipIndex: number;
  clipTotal: number;
};

export type ImpostorGuess = {
  submitterId: string;
};

export type ImpostorRecapEntry = {
  track: Track;
  submitterName: string;
};

export type ImpostorView = {
  submittedIds: string[];
  playStartedAt: number | null;
  previewMs: number;
  roundEndsAt: number | null;
  track: PublicTrack | null;
  isYours: boolean;
  yourSubmission: Track | null;
  yourGuess: ImpostorGuess | null;
  guessedCount: number;
  guesserTotal: number;
  clipIndex: number;
  clipTotal: number;
  yourPoints: number | null;
  recap: ImpostorRecapEntry[] | null;
};

export type BuzzerChartId =
  | "top100"
  | "pop"
  | "hiphop"
  | "rock"
  | "dance"
  | "alternative"
  | "rnb"
  | "country"
  | "latin"
  | "electronic"
  | "kpop";

export const BUZZER_CHARTS: { id: BuzzerChartId; label: string }[] = [
  { id: "top100", label: "Today's Top Hits" },
  { id: "pop", label: "Pop" },
  { id: "hiphop", label: "Hip-Hop & Rap" },
  { id: "rock", label: "Rock" },
  { id: "dance", label: "Dance" },
  { id: "alternative", label: "Alternative" },
  { id: "rnb", label: "R&B" },
  { id: "country", label: "Country" },
  { id: "latin", label: "Latin" },
  { id: "electronic", label: "Electronic" },
  { id: "kpop", label: "K-Pop" },
];

export type BuzzerPlaylist = {
  url: string;
  label: string;
  trackCount: number;
};

export type AuxEntry = {
  playerId: string;
  playerName: string;
  track: Track;
  votes: number;
};

export type AuxView = {
  theme: string;
  themeSetterId: string | null;
  submittedIds: string[];
  yourSubmission: Track | null;
  entries: AuxEntry[] | null;
  listenIndex: number;
  listenStartedAt: number | null;
  listenMs: number;
  yourVote: string | null;
  winnerId: string | null;
  votedCount: number;
};

export type RoomPopup = {
  id: number;
  message: string;
};

export type RoomState = {
  code: string;
  youId: string;
  hostId: string;
  mode: GameMode;
  phase: RoomPhase;
  players: Player[];
  round: number;
  totalRounds: number;
  serverNow: number;
  timerEndsAt: number | null;
  timerDurationMs: number;
  isPrivate: boolean;
  buzzerChart: BuzzerChartId;
  buzzerPlaylists: BuzzerPlaylist[];
  classic: ClassicView | null;
  buzzer: BuzzerView | null;
  impostor: ImpostorView | null;
  aux: AuxView | null;
  lastDeltas: Record<string, number> | null;
  popup: RoomPopup | null;
};

export type FriendPresence = {
  id: string;
  username: string;
  avatarUrl: string | null;
  online: boolean;
  roomCode: string | null;
  mode: GameMode | null;
  inGame: boolean;
  isPrivate: boolean;
  canJoin: boolean;
};

export type FriendRequest = {
  id: string;
  username: string;
  avatarUrl: string | null;
  message?: string | null;
};

export type FriendSearchHit = {
  id: string;
  username: string;
  avatarUrl: string | null;
  status: "none" | "friends" | "outgoing" | "incoming";
};

export type FriendMessage = {
  id: string;
  fromId: string;
  toId: string;
  body: string;
  createdAt: number;
};

export type PartyInvite = {
  fromId: string;
  fromName: string;
  code: string;
  mode: GameMode;
};

export type SocialState = {
  friends: FriendPresence[];
  incoming: FriendRequest[];
  outgoing: FriendRequest[];
  invites: PartyInvite[];
};

export type AuthUser = {
  id: string;
  username: string;
  email?: string | null;
  emailVerified?: boolean;
  aboutMe?: string;
  avatarUrl?: string | null;
};

export type SocketAck = {
  ok: boolean;
  error?: string;
  code?: string;
  people?: FriendSearchHit[];
};

export type LobbyPreview = {
  code: string;
  hostName: string;
  players: number;
  maxPlayers: number;
  mode: GameMode;
};

export type AchievementId = "welcome" | "maestro";
export type AchievementSection = "general" | "challenges";

export type AchievementDef = {
  id: AchievementId;
  name: string;
  description: string;
  section: AchievementSection;
};

export const ACHIEVEMENT_SECTIONS: { id: AchievementSection; title: string }[] = [
  { id: "general", title: "General" },
  { id: "challenges", title: "Challenges" },
];

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: "welcome",
    name: "Welcome",
    description: "Register an Aux Party account and join the mix.",
    section: "general",
  },
  {
    id: "maestro",
    name: "Maestro!",
    description: "Win 100 games.",
    section: "challenges",
  },
];

export type AchievementUnlock = {
  id: AchievementId;
  unlockedAt: number;
};

export type AchievementsState = {
  unlocked: AchievementUnlock[];
  wins: number;
};
