import type {
  AuxEntry,
  AuxView,
  BuzzerView,
  ClassicView,
  GameMode,
  ImpostorGuess,
  ImpostorView,
  Player,
  PublicTrack,
  QueuedTrack,
  RoomPhase,
  RoomState,
  Track,
} from "../../shared/types.ts";
import { searchItunes, uniqueTracks } from "./itunes.ts";
import { matchesSong } from "./match.ts";
import { pickSeeds } from "./seeds.ts";

const MAX_PLAYERS = 10;
const PREVIEW_MS = 30_000;
const SUBMIT_MS = 30_000;
const BUZZ_MS = 12_000;
const REVEAL_MS = 7_000;
const AUX_LISTEN_MS = 18_000;
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function maskTrack(track: Track): PublicTrack {
  return { artworkUrl: track.artworkUrl, previewUrl: track.previewUrl };
}

function revealTrack(track: Track): PublicTrack {
  return { ...track };
}

function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function makeRoomCode(taken: Set<string>): string {
  for (let n = 0; n < 40; n++) {
    let code = "";
    for (let i = 0; i < 4; i++) {
      code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    }
    if (!taken.has(code)) return code;
  }
  throw new Error("Could not allocate a room code.");
}

type ImpostorSub = { playerId: string; track: Track };
type AuxSub = { playerId: string; track: Track };

type Identity = {
  id: string;
  name: string;
  isGuest: boolean;
  avatar: string;
  avatarUrl: string | null;
};

export class Room {
  readonly code: string;
  hostId: string;
  mode: GameMode = "classic";
  phase: RoomPhase = "lobby";
  players: Player[] = [];
  round = 0;
  totalRounds = 5;
  queue: QueuedTrack[] = [];
  lastDeltas: Record<string, number> | null = null;

  private timers: ReturnType<typeof setTimeout>[] = [];
  private buzzerPlaylist: Track[] = [];
  private buzzerTrack: Track | null = null;
  private playStartedAt: number | null = null;
  private buzzedBy: string | null = null;
  private buzzDeadline: number | null = null;
  private eliminated = new Set<string>();
  private usedTrackIds = new Set<number>();

  private classicSubs = new Map<string, Track>();
  private classicOrder: { playerId: string; track: Track }[] = [];
  private classicIndex = 0;
  private classicScored = new Map<string, number>();
  private submitEndsAt: number | null = null;

  private impostorSubs = new Map<string, Track>();
  private impostorOrder: ImpostorSub[] = [];
  private impostorIndex = 0;
  private impostorGuesses = new Map<string, ImpostorGuess>();
  private roundEndsAt: number | null = null;

  private theme = "";
  private themeSetterId: string | null = null;
  private auxSubs = new Map<string, Track>();
  private auxEntries: AuxSub[] = [];
  private listenIndex = 0;
  private listenStartedAt: number | null = null;
  private auxVotes = new Map<string, string>();
  private auxWinnerId: string | null = null;

  onChange: (() => void) | null = null;
  onEmpty: (() => void) | null = null;
  private emptyTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(code: string, host: Identity) {
    this.code = code;
    this.hostId = host.id;
    this.players.push({
      id: host.id,
      name: host.name,
      avatar: host.avatar,
      avatarUrl: host.avatarUrl,
      isGuest: host.isGuest,
      score: 0,
      isHost: true,
      connected: true,
    });
  }

  private emit() {
    this.onChange?.();
  }

  private clearTimers() {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
  }

  private later(ms: number, fn: () => void) {
    this.timers.push(setTimeout(fn, ms));
  }

  private player(id: string) {
    return this.players.find((p) => p.id === id);
  }

  private connectedPlayers() {
    return this.players.filter((p) => p.connected);
  }

  private requireHost(id: string) {
    if (id !== this.hostId) throw new Error("Only the host can do that.");
  }

