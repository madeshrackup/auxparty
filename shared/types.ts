export type GameMode = "classic" | "buzzer" | "impostor" | "aux";

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
  title: string;
  artist: string;
  submitterId: string;
};

export type ImpostorGuessResult = ImpostorGuess & {
  playerId: string;
  playerName: string;
  songOk: boolean;
  whoOk: boolean;
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
  reveal: {
    track: Track;
    submitterId: string;
    submitterName: string;
    guesses: ImpostorGuessResult[];
  } | null;
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

export type QueuedTrack = Track & {
  addedBy: string;
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
  queue: QueuedTrack[];
  classic: ClassicView | null;
  buzzer: BuzzerView | null;
  impostor: ImpostorView | null;
  aux: AuxView | null;
  lastDeltas: Record<string, number> | null;
};

export type AuthUser = {
  id: string;
  username: string;
  email?: string | null;
  emailVerified?: boolean;
};

export type SocketAck = {
  ok: boolean;
  error?: string;
  code?: string;
};

export type LobbyPreview = {
  code: string;
  hostName: string;
  players: number;
  maxPlayers: number;
  mode: GameMode;
};
