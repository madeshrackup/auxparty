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
import {
  MAX_ROUNDS,
  MIN_PLAYERS,
  MIN_ROUNDS,
  type AchievementId,
} from "../../shared/types.ts";
import { fetchChart, resolvePlaylist, uniqueTracks } from "./itunes.ts";
import { matchesSong } from "./match.ts";
import { isBuzzerChart } from "./seeds.ts";
import { grantAchievement, listFriendIds, recordMatchStats } from "./db.ts";
import { sanitizeText, sanitizeTrack } from "./security.ts";

const MAX_PLAYERS = 10;
const PREVIEW_MS = 30_000;
const SUBMIT_MS = 30_000;
const MISS_SUBMIT_PENALTY = -15;
const MISS_SUBMIT_POPUP = "-15pts penalty for not submitting a song";
const BUZZ_MS = 10_000;
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
type ImpostorGuessState = { submitterId: string; remainingSec: number };
type ImpostorClipLog = {
  playerId: string;
  track: Track;
  guesses: Map<string, ImpostorGuessState>;
};
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
  private impostorGuesses = new Map<string, ImpostorGuessState>();
  private impostorPoints = new Map<string, number>();
  private impostorPending = new Map<string, number>();
  private impostorClipLog: ImpostorClipLog[] = [];
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
  private auxTieIds: string[] | null = null;
  private auxUncontested = false;

  private trophyFriends = new Map<string, Set<string>>();
  private classicWizardFailed = new Set<string>();
  private classicWizardEligible = new Map<string, number>();
  private classicWizardHits = new Map<string, number>();
  private buzzerFirstStreak = new Map<string, number>();
  private buzzerClipOpened = false;
  private buzzerClipLeftMs = PREVIEW_MS;
  private buzzerMissAt = 0;
  private buzzerMissBy: string | null = null;
  private impostorMasterFailed = new Set<string>();
  private impostorMasterEligible = new Map<string, number>();

  onChange: (() => void) | null = null;
  onAchievement: ((playerId: string, id: AchievementId) => void) | null = null;
  onEmpty: (() => void) | null = null;
  private emptyTimer: ReturnType<typeof setTimeout> | null = null;
  private dropTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private departed = new Set<string>();
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

  private bumpCount(map: Map<string, number>, id: string) {
    map.set(id, (map.get(id) || 0) + 1);
  }

  private unlockTrophy(playerId: string, id: AchievementId) {
    const player = this.player(playerId);
    if (!player || player.isGuest) return;
    void grantAchievement(player.id, id)
      .then((fresh) => {
        if (fresh) this.onAchievement?.(playerId, id);
      })
      .catch(() => {});
  }

  private resetTrophyTracking() {
    this.trophyFriends.clear();
    this.classicWizardFailed.clear();
    this.classicWizardEligible.clear();
    this.classicWizardHits.clear();
    this.buzzerFirstStreak.clear();
    this.buzzerClipOpened = false;
    this.buzzerMissAt = 0;
    this.buzzerMissBy = null;
    this.impostorMasterFailed.clear();
    this.impostorMasterEligible.clear();
  }

  private async refreshTrophyFriends() {
    const registered = this.players.filter((player) => !player.isGuest);
    const next = new Map<string, Set<string>>();
    await Promise.all(
      registered.map(async (player) => {
        try {
          next.set(player.id, new Set(await listFriendIds(player.id)));
        } catch {
          next.set(player.id, new Set());
        }
      }),
    );
    this.trophyFriends = next;
  }

  private unlockBandIfFriendsPresent() {
    const ids = this.players.filter((player) => !player.isGuest).map((player) => player.id);
    for (const id of ids) {
      const friends = this.trophyFriends.get(id);
      if (friends && ids.some((other) => other !== id && friends.has(other))) {
        this.unlockTrophy(id, "start_a_band");
      }
    }
  }

  private maybeUnlockPartyHost() {
    if (this.phase !== "lobby") return;
    if (this.players.length < MAX_PLAYERS) return;
    this.unlockTrophy(this.hostId, "party_host");
  }

  private noteBuzzerFirst(playerId: string) {
    for (const player of this.players) {
      if (player.id === playerId) {
        const n = (this.buzzerFirstStreak.get(player.id) || 0) + 1;
        this.buzzerFirstStreak.set(player.id, n);
        if (n >= 5) this.unlockTrophy(player.id, "trigger_happy");
      } else {
        this.buzzerFirstStreak.set(player.id, 0);
      }
    }
  }

  private noteBuzzerMiss(playerId: string) {
    this.buzzerMissAt = Date.now();
    this.buzzerMissBy = playerId;
  }

  private unlockEndOfMatchTrophies() {
    if (this.mode === "classic" && this.totalRounds >= 5 && this.round >= 5) {
      for (const player of this.players) {
        if (player.isGuest || this.classicWizardFailed.has(player.id)) continue;
        const eligible = this.classicWizardEligible.get(player.id) || 0;
        const hits = this.classicWizardHits.get(player.id) || 0;
        if (eligible > 0 && hits >= eligible) this.unlockTrophy(player.id, "wizard");
      }
    }
    if (this.mode === "impostor" && this.totalRounds >= 5 && this.impostorCycle >= this.totalRounds) {
      for (const player of this.players) {
        if (player.isGuest || this.impostorMasterFailed.has(player.id)) continue;
        const eligible = this.impostorMasterEligible.get(player.id) || 0;
        if (eligible > 0) this.unlockTrophy(player.id, "mastermind");
      }
    }
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
    if (this.phase === "classic_submit") {
      for (const id of this.penaltyPopupIds) this.unlockTrophy(id, "self_sabotage");
    }
  }

  hasSeat(playerId: string) {
    return Boolean(this.player(playerId)) && !this.departed.has(playerId);
  }

  private clearDrop(playerId: string) {
    const timer = this.dropTimers.get(playerId);
    if (timer) clearTimeout(timer);
    this.dropTimers.delete(playerId);
  }

  private restorePlayer(identity: Identity) {
    this.departed.delete(identity.id);
    this.clearDrop(identity.id);
    if (this.emptyTimer) {
      clearTimeout(this.emptyTimer);
      this.emptyTimer = null;
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
      this.restorePlayer(identity);
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
    this.restorePlayer(identity);
    this.maybeUnlockPartyHost();
    if (this.phase !== "lobby") {
      void this.refreshTrophyFriends().then(() => this.unlockBandIfFriendsPresent());
    }
    this.emit();
  }

  reconnect(identity: Identity) {
    if (!this.player(identity.id) || this.departed.has(identity.id)) return false;
    this.join(identity);
    return true;
  }

  drop(playerId: string) {
    const p = this.player(playerId);
    if (!p || this.departed.has(playerId)) return;
    p.connected = false;
    this.clearDrop(playerId);
    const wait = this.phase === "lobby" || this.phase === "podium" ? 20_000 : 90_000;
    this.dropTimers.set(
      playerId,
      setTimeout(() => {
        this.dropTimers.delete(playerId);
        if (this.player(playerId)?.connected) return;
        this.leave(playerId);
      }, wait),
    );
    this.maybeAdvanceAfterDrop();
    this.emit();
  }

  private maybeAdvanceAfterDrop() {
    if (this.phase === "classic_submit" && this.allConnectedSubmitted(this.classicSubs)) {
      this.beginClassicPlayback();
      return;
    }
    if (this.phase === "impostor_submit" && this.allConnectedSubmitted(this.impostorSubs)) {
      this.beginImpostorPlayback();
      return;
    }
    if (this.phase === "aux_submit" && this.allConnectedSubmitted(this.auxSubs)) {
      this.beginAuxListen();
      return;
    }
    if (this.phase === "aux_vote") this.maybeFinishAuxVote();
  }

  leave(playerId: string) {
    const p = this.player(playerId);
    if (!p) return;
    this.clearDrop(playerId);
    this.departed.add(playerId);
    p.connected = false;
    if (this.phase === "lobby") {
      this.players = this.players.filter((x) => x.id !== playerId);
      this.departed.delete(playerId);
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
    if (this.phase === "aux_vote" && this.maybeFinishAuxVote()) return;
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
    if (!Number.isFinite(total)) throw new Error("Pick how many rounds to play.");
    const next = Math.round(total);
    if (next < MIN_ROUNDS || next > MAX_ROUNDS) {
      throw new Error(`Rounds must be between ${MIN_ROUNDS} and ${MAX_ROUNDS}.`);
    }
    this.totalRounds = next;
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
    if (this.buzzerChart !== "custom") throw new Error("Pick Custom playlist to add links.");
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
    this.resetTrophyTracking();
    await this.refreshTrophyFriends();
    this.unlockBandIfFriendsPresent();

    if (this.mode === "classic") {
      this.round = 0;
      this.beginClassicSubmit();
      return;
    }

    if (this.mode === "buzzer") {
      await this.prepareBuzzerPlaylist();
      if (this.buzzerPlaylist.length === 0) {
        if (this.buzzerChart === "custom") {
          throw new Error("Add a playlist in Game settings first.");
        }
        throw new Error("Couldn't load tracks. Try another chart or try again.");
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
    this.auxTieIds = null;
    this.auxUncontested = false;
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
    title = sanitizeText(title, 120);
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
    const elapsed = PREVIEW_MS - remaining;
    if (elapsed <= 3000) this.unlockTrophy(playerId, "sonic");
    if (remaining < 3000) this.unlockTrophy(playerId, "patience");
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
    const current = this.classicOrder[this.classicIndex];
    if (current) {
      const guessers = this.players.filter(
        (p) => !p.isGuest && (p.id !== current.playerId || this.players.length === 1),
      );
      for (const player of guessers) {
        this.bumpCount(this.classicWizardEligible, player.id);
        if (this.classicScored.has(player.id)) this.bumpCount(this.classicWizardHits, player.id);
        else this.classicWizardFailed.add(player.id);
      }
    }
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
    if (this.buzzerChart === "custom") {
      const fromPlaylists = uniqueTracks(
        this.buzzerPlaylists.flatMap((p) => this.buzzerPlaylistTracks.get(p.url) || []),
      );
      this.buzzerPlaylist = shuffle(fromPlaylists).slice(0, Math.max(this.totalRounds, 1));
      return;
    }
    const extras = await fetchChart(this.buzzerChart).catch(() => [] as Track[]);
    this.buzzerPlaylist = shuffle(extras).slice(0, Math.max(this.totalRounds, 1));
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
    this.buzzerClipOpened = false;
    this.buzzerClipLeftMs = PREVIEW_MS;
    this.buzzerMissAt = 0;
    this.buzzerMissBy = null;
    this.phase = "buzzer_playing";
    this.later(PREVIEW_MS, () => {
      if (this.phase === "buzzer_playing") {
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
    const started = this.playStartedAt || Date.now();
    this.buzzerClipLeftMs = Math.max(0, started + PREVIEW_MS - Date.now());
    this.buzzedBy = playerId;
    this.buzzDeadline = Date.now() + BUZZ_MS;
    this.phase = "buzzer_buzzed";
    if (!this.buzzerClipOpened) {
      this.buzzerClipOpened = true;
      this.noteBuzzerFirst(playerId);
    }
    this.later(BUZZ_MS, () => {
      if (this.phase === "buzzer_buzzed" && this.buzzedBy === playerId) {
        this.unlockTrophy(playerId, "butterfingers");
        this.noteBuzzerMiss(playerId);
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
    title = sanitizeText(title, 120);
    const track = this.buzzerTrack;
    if (!track) throw new Error("No track playing.");
    if (matchesSong(title, track.title)) {
      const remaining = this.buzzerClipLeftMs;
      const points = Math.round(60 + (remaining / 1000) * 4);
      this.award({ [playerId]: points });
      if (
        this.buzzerMissBy &&
        this.buzzerMissBy !== playerId &&
        Date.now() - this.buzzerMissAt <= 8000
      ) {
        this.unlockTrophy(playerId, "snatcher");
      }
      this.buzzerMissBy = null;
      this.buzzerReveal();
      return;
    }
    this.unlockTrophy(playerId, "butterfingers");
    this.noteBuzzerMiss(playerId);
    this.eliminated.add(playerId);
    this.resumeAfterWrongBuzz();
  }

  private resumeAfterWrongBuzz() {
    this.clearTimers();
    this.buzzedBy = null;
    this.buzzDeadline = null;
    const left = this.buzzerClipLeftMs;
    this.playStartedAt = Date.now() - (PREVIEW_MS - left);
    const alive = this.connectedPlayers().filter((p) => !this.eliminated.has(p.id));
    if (left <= 400 || alive.length === 0) {
      this.buzzerReveal();
      return;
    }
    this.phase = "buzzer_playing";
    this.later(left, () => {
      if (this.phase === "buzzer_playing") {
        this.buzzerReveal();
      }
    });
    this.emit();
  }

  private buzzerReveal() {
    this.clearTimers();
    if (!this.buzzerClipOpened) {
      this.buzzerFirstStreak.clear();
    }
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
    const safe = sanitizeTrack(track);
    if (!safe) throw new Error("Pick a real song from search.");
    if (!this.player(playerId)) throw new Error("You're not in this room.");
    if (this.phase === "classic_submit") {
      this.classicSubs.set(playerId, safe);
      this.emit();
      if (this.allConnectedSubmitted(this.classicSubs)) {
        this.beginClassicPlayback();
      }
      return;
    }
    if (this.phase === "impostor_submit") {
      this.impostorSubs.set(playerId, safe);
      this.emit();
      if (this.allConnectedSubmitted(this.impostorSubs)) {
        this.beginImpostorPlayback();
      }
      return;
    }
    if (this.phase === "aux_submit") {
      this.auxSubs.set(playerId, safe);
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
    this.impostorPending.clear();
    this.impostorClipLog = [];
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
    this.impostorGuesses.set(playerId, {
      submitterId: guess.submitterId,
      remainingSec: Math.max(
        0,
        Math.ceil(((this.playStartedAt || Date.now()) + PREVIEW_MS - Date.now()) / 1000),
      ),
    });
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
    this.impostorClipLog.push({
      playerId: current.playerId,
      track: current.track,
      guesses: new Map(this.impostorGuesses),
    });
    for (const [id, guess] of this.impostorGuesses) {
      const ok = guess.submitterId === current.playerId;
      const points = ok ? guess.remainingSec : 0;
      if (points) this.impostorPending.set(id, (this.impostorPending.get(id) || 0) + points);
    }
    for (const player of this.players) {
      if (player.isGuest || player.id === current.playerId) continue;
      this.bumpCount(this.impostorMasterEligible, player.id);
      const guess = this.impostorGuesses.get(player.id);
      const ok = guess?.submitterId === current.playerId;
      if (!ok) this.impostorMasterFailed.add(player.id);
      if (
        guess &&
        !ok &&
        this.trophyFriends.get(player.id)?.has(current.playerId)
      ) {
        this.unlockTrophy(player.id, "betrayal");
      }
    }
    const named = [...this.impostorGuesses.values()].some((guess) => guess.submitterId === current.playerId);
    if (!named) this.unlockTrophy(current.playerId, "in_plain_sight");
    this.lastDeltas = null;
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
    const deltas: Record<string, number> = {};
    for (const [id, n] of this.impostorPending) {
      if (n) deltas[id] = n;
    }
    if (Object.keys(deltas).length) this.award(deltas);
    else this.lastDeltas = null;
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
    const t = sanitizeText(theme, 80);
    if (t.length < 2) throw new Error("Give the room a real theme.");
    this.theme = t;
    this.auxSubs.clear();
    this.auxVotes.clear();
    this.auxWinnerId = null;
    this.auxTieIds = null;
    this.auxUncontested = false;
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
      this.beginAuxVote();
      return;
    }
    this.phase = "aux_listen";
    this.listenStartedAt = Date.now();
    this.later(AUX_LISTEN_MS, () => this.nextAuxListen());
    this.emit();
  }

  private beginAuxVote() {
    this.clearTimers();
    this.auxVotes.clear();
    this.auxTieIds = null;
    this.auxUncontested = false;
    if (this.auxEntries.length === 0) {
      this.nextAuxRoundOrFinish();
      return;
    }
    if (this.auxEntries.length === 1) {
      this.auxAward(this.auxEntries[0].playerId, true);
      return;
    }
    this.phase = "aux_vote";
    this.emit();
    this.maybeFinishAuxVote();
  }

  private voteCandidates() {
    if (this.auxTieIds && this.auxTieIds.length >= 2) return this.auxTieIds;
    return this.auxEntries.map((entry) => entry.playerId);
  }

  private eligibleAuxVoters() {
    const candidates = this.voteCandidates();
    return this.connectedPlayers().filter((player) => candidates.some((id) => id !== player.id));
  }

  private maybeFinishAuxVote() {
    if (this.phase !== "aux_vote") return false;
    const voters = this.eligibleAuxVoters();
    if (voters.length === 0) {
      const pick = shuffle([...this.voteCandidates()])[0];
      if (pick) this.auxAward(pick);
      else this.nextAuxRoundOrFinish();
      return true;
    }
    if (voters.every((player) => this.auxVotes.has(player.id))) {
      this.auxTally();
      return true;
    }
    return false;
  }

  vote(playerId: string, targetId: string) {
    if (this.phase !== "aux_vote") throw new Error("Voting isn't open.");
    if (!this.player(playerId)) throw new Error("You're not in this room.");
    if (playerId === targetId) throw new Error("You can't vote for yourself.");
    const candidates = this.voteCandidates();
    if (!candidates.includes(targetId)) {
      throw new Error(this.auxTieIds ? "Vote between the tied tracks." : "That submission isn't in this round.");
    }
    this.auxVotes.set(playerId, targetId);
    this.emit();
    this.maybeFinishAuxVote();
  }

  private auxTally() {
    const candidates = this.voteCandidates();
    if (candidates.length === 0) {
      this.nextAuxRoundOrFinish();
      return;
    }
    const counts = new Map<string, number>();
    for (const id of candidates) counts.set(id, 0);
    for (const target of this.auxVotes.values()) {
      if (counts.has(target)) counts.set(target, (counts.get(target) || 0) + 1);
    }
    let best = -1;
    for (const n of counts.values()) {
      if (n > best) best = n;
    }
    const tied = candidates.filter((id) => (counts.get(id) || 0) === best);
    if (tied.length <= 1) {
      this.auxAward(tied[0] || candidates[0]);
      return;
    }
    const sameRunoff =
      Boolean(this.auxTieIds) &&
      tied.length === this.auxTieIds!.length &&
      tied.every((id) => this.auxTieIds!.includes(id));
    if (sameRunoff) {
      this.auxAward(shuffle([...tied])[0]);
      return;
    }
    this.auxTieIds = tied;
    this.auxVotes.clear();
    this.phase = "aux_vote";
    this.emit();
    this.maybeFinishAuxVote();
  }

  private auxAward(winnerId: string, uncontested = false) {
    this.clearTimers();
    this.auxUncontested = uncontested;
    this.auxWinnerId = winnerId;
    this.themeSetterId = winnerId;
    this.award({ [winnerId]: 100 });
    this.phase = "aux_reveal";
    this.later(REVEAL_MS, () => this.nextAuxRoundOrFinish());
    this.emit();
  }

  private nextAuxListen() {
    this.clearTimers();
    this.listenIndex += 1;
    this.startAuxListenClip();
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
    this.auxTieIds = null;
    this.auxUncontested = false;
    this.phase = "aux_theme";
    this.emit();
  }

  private finishGame() {
    this.clearTimers();
    const firstPodium = this.phase !== "podium";
    this.phase = "podium";
    if (firstPodium) {
      const scores = this.players.map((player) => player.score);
      const best = scores.length ? Math.max(...scores) : 0;
      const ranked = [...new Set(scores)].sort((a, b) => b - a);
      const second = ranked[1];
      if (second !== undefined && second < best) {
        for (const player of this.players) {
          if (player.score === second) this.unlockTrophy(player.id, "backup_act");
        }
      }
      void recordMatchStats(
        this.mode,
        this.players
          .filter((player) => !player.isGuest)
          .map((player) => ({
            userId: player.id,
            score: player.score,
            won: player.score === best,
          })),
      )
        .then((granted) => {
          for (const row of granted) this.onAchievement?.(row.userId, row.id);
        })
        .catch(() => {});
      this.unlockEndOfMatchTrophies();
    }
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
    this.impostorPending.clear();
    this.impostorClipLog = [];
    this.impostorCycle = 0;
    this.auxSubs.clear();
    this.auxEntries = [];
    this.auxVotes.clear();
    this.auxWinnerId = null;
    this.auxTieIds = null;
    this.auxUncontested = false;
    this.departed.clear();
    for (const timer of this.dropTimers.values()) clearTimeout(timer);
    this.dropTimers.clear();
    this.resetTrophyTracking();
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
      answerMs: BUZZ_MS,
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
      yourGuess: this.impostorGuesses.get(playerId)
        ? { submitterId: this.impostorGuesses.get(playerId)!.submitterId }
        : null,
      guessedCount: this.impostorGuesses.size,
      guesserTotal: guessers.length,
      clipIndex: this.impostorIndex,
      clipTotal: this.impostorOrder.length,
      yourPoints: this.phase === "impostor_recap" ? this.impostorPending.get(playerId) ?? 0 : null,
      recap:
        this.phase === "impostor_recap"
          ? this.impostorClipLog.map((clip) => {
              const yours = clip.playerId === playerId;
              const guess = clip.guesses.get(playerId);
              const correct = yours ? null : Boolean(guess && guess.submitterId === clip.playerId);
              return {
                track: clip.track,
                submitterName: this.player(clip.playerId)?.name || "Unknown",
                yours,
                guessedName: guess ? this.player(guess.submitterId)?.name || "Unknown" : null,
                correct,
              };
            })
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
      voterTotal: this.eligibleAuxVoters().length,
      runoffIds: this.phase === "aux_vote" || this.phase === "aux_reveal" ? this.auxTieIds : null,
      uncontested: this.phase === "aux_reveal" && this.auxUncontested,
    };
  }

  destroy() {
    this.clearTimers();
    for (const timer of this.dropTimers.values()) clearTimeout(timer);
    this.dropTimers.clear();
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

  findSeat(playerId: string) {
    for (const room of this.rooms.values()) {
      if (room.hasSeat(playerId)) return room;
    }
    return undefined;
  }

  create(identity: Identity, mode?: GameMode, isPrivate = true, totalRounds?: number) {
    const code = makeRoomCode(new Set(this.rooms.keys()));
    const room = new Room(code, identity);
    if (mode) room.mode = mode;
    room.isPrivate = Boolean(isPrivate);
    const rounds = Math.round(Number(totalRounds));
    if (Number.isFinite(rounds) && rounds >= MIN_ROUNDS && rounds <= MAX_ROUNDS) {
      room.totalRounds = rounds;
    }
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