  private requireLobby() {
    if (this.phase !== "lobby") throw new Error("Wait until you're back in the lobby.");
  }

  private award(deltas: Record<string, number>) {
    this.lastDeltas = { ...(this.lastDeltas || {}), ...deltas };
    for (const [id, n] of Object.entries(deltas)) {
      const p = this.player(id);
      if (p) p.score += n;
    }
  }

  join(identity: Identity) {
    const existing = this.player(identity.id);
    if (existing) {
      existing.connected = true;
      existing.name = identity.name;
      existing.avatar = identity.avatar;
      existing.avatarUrl = identity.avatarUrl;
      existing.isGuest = identity.isGuest;
      if (this.emptyTimer) {
        clearTimeout(this.emptyTimer);
        this.emptyTimer = null;
      }
      this.emit();
      return;
    }
    if (this.phase !== "lobby") {
      throw new Error("That party already started. Catch the next round.");
    }
    if (this.players.length >= MAX_PLAYERS) {
      throw new Error("Room is full (10 players).");
    }
    this.players.push({
      id: identity.id,
      name: identity.name,
      avatar: identity.avatar,
      avatarUrl: identity.avatarUrl,
      isGuest: identity.isGuest,
      score: 0,
      isHost: false,
      connected: true,
    });
    this.emit();
  }

  leave(playerId: string) {
    const p = this.player(playerId);
    if (!p) return;
    p.connected = false;
    if (this.phase === "lobby") {
      this.players = this.players.filter((x) => x.id !== playerId);
      this.queue = this.queue.filter((q) => q.addedBy !== playerId);
    }
    if (this.hostId === playerId) {
      const next = this.connectedPlayers()[0] || this.players[0];
      if (next) {
        this.hostId = next.id;
        for (const pl of this.players) pl.isHost = pl.id === this.hostId;
      }
    }
    const remaining = this.connectedPlayers().length;
    if (remaining === 0) {
      this.emptyTimer = setTimeout(() => this.onEmpty?.(), 30_000);
    }
    const inPlay = this.phase !== "lobby" && this.phase !== "podium";
    if (inPlay && remaining < 2) {
      this.finishGame();
      return;
    }
    this.emit();
  }

  rename(playerId: string, name: string) {
    const p = this.player(playerId);
    if (!p) return;
    const trimmed = name.trim().slice(0, 20);
    if (trimmed.length < 2) throw new Error("Name must be at least 2 characters.");
    p.name = trimmed;
    this.emit();
  }

  setMode(playerId: string, _mode: GameMode) {
    this.requireHost(playerId);
    this.requireLobby();
    throw new Error("Game mode is locked once the room is created.");
  }

  setRounds(playerId: string, total: number) {
    this.requireHost(playerId);
    this.requireLobby();
    if (![3, 5, 8].includes(total)) throw new Error("Pick 3, 5, or 8 rounds.");
    this.totalRounds = total;
    this.emit();
  }

  queueTrack(playerId: string, track: Track) {
    this.requireLobby();
    if (!this.player(playerId)) throw new Error("Join the room first.");
    if (this.queue.some((q) => q.trackId === track.trackId)) {
      throw new Error("That track is already in the mix.");
    }
    if (this.queue.length >= 20) throw new Error("Queue is full.");
    this.queue.push({ ...track, addedBy: playerId });
    this.emit();
  }

  clearQueue(playerId: string) {
    this.requireHost(playerId);
    this.requireLobby();
    this.queue = [];
    this.emit();
  }

