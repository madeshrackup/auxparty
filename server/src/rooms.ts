import type {
  AuxEntry,
  AuxView,
  BuzzerChartId,
  BuzzerPlaylist,
  BuzzerView,
  ClassicView,
  GameMode,
  ImpostorGuess,
  ImpostorView,
  Player,
  PublicTrack,
  RoomPhase,
  RoomState,
  Track,
} from "../../shared/types.ts";
import { MIN_PLAYERS } from "../../shared/types.ts";
import { fetchChart, resolvePlaylist, uniqueTracks } from "./itunes.ts";
import { matchesSong } from "./match.ts";
import { isBuzzerChart } from "./seeds.ts";

const MAX_PLAYERS = 10;
const PREVIEW_MS = 30_000;
const SUBMIT_MS = 30_000;
const MISS_SUBMIT_PENALTY = -15;
const MISS_SUBMIT_POPUP = "-15pts penalty for not submitting a song";
const BUZZ_MS = 12_000;
const REVEAL_MS = 10_000;
const CLIP_RESULT_MS = 4_000;
const RECAP_MS = 12_000;
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
  isPrivate = true;
  buzzerChart: BuzzerChartId = "top100";
  buzzerPlaylists: BuzzerPlaylist[] = [];
  invitedIds = new Set<string>();
  lastDeltas: Record<string, number> | null = null;

  private timers: ReturnType<typeof setTimeout>[] = [];
  private buzzerPlaylist: Track[] = [];
  private buzzerPlaylistTracks = new Map<string, Track[]>();
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
  private impostorPoints = new Map<string, number>();
  private impostorCycle = 0;
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
  private timerEndsAt: number | null = null;
  private timerDurationMs = 0;
  private popupId = 0;
  private penaltyPopupIds = new Set<string>();

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
    this.timerEndsAt = null;
    this.timerDurationMs = 0;
  }

  private later(ms: number, fn: () => void) {
    this.clearTimers();
    this.timerEndsAt = Date.now() + ms;
    this.timerDurationMs = ms;
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

  private penalizeMissingSubmissions(subs: Map<string, Track>) {
    this.penaltyPopupIds.clear();
    const deltas: Record<string, number> = {};
    for (const p of this.connectedPlayers()) {
      if (subs.has(p.id)) continue;
      deltas[p.id] = MISS_SUBMIT_PENALTY;
      this.penaltyPopupIds.add(p.id);
    }
    if (this.penaltyPopupIds.size === 0) return;
    this.popupId += 1;
    this.award(deltas);
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
    if (this.phase === "podium") {
      throw new Error("This party already wrapped. Catch the next one.");
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
    if (this.phase === "aux_theme" && this.themeSetterId === playerId) {
      this.themeSetterId = this.connectedPlayers()[0]?.id || this.hostId;
    }
    const inPlay = this.phase !== "lobby" && this.phase !== "podium";
    if (inPlay && remaining < MIN_PLAYERS[this.mode]) {
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

  setPrivate(playerId: string, isPrivate: boolean) {
    this.requireHost(playerId);
    this.requireLobby();
    this.isPrivate = Boolean(isPrivate);
    this.emit();
  }

  invitePlayer(playerId: string, friendId: string) {
    if (!this.player(playerId)) throw new Error("Join the room first.");
    this.invitedIds.add(friendId);
  }

  canJoinWithoutCode(userId: string) {
    if (!this.isPrivate) return true;
    if (this.invitedIds.has(userId)) return true;
    return Boolean(this.player(userId));
  }

  setBuzzerChart(playerId: string, chart: BuzzerChartId) {
    this.requireHost(playerId);
    this.requireLobby();
    if (this.mode !== "buzzer") throw new Error("Charts are for Buzzer Beater.");
    if (!isBuzzerChart(chart)) throw new Error("Pick a chart.");
    this.buzzerChart = chart;
    this.emit();
  }

  async addBuzzerPlaylist(playerId: string, url: string) {
    this.requireHost(playerId);
    this.requireLobby();
    if (this.mode !== "buzzer") throw new Error("Playlists are for Buzzer Beater.");
    if (this.buzzerPlaylists.length >= 6) throw new Error("That's enough playlists for one night.");
    const { label, tracks } = await resolvePlaylist(url);
    if (this.buzzerPlaylists.some((p) => p.url === url.trim())) {
      throw new Error("That playlist is already in the mix.");
    }
    this.buzzerPlaylists.push({ url: url.trim(), label, trackCount: tracks.length });
    this.buzzerPlaylistTracks.set(url.trim(), tracks);
    this.emit();
  }

  removeBuzzerPlaylist(playerId: string, url: string) {
    this.requireHost(playerId);
    this.requireLobby();
    this.buzzerPlaylists = this.buzzerPlaylists.filter((p) => p.url !== url);
    this.buzzerPlaylistTracks.delete(url);
    this.emit();
  }

  async start(playerId: string) {
    this.requireHost(playerId);
    this.requireLobby();
    const min = MIN_PLAYERS[this.mode];
    if (this.connectedPlayers().length < min) {
      throw new Error(`Need at least ${min} players to start.`);
    }
    for (const p of this.players) p.score = 0;
    this.lastDeltas = null;
    this.penaltyPopupIds.clear();
    this.round = 0;
    this.usedTrackIds.clear();
    this.impostorCycle = 0;

    if (this.mode === "classic") {
      this.round = 0;
      this.beginClassicSubmit();
      return;
    }

    if (this.mode === "buzzer") {
      await this.prepareBuzzerPlaylist();
      if (this.buzzerPlaylist.length === 0) {
        throw new Error("Couldn't load tracks. Try another chart, add a playlist, or try again.");
      }
      this.totalRounds = Math.min(this.totalRounds, this.buzzerPlaylist.length);
      this.beginBuzzerRound();
      return;
    }

    if (this.mode === "impostor") {
      this.beginImpostorSubmit();
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
    if (this.penaltyPopupIds.size === 0) this.lastDeltas = null;
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
    this.penalizeMissingSubmissions(this.classicSubs);
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
    if (this.classicIndex > 0) this.lastDeltas = null;
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
      throw new Error("You picked this one — sit it out.");
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
    this.later(REVEAL_MS, () => this.nextClassicClip());
    this.emit();
  }

  private nextClassicClip() {
    this.clearTimers();
    this.classicIndex += 1;
    this.startClassicClip();
  }

  private async prepareBuzzerPlaylist() {
    const fromPlaylists = uniqueTracks(
      this.buzzerPlaylists.flatMap((p) => this.buzzerPlaylistTracks.get(p.url) || []),
    );
    let extras: Track[] = [];
    if (fromPlaylists.length < Math.max(this.totalRounds, 8)) {
      extras = await fetchChart(this.buzzerChart).catch(() => [] as Track[]);
    }
    const mixed = uniqueTracks([
      ...fromPlaylists,
      ...extras.filter((t) => fromPlaylists.every((q) => q.trackId !== t.trackId)),
    ]);
    this.buzzerPlaylist = shuffle(mixed).slice(0, Math.max(this.totalRounds, 1));
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
      throw new Error("You already burned this clip — hang tight for the next song.");
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
    this.later(REVEAL_MS, () => this.advanceFromBuzzerReveal());
    this.emit();
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
    if (this.phase === "impostor_recap") {
      this.afterImpostorRecap();
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

  private beginImpostorSubmit() {
    this.clearTimers();
    this.impostorSubs.clear();
    this.impostorGuesses.clear();
    this.impostorPoints.clear();
    this.impostorOrder = [];
    this.impostorIndex = 0;
    this.impostorCycle += 1;
    this.round = this.impostorCycle;
    this.lastDeltas = null;
    if (this.impostorCycle > this.totalRounds) {
      this.finishGame();
      return;
    }
    this.phase = "impostor_submit";
    this.later(SUBMIT_MS, () => {
      if (this.phase === "impostor_submit") this.beginImpostorPlayback();
    });
    this.emit();
  }

  private beginImpostorPlayback() {
    this.clearTimers();
    this.impostorOrder = shuffle(
      [...this.impostorSubs.entries()].map(([playerId, track]) => ({ playerId, track })),
    );
    this.impostorIndex = 0;
    if (this.impostorOrder.length === 0) {
      this.afterImpostorRecap();
      return;
    }
    this.startImpostorClip();
  }

  private startImpostorClip() {
    this.clearTimers();
    const current = this.impostorOrder[this.impostorIndex];
    if (!current) {
      this.beginImpostorRecap();
      return;
    }
    this.impostorGuesses.clear();
    this.impostorPoints.clear();
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
    if (!this.player(guess.submitterId)) throw new Error("That player isn't in the room.");
    if (this.impostorGuesses.has(playerId)) {
      throw new Error("You already locked this one in.");
    }
    this.impostorGuesses.set(playerId, { submitterId: guess.submitterId });
    const guessers = this.impostorGuessers();
    if (guessers.length > 0 && guessers.every((p) => this.impostorGuesses.has(p.id))) {
      this.impostorReveal();
      return;
    }
    this.emit();
  }

  private impostorGuessers() {
    const current = this.impostorOrder[this.impostorIndex];
    return this.connectedPlayers().filter((p) => p.id !== current?.playerId);
  }

  private impostorReveal() {
    this.clearTimers();
    const current = this.impostorOrder[this.impostorIndex];
    if (!current) {
      this.beginImpostorRecap();
      return;
    }
    const remainingSec = Math.max(
      0,
      Math.ceil(((this.playStartedAt || Date.now()) + PREVIEW_MS - Date.now()) / 1000),
    );
    const deltas: Record<string, number> = {};
    for (const p of this.impostorGuessers()) {
      const guess = this.impostorGuesses.get(p.id);
      const ok = guess?.submitterId === current.playerId;
      const points = ok ? 20 + remainingSec : 0;
      this.impostorPoints.set(p.id, points);
      if (points) deltas[p.id] = points;
    }
    this.award(deltas);
    this.phase = "impostor_reveal";
    this.later(CLIP_RESULT_MS, () => this.nextImpostorOrFinish());
    this.emit();
  }

  private nextImpostorOrFinish() {
    this.clearTimers();
    this.impostorIndex += 1;
    if (this.impostorIndex >= this.impostorOrder.length) {
      this.beginImpostorRecap();
      return;
    }
    this.startImpostorClip();
  }

  private beginImpostorRecap() {
    this.clearTimers();
    this.phase = "impostor_recap";
    this.later(RECAP_MS, () => this.afterImpostorRecap());
    this.emit();
  }

  private afterImpostorRecap() {
    this.clearTimers();
    if (this.impostorCycle >= this.totalRounds) {
      this.finishGame();
      return;
    }
    this.beginImpostorSubmit();
  }

  setTheme(playerId: string, theme: string) {
    if (this.phase !== "aux_theme") throw new Error("Theme is already set.");
    if (playerId !== this.themeSetterId) {
      throw new Error("Only the DJ sets the theme this round.");
    }
    const t = theme.trim().slice(0, 80);
    if (t.length < 2) throw new Error("Give the room a real theme.");
    this.theme = t;
    this.auxSubs.clear();
    this.auxVotes.clear();
    this.auxWinnerId = null;
    this.auxEntries = [];
    this.phase = "aux_submit";
    this.later(SUBMIT_MS, () => {
      if (this.phase === "aux_submit") this.beginAuxListen();
    });
    this.emit();
  }

  private beginAuxListen() {
    this.clearTimers();
    this.penalizeMissingSubmissions(this.auxSubs);
    this.auxEntries = shuffle(
      [...this.auxSubs.entries()].map(([playerId, track]) => ({ playerId, track })),
    );
    this.listenIndex = 0;
    this.auxVotes.clear();
    if (this.auxEntries.length === 0) {
      this.nextAuxRoundOrFinish();
      return;
    }
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
    this.later(REVEAL_MS, () => this.nextAuxRoundOrFinish());
    this.emit();
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
    this.impostorPoints.clear();
    this.impostorCycle = 0;
    this.auxSubs.clear();
    this.auxEntries = [];
    this.auxVotes.clear();
    this.theme = "";
    this.lastDeltas = null;
    this.penaltyPopupIds.clear();
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
      timerEndsAt: this.timerEndsAt,
      timerDurationMs: this.timerDurationMs,
      isPrivate: this.isPrivate,
      buzzerChart: this.buzzerChart,
      buzzerPlaylists: this.buzzerPlaylists,
      classic: this.classicView(playerId),
      buzzer: this.buzzerView(),
      impostor: this.impostorView(playerId),
      aux: this.auxView(playerId),
      lastDeltas: this.lastDeltas,
      popup: this.penaltyPopupIds.has(playerId)
        ? { id: this.popupId, message: MISS_SUBMIT_POPUP }
        : null,
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
      this.phase !== "impostor_reveal" &&
      this.phase !== "impostor_recap"
    ) {
      return null;
    }
    const current = this.impostorOrder[this.impostorIndex];
    const showClip =
      (this.phase === "impostor_playing" || this.phase === "impostor_reveal") && current;
    const guessers = this.connectedPlayers().filter((p) => p.id !== current?.playerId);
    return {
      submittedIds: [...this.impostorSubs.keys()],
      playStartedAt: this.playStartedAt,
      previewMs: PREVIEW_MS,
      roundEndsAt: this.roundEndsAt,
      track: showClip
        ? this.phase === "impostor_reveal"
          ? revealTrack(current.track)
          : maskTrack(current.track)
        : null,
      isYours: Boolean(current && current.playerId === playerId && this.phase !== "impostor_submit"),
      yourSubmission: this.impostorSubs.get(playerId) || null,
      yourGuess: this.impostorGuesses.get(playerId) || null,
      guessedCount: this.impostorGuesses.size,
      guesserTotal: guessers.length,
      clipIndex: this.impostorIndex,
      clipTotal: this.impostorOrder.length,
      yourPoints: this.impostorPoints.get(playerId) ?? null,
      recap:
        this.phase === "impostor_recap"
          ? this.impostorOrder.map((entry) => ({
              track: entry.track,
              submitterName: this.player(entry.playerId)?.name || "Unknown",
            }))
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

  findByPlayer(playerId: string) {
    for (const room of this.rooms.values()) {
      const player = room.players.find((p) => p.id === playerId && p.connected);
      if (player) return room;
    }
    return undefined;
  }

  create(identity: Identity, mode?: GameMode, isPrivate = true) {
    const code = makeRoomCode(new Set(this.rooms.keys()));
    const room = new Room(code, identity);
    if (mode) room.mode = mode;
    room.isPrivate = Boolean(isPrivate);
    room.onEmpty = () => this.remove(code);
    this.rooms.set(code, room);
    return room;
  }

  listLobbies() {
    return [...this.rooms.values()]
      .filter((room) => room.phase === "lobby" && !room.isPrivate)
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
