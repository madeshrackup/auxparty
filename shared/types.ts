export type GameMode = "classic" | "buzzer" | "impostor" | "aux";

export const GAME_MODE_ORDER: GameMode[] = ["classic", "buzzer", "impostor", "aux"];

export const GAME_MODE_LABELS: Record<GameMode, string> = {
  classic: "Classic",
  buzzer: "Buzzer Beater",
  impostor: "Who Added This?",
  aux: "Pass the Aux",
};

export const GAME_MODE_BLURBS: Record<GameMode, string> = {
  classic:
    "Pick a song for the party to name. You then have 30 seconds to name the songs submitted by the other players. Answer as quick as you can for the most points!",
  buzzer:
    "Press the buzzer when you think you know what song is playing! You'll get 10 seconds to submit your answer and then you're locked out. Answer as quick as you can for the most points!",
  impostor:
    "Players will choose a song. The party will then need to guess which player chose that song. Throw off your friends by choosing a song they're known for listening to. Answer as quick as you can for the most points!",
  aux: "The DJ will be tasked with creating a prompt for the party to follow. Players will all need to choose a song that matches the prompt. Player with the most votes wins that round and becomes the DJ.",
};

export type ModeRecord = {
  wins: number;
  points: number;
};

export type PlayerStats = {
  wins: number;
  points: number;
  trophies: number;
  modes: Record<GameMode, ModeRecord>;
};

export function emptyModeRecord(): ModeRecord {
  return { wins: 0, points: 0 };
}

export function emptyPlayerStats(): PlayerStats {
  return {
    wins: 0,
    points: 0,
    trophies: 0,
    modes: {
      classic: emptyModeRecord(),
      buzzer: emptyModeRecord(),
      impostor: emptyModeRecord(),
      aux: emptyModeRecord(),
    },
  };
}

export const MIN_PLAYERS: Record<GameMode, number> = {
  classic: 2,
  buzzer: 2,
  impostor: 3,
  aux: 3,
};

export const MIN_ROUNDS = 1;
export const MAX_ROUNDS = 30;

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
  answerMs: number;
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
  yours: boolean;
  guessedName: string | null;
  correct: boolean | null;
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
  | "kpop"
  | "custom";

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
  { id: "custom", label: "Custom playlist" },
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
  voterTotal: number;
  runoffIds: string[] | null;
  uncontested: boolean;
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

export type AchievementId =
  | "welcome"
  | "start_a_band"
  | "first_of_many"
  | "maestro"
  | "backup_act"
  | "party_host"
  | "sonic"
  | "patience"
  | "wizard"
  | "self_sabotage"
  | "trigger_happy"
  | "butterfingers"
  | "snatcher"
  | "betrayal"
  | "in_plain_sight"
  | "mastermind";

export type AchievementSection = "general" | "classic" | "buzzer" | "impostor";

export type AchievementDef = {
  id: AchievementId;
  name: string;
  description: string;
  how: string;
  section: AchievementSection;
};

export const ACHIEVEMENT_SECTIONS: { id: AchievementSection; title: string }[] = [
  { id: "general", title: "General" },
  { id: "classic", title: "Classic" },
  { id: "buzzer", title: "Buzzer Beater" },
  { id: "impostor", title: "Who Added This?" },
];

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: "welcome",
    name: "Welcome",
    description: "Enjoy the party!",
    how: "Register an Aux Party account.",
    section: "general",
  },
  {
    id: "start_a_band",
    name: "Let’s Start A Band",
    description: "Everything’s better with friends!",
    how: "Play a party with someone on your friends list.",
    section: "general",
  },
  {
    id: "first_of_many",
    name: "First Of Many",
    description: "The start of something great.",
    how: "Win your first game.",
    section: "general",
  },
  {
    id: "maestro",
    name: "Maestro",
    description: "Something great.",
    how: "Win your 100th game.",
    section: "general",
  },
  {
    id: "backup_act",
    name: "Backup Act",
    description: "Now I know how Salieri felt.",
    how: "Place 2nd in any game mode.",
    section: "general",
  },
  {
    id: "party_host",
    name: "Party Host",
    description: "Coolest kid on the block.",
    how: "Be the host of a full 10-player lobby.",
    section: "general",
  },
  {
    id: "sonic",
    name: "Sonic",
    description: "Sonic! Do you get it?",
    how: "Guess a song correctly within the first 3.0s of the clock in classic.",
    section: "classic",
  },
  {
    id: "patience",
    name: "Patience",
    description: "It’s a virtue.",
    how: "Guess a song correctly with under 3.0s left on the clock in classic.",
    section: "classic",
  },
  {
    id: "wizard",
    name: "You’re A Wizard",
    description: "Shazam!",
    how: "Guess every played track correctly in a match of classic (min. 5 rounds).",
    section: "classic",
  },
  {
    id: "self_sabotage",
    name: "Self-Sabotage",
    description: "Oops…",
    how: "Let the 30-second song selection timer expire without choosing a track (-15 pt penalty).",
    section: "classic",
  },
  {
    id: "trigger_happy",
    name: "Trigger Happy",
    description: "Get outta my way!",
    how: "Buzz in first on 5 consecutive clips.",
    section: "buzzer",
  },
  {
    id: "butterfingers",
    name: "Butterfingers",
    description: "D’oh!",
    how: "Hit the buzzer first, but let the timer run out or type the wrong title.",
    section: "buzzer",
  },
  {
    id: "snatcher",
    name: "Snatcher",
    description: "Dibs!",
    how: "Answer correctly within 8 seconds after another player buzzed in and missed.",
    section: "buzzer",
  },
  {
    id: "betrayal",
    name: "Betrayal",
    description: "I thought I knew you…",
    how: "In a room with a player on your friends list, guess the wrong owner for a track submitted by them.",
    section: "impostor",
  },
  {
    id: "in_plain_sight",
    name: "In Plain Sight",
    description: "Quick, hide behind that conveniently shaped lamp!",
    how: "Submit a song in Who Added This? where nobody selects your name as the one who submitted it.",
    section: "impostor",
  },
  {
    id: "mastermind",
    name: "Mastermind",
    description: "Two steps ahead.",
    how: "Score a perfect identification round in every round of Who Added This? (min. 5).",
    section: "impostor",
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

export type AchievementUnlockedPayload = {
  id: AchievementId;
  name: string;
  description: string;
};