  async start(playerId: string) {
    this.requireHost(playerId);
    this.requireLobby();
    if (this.connectedPlayers().length < 2) {
      throw new Error("Need at least 2 players to start.");
    }
    for (const p of this.players) p.score = 0;
    this.lastDeltas = null;
    this.round = 0;
    this.usedTrackIds.clear();

    if (this.mode === "classic") {
      this.round = 0;
      this.beginClassicSubmit();
      return;
    }

    if (this.mode === "buzzer") {
      await this.prepareBuzzerPlaylist();
      if (this.buzzerPlaylist.length === 0) {
        throw new Error("Couldn't load tracks from iTunes. Queue some songs or try again.");
      }
      this.totalRounds = Math.min(this.totalRounds, this.buzzerPlaylist.length);
      this.beginBuzzerRound();
      return;
    }

    if (this.mode === "impostor") {
      this.impostorSubs.clear();
      this.impostorGuesses.clear();
      this.impostorOrder = [];
      this.impostorIndex = 0;
      this.phase = "impostor_submit";
      this.emit();
      return;
    }

    this.theme = "";
    this.themeSetterId = this.hostId;
    this.auxSubs.clear();
    this.auxEntries = [];
    this.auxVotes.clear();
    this.auxWinnerId = null;
    this.listenIndex = 0;
    this.phase = "aux_theme";
    this.round = 1;
    this.emit();
  }

  private beginClassicSubmit() {
    this.clearTimers();
    this.classicSubs.clear();
    this.classicOrder = [];
    this.classicIndex = 0;
    this.classicScored.clear();
    this.lastDeltas = null;
    this.round += 1;
    if (this.round > this.totalRounds) {
      this.finishGame();
      return;
    }
    this.phase = "classic_submit";
    this.submitEndsAt = Date.now() + SUBMIT_MS;
    this.later(SUBMIT_MS, () => {
      if (this.phase === "classic_submit") this.beginClassicPlayback();
    });
    this.emit();
  }

  private beginClassicPlayback() {
    this.clearTimers();
    this.submitEndsAt = null;
    this.classicOrder = shuffle(
      [...this.classicSubs.entries()].map(([playerId, track]) => ({ playerId, track })),
    );
    this.classicIndex = 0;
    if (this.classicOrder.length === 0) {
      if (this.round >= this.totalRounds) this.finishGame();
      else this.beginClassicSubmit();
      return;
    }
    this.startClassicClip();
  }

  private startClassicClip() {
    this.clearTimers();
    const current = this.classicOrder[this.classicIndex];
    if (!current) {
      if (this.round >= this.totalRounds) this.finishGame();
      else this.beginClassicSubmit();
      return;
    }
    this.classicScored.clear();
    this.lastDeltas = null;
    this.playStartedAt = Date.now();
    this.roundEndsAt = Date.now() + PREVIEW_MS;
    this.phase = "classic_playing";
    this.later(PREVIEW_MS, () => {
      if (this.phase === "classic_playing") this.classicReveal();
    });
    this.emit();
  }

  classicGuess(playerId: string, title: string) {
    if (this.phase !== "classic_playing") {
      throw new Error("Guessing isn't open.");
    }
    const current = this.classicOrder[this.classicIndex];
    if (!current) throw new Error("No track playing.");
    if (!this.player(playerId)) throw new Error("You're not in this room.");
    if (current.playerId === playerId && this.connectedPlayers().length > 1) {
      throw new Error("You queued this one — sit it out.");
    }
    if (this.classicScored.has(playerId)) {
      throw new Error("You already locked this clip.");
    }
    if (!matchesSong(title, current.track.title)) {
      throw new Error("Not quite — keep guessing.");
    }
    const remaining = Math.max(
      0,
      (this.playStartedAt || Date.now()) + PREVIEW_MS - Date.now(),
    );
    const points = Math.max(1, Math.ceil(remaining / 1000));
    this.classicScored.set(playerId, points);
    this.award({ [playerId]: points });
    const guessers = this.connectedPlayers().filter(
      (p) => p.id !== current.playerId || this.connectedPlayers().length === 1,
    );
    if (guessers.every((p) => this.classicScored.has(p.id))) {
      this.classicReveal();
      return;
    }
    this.emit();
  }

  private classicReveal() {
    this.clearTimers();
    this.phase = "classic_reveal";
    this.emit();
    this.later(REVEAL_MS, () => this.nextClassicClip());
  }

  private nextClassicClip() {
    this.clearTimers();
    this.classicIndex += 1;
    this.startClassicClip();
  }

  private async prepareBuzzerPlaylist() {
    const queued = uniqueTracks(this.queue.map(({ addedBy: _a, ...t }) => t));
    let extra: Track[] = [];
    if (queued.length < this.totalRounds) {
      const seeds = pickSeeds(3);
      const found = (
        await Promise.all(seeds.map((s) => searchItunes(s, 20).catch(() => [] as Track[])))
      ).flat();
      extra = shuffle(uniqueTracks(found)).filter((t) =>
        queued.every((q) => q.trackId !== t.trackId),
      );
    }
    this.buzzerPlaylist = [...queued, ...extra].slice(0, Math.max(this.totalRounds, 1));
  }

  private beginBuzzerRound() {
    this.clearTimers();
    this.eliminated.clear();
    this.buzzedBy = null;
    this.buzzDeadline = null;
    this.lastDeltas = null;
    const track = this.buzzerPlaylist[this.round];
    if (!track) {
      this.finishGame();
      return;
    }
    this.round += 1;
    this.buzzerTrack = track;
    this.usedTrackIds.add(track.trackId);
    this.playStartedAt = Date.now();
    this.phase = "buzzer_playing";
    this.later(PREVIEW_MS, () => {
      if (this.phase === "buzzer_playing" || this.phase === "buzzer_buzzed") {
        this.buzzerReveal();
      }
    });
    this.emit();
  }

  buzz(playerId: string) {
    if (this.phase !== "buzzer_playing") {
      throw new Error("You can't buzz right now.");
    }
    if (!this.player(playerId)) throw new Error("You're not in this room.");
    if (this.eliminated.has(playerId)) {
      throw new Error("You already burned this round.");
    }
    this.buzzedBy = playerId;
    this.buzzDeadline = Date.now() + BUZZ_MS;
    this.phase = "buzzer_buzzed";
    this.later(BUZZ_MS, () => {
      if (this.phase === "buzzer_buzzed" && this.buzzedBy === playerId) {
        this.eliminated.add(playerId);
        this.resumeAfterWrongBuzz();
      }
    });
    this.emit();
  }

  buzzerGuess(playerId: string, title: string) {
    if (this.phase !== "buzzer_buzzed" || this.buzzedBy !== playerId) {
      throw new Error("It's not your buzz.");
    }
    const track = this.buzzerTrack;
    if (!track) throw new Error("No track playing.");
    if (matchesSong(title, track.title)) {
      const remaining = Math.max(
        0,
        (this.playStartedAt || Date.now()) + PREVIEW_MS - Date.now(),
      );
      const points = Math.round(60 + (remaining / 1000) * 4);
      this.award({ [playerId]: points });
      this.buzzerReveal();
      return;
    }
    this.eliminated.add(playerId);
    this.resumeAfterWrongBuzz();
  }

  private resumeAfterWrongBuzz() {
    this.clearTimers();
    this.buzzedBy = null;
    this.buzzDeadline = null;
    const elapsed = Date.now() - (this.playStartedAt || Date.now());
    const left = PREVIEW_MS - elapsed;
    const alive = this.connectedPlayers().filter((p) => !this.eliminated.has(p.id));
    if (left <= 400 || alive.length === 0) {
      this.buzzerReveal();
      return;
    }
    this.phase = "buzzer_playing";
    this.later(left, () => {
      if (this.phase === "buzzer_playing" || this.phase === "buzzer_buzzed") {
        this.buzzerReveal();
      }
    });
    this.emit();
  }

  private buzzerReveal() {
    this.clearTimers();
    this.phase = "buzzer_reveal";
    this.buzzedBy = null;
    this.buzzDeadline = null;
    this.emit();
    this.later(REVEAL_MS, () => this.advanceFromBuzzerReveal());
  }

  advance(playerId: string) {
    this.requireHost(playerId);
    if (this.phase === "classic_reveal") {
      this.nextClassicClip();
      return;
    }
    if (this.phase === "buzzer_reveal") {
      this.advanceFromBuzzerReveal();
      return;
    }
    if (this.phase === "impostor_reveal") {
      this.nextImpostorOrFinish();
      return;
    }
    if (this.phase === "aux_listen") {
      this.nextAuxListen();
      return;
    }
    if (this.phase === "aux_reveal") {
      this.nextAuxRoundOrFinish();
      return;
    }
    if (this.phase === "podium") {
      this.backToLobby();
      return;
    }
    throw new Error("Nothing to advance.");
  }

  private advanceFromBuzzerReveal() {
    this.clearTimers();
    if (this.round >= this.totalRounds || this.round >= this.buzzerPlaylist.length) {
      this.finishGame();
      return;
    }
    this.beginBuzzerRound();
  }

  submitTrack(playerId: string, track: Track) {
    if (!this.player(playerId)) throw new Error("You're not in this room.");
    if (this.phase === "classic_submit") {
      this.classicSubs.set(playerId, track);
      this.emit();
      if (this.allConnectedSubmitted(this.classicSubs)) {
        this.beginClassicPlayback();
      }
      return;
    }
    if (this.phase === "impostor_submit") {
      this.impostorSubs.set(playerId, track);
      this.emit();
      if (this.allConnectedSubmitted(this.impostorSubs)) {
        this.beginImpostorPlayback();
      }
      return;
    }
    if (this.phase === "aux_submit") {
      this.auxSubs.set(playerId, track);
      this.emit();
      if (this.allConnectedSubmitted(this.auxSubs)) {
        this.beginAuxListen();
      }
      return;
    }
    throw new Error("You can't submit a track right now.");
  }

  private allConnectedSubmitted(map: Map<string, Track>) {
    const needed = this.connectedPlayers();
    return needed.length > 0 && needed.every((p) => map.has(p.id));
  }

  private beginImpostorPlayback() {
    this.clearTimers();
    this.impostorOrder = shuffle(
      [...this.impostorSubs.entries()].map(([playerId, track]) => ({ playerId, track })),
    );
    this.impostorIndex = 0;
    this.totalRounds = this.impostorOrder.length;
    this.startImpostorRound();
  }

  private startImpostorRound() {
    this.clearTimers();
    const current = this.impostorOrder[this.impostorIndex];
    if (!current) {
      this.finishGame();
      return;
    }
    this.round = this.impostorIndex + 1;
    this.impostorGuesses.clear();
    this.lastDeltas = null;
    this.playStartedAt = Date.now();
    this.roundEndsAt = Date.now() + PREVIEW_MS;
    this.phase = "impostor_playing";
    this.later(PREVIEW_MS, () => {
      if (this.phase === "impostor_playing") this.impostorReveal();
    });
    this.emit();
  }

  impostorGuess(playerId: string, guess: ImpostorGuess) {
    if (this.phase !== "impostor_playing") {
      throw new Error("Guessing is closed.");
    }
    const current = this.impostorOrder[this.impostorIndex];
    if (!current) throw new Error("No track playing.");
    if (current.playerId === playerId) {
      throw new Error("You added this one — sit it out.");
    }
    if (!guess.submitterId) throw new Error("Pick who you think added it.");
    this.impostorGuesses.set(playerId, {
      title: guess.title.trim(),
      artist: (guess.artist || "").trim(),
      submitterId: guess.submitterId,
    });
    this.emit();
  }

  private impostorReveal() {
    this.clearTimers();
    const current = this.impostorOrder[this.impostorIndex];
    if (!current) {
      this.finishGame();
      return;
    }
    const deltas: Record<string, number> = {};
    let identified = 0;
    for (const [pid, guess] of this.impostorGuesses) {
      const songOk = matchesSong(guess.title, current.track.title);
      const whoOk = guess.submitterId === current.playerId;
      if (songOk) {
        deltas[pid] = (deltas[pid] || 0) + 80;
      }
      if (whoOk) {
        deltas[pid] = (deltas[pid] || 0) + 70;
        identified += 1;
      }
    }
    const guessers = this.connectedPlayers().filter((p) => p.id !== current.playerId);
    if (guessers.length > 0 && identified < Math.ceil(guessers.length / 2)) {
      deltas[current.playerId] = (deltas[current.playerId] || 0) + 40;
    }
    this.award(deltas);
    this.phase = "impostor_reveal";
    this.emit();
    this.later(REVEAL_MS + 2000, () => this.nextImpostorOrFinish());
  }

  private nextImpostorOrFinish() {
    this.clearTimers();
    this.impostorIndex += 1;
    if (this.impostorIndex >= this.impostorOrder.length) {
      this.finishGame();
      return;
    }
    this.startImpostorRound();
  }

  setTheme(playerId: string, theme: string) {
    if (this.phase !== "aux_theme") throw new Error("Theme is already set.");
    if (playerId !== this.themeSetterId && playerId !== this.hostId) {
      throw new Error("Only the aux holder sets the theme.");
    }
    const t = theme.trim().slice(0, 80);
    if (t.length < 2) throw new Error("Give the room a real theme.");
    this.theme = t;
    this.auxSubs.clear();
    this.auxVotes.clear();
    this.auxWinnerId = null;
    this.auxEntries = [];
    this.phase = "aux_submit";
    this.emit();
  }

  private beginAuxListen() {
    this.clearTimers();
    this.auxEntries = shuffle(
      [...this.auxSubs.entries()].map(([playerId, track]) => ({ playerId, track })),
    );
    this.listenIndex = 0;
    this.auxVotes.clear();
    this.startAuxListenClip();
  }

  private startAuxListenClip() {
    this.clearTimers();
    if (this.listenIndex >= this.auxEntries.length) {
      this.phase = "aux_vote";
      this.emit();
      return;
    }
    this.phase = "aux_listen";
    this.listenStartedAt = Date.now();
    this.later(AUX_LISTEN_MS, () => this.nextAuxListen());
    this.emit();
  }

  private nextAuxListen() {
    this.clearTimers();
    this.listenIndex += 1;
    this.startAuxListenClip();
  }

  vote(playerId: string, targetId: string) {
    if (this.phase !== "aux_vote") throw new Error("Voting isn't open.");
    if (!this.player(playerId)) throw new Error("You're not in this room.");
    if (playerId === targetId) throw new Error("You can't vote for yourself.");
    if (!this.auxEntries.some((e) => e.playerId === targetId)) {
      throw new Error("That submission isn't in this round.");
    }
    this.auxVotes.set(playerId, targetId);
    this.emit();
    const voters = this.connectedPlayers();
    if (voters.every((p) => this.auxVotes.has(p.id))) {
      this.auxReveal();
    }
  }

  private auxReveal() {
    this.clearTimers();
    const counts = new Map<string, number>();
    for (const target of this.auxVotes.values()) {
      counts.set(target, (counts.get(target) || 0) + 1);
    }
    let winner = this.auxEntries[0]?.playerId || this.hostId;
    let best = -1;
    for (const entry of this.auxEntries) {
      const n = counts.get(entry.playerId) || 0;
      if (n > best) {
        best = n;
        winner = entry.playerId;
      }
    }
    this.auxWinnerId = winner;
    this.themeSetterId = winner;
    this.award({ [winner]: 100 });
    this.phase = "aux_reveal";
    this.emit();
    this.later(REVEAL_MS + 2000, () => this.nextAuxRoundOrFinish());
  }

  private nextAuxRoundOrFinish() {
    this.clearTimers();
    if (this.round >= this.totalRounds) {
      this.finishGame();
      return;
    }
    this.round += 1;
    this.theme = "";
    this.auxSubs.clear();
    this.auxEntries = [];
    this.auxVotes.clear();
    this.listenIndex = 0;
    this.lastDeltas = null;
    this.auxWinnerId = null;
    this.phase = "aux_theme";
    this.emit();
  }

  private finishGame() {
    this.clearTimers();
    this.phase = "podium";
    this.emit();
  }

  backToLobby(playerId?: string) {
    if (playerId) this.requireHost(playerId);
    this.clearTimers();
    this.phase = "lobby";
    this.round = 0;
    this.buzzerTrack = null;
    this.playStartedAt = null;
    this.buzzedBy = null;
    this.classicSubs.clear();
    this.classicOrder = [];
    this.classicScored.clear();
    this.submitEndsAt = null;
    this.impostorSubs.clear();
    this.impostorOrder = [];
    this.impostorGuesses.clear();
    this.auxSubs.clear();
    this.auxEntries = [];
    this.auxVotes.clear();
    this.theme = "";
    this.lastDeltas = null;
    this.emit();
  }

  viewFor(playerId: string): RoomState {
    return {
      code: this.code,
      youId: playerId,
      hostId: this.hostId,
      mode: this.mode,
      phase: this.phase,
      players: this.players.map((p) => ({ ...p, isHost: p.id === this.hostId })),
      round: this.round,
      totalRounds: this.totalRounds,
      serverNow: Date.now(),
      queue: this.queue,
      classic: this.classicView(playerId),
      buzzer: this.buzzerView(),
      impostor: this.impostorView(playerId),
      aux: this.auxView(playerId),
      lastDeltas: this.lastDeltas,
    };
  }

  private classicView(playerId: string): ClassicView | null {
    if (
      this.phase !== "classic_submit" &&
      this.phase !== "classic_playing" &&
      this.phase !== "classic_reveal"
    ) {
      return null;
    }
    const current = this.classicOrder[this.classicIndex];
    const showTrack = this.phase === "classic_playing" || this.phase === "classic_reveal";
    return {
      submitEndsAt: this.submitEndsAt,
      submittedIds: [...this.classicSubs.keys()],
      yourSubmission: this.classicSubs.get(playerId) || null,
      playStartedAt: this.playStartedAt,
      previewMs: PREVIEW_MS,
      roundEndsAt: this.roundEndsAt,
      track:
        showTrack && current
          ? this.phase === "classic_reveal"
            ? revealTrack(current.track)
            : maskTrack(current.track)
          : null,
      isYours: Boolean(current && current.playerId === playerId),
      scored: this.classicScored.has(playerId),
      yourPoints: this.classicScored.get(playerId) ?? null,
      clipIndex: this.classicIndex,
      clipTotal: this.classicOrder.length,
    };
  }

  private buzzerView(): BuzzerView | null {
    if (
      this.phase !== "buzzer_playing" &&
      this.phase !== "buzzer_buzzed" &&
      this.phase !== "buzzer_reveal"
    ) {
      return null;
    }
    const track = this.buzzerTrack;
    return {
      playStartedAt: this.playStartedAt,
      previewMs: PREVIEW_MS,
      buzzedBy: this.buzzedBy,
      buzzDeadline: this.buzzDeadline,
      track: track
        ? this.phase === "buzzer_reveal"
          ? revealTrack(track)
          : maskTrack(track)
        : null,
      eliminated: [...this.eliminated],
    };
  }

  private impostorView(playerId: string): ImpostorView | null {
    if (
      this.phase !== "impostor_submit" &&
      this.phase !== "impostor_playing" &&
      this.phase !== "impostor_reveal"
    ) {
      return null;
    }
    const current = this.impostorOrder[this.impostorIndex];
    const showReveal = this.phase === "impostor_reveal" && current;
    return {
      submittedIds: [...this.impostorSubs.keys()],
      playStartedAt: this.playStartedAt,
      previewMs: PREVIEW_MS,
      roundEndsAt: this.roundEndsAt,
      track: current
        ? this.phase === "impostor_reveal"
          ? revealTrack(current.track)
          : this.phase === "impostor_playing"
            ? maskTrack(current.track)
            : null
        : null,
      isYours: Boolean(current && current.playerId === playerId),
      yourSubmission: this.impostorSubs.get(playerId) || null,
      yourGuess: this.impostorGuesses.get(playerId) || null,
      reveal: showReveal
        ? {
            track: current.track,
            submitterId: current.playerId,
            submitterName: this.player(current.playerId)?.name || "Unknown",
            guesses: [...this.impostorGuesses.entries()].map(([pid, guess]) => ({
              playerId: pid,
              playerName: this.player(pid)?.name || "Unknown",
              ...guess,
              songOk: matchesSong(guess.title, current.track.title),
              whoOk: guess.submitterId === current.playerId,
            })),
          }
        : null,
    };
  }

  private auxView(playerId: string): AuxView | null {
    if (
      this.phase !== "aux_theme" &&
      this.phase !== "aux_submit" &&
      this.phase !== "aux_listen" &&
      this.phase !== "aux_vote" &&
      this.phase !== "aux_reveal"
    ) {
      return null;
    }
    const showEntries =
      this.phase === "aux_listen" || this.phase === "aux_vote" || this.phase === "aux_reveal";
    const voteCounts = new Map<string, number>();
    if (this.phase === "aux_reveal") {
      for (const target of this.auxVotes.values()) {
        voteCounts.set(target, (voteCounts.get(target) || 0) + 1);
      }
    }
    const entries: AuxEntry[] | null = showEntries
      ? this.auxEntries.map((e) => ({
          playerId: e.playerId,
          playerName: this.player(e.playerId)?.name || "Unknown",
          track: e.track,
          votes: voteCounts.get(e.playerId) || 0,
        }))
      : null;
    return {
      theme: this.theme,
      themeSetterId: this.themeSetterId,
      submittedIds: [...this.auxSubs.keys()],
      yourSubmission: this.auxSubs.get(playerId) || null,
      entries,
      listenIndex: this.listenIndex,
      listenStartedAt: this.listenStartedAt,
      listenMs: AUX_LISTEN_MS,
      yourVote: this.auxVotes.get(playerId) || null,
      winnerId: this.phase === "aux_reveal" ? this.auxWinnerId : null,
      votedCount: this.auxVotes.size,
    };
  }

  destroy() {
    this.clearTimers();
    if (this.emptyTimer) clearTimeout(this.emptyTimer);
  }
}

export class RoomManager {
  private rooms = new Map<string, Room>();

  get(code: string) {
    return this.rooms.get(code.toUpperCase());
  }

  create(identity: Identity, mode?: GameMode) {
    const code = makeRoomCode(new Set(this.rooms.keys()));
    const room = new Room(code, identity);
    if (mode) room.mode = mode;
    room.onEmpty = () => this.remove(code);
    this.rooms.set(code, room);
    return room;
  }

  listLobbies() {
    return [...this.rooms.values()]
      .filter((room) => room.phase === "lobby")
      .map((room) => {
        const host = room.players.find((p) => p.isHost) || room.players[0];
        return {
          code: room.code,
          hostName: host?.name || "Someone",
          players: room.players.filter((p) => p.connected).length,
          maxPlayers: 10,
          mode: room.mode,
        };
      })
      .filter((room) => room.players > 0);
  }

  remove(code: string) {
    const room = this.rooms.get(code);
    if (!room) return;
    room.destroy();
    this.rooms.delete(code);
  }
}
