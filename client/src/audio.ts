const audio = new Audio();
audio.preload = "auto";
audio.volume = 0.8;

let currentUrl = "";
let currentStartedAt = 0;
let buzzCtx: AudioContext | null = null;
let masterVolume = 0.8;

export function setMasterVolume(n: number) {
  masterVolume = Math.min(1, Math.max(0, n));
  audio.volume = masterVolume;
}

export function getMasterVolume() {
  return masterVolume;
}

function isSafeMediaUrl(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
    return host === "apple.com" || host.endsWith(".apple.com") || host.endsWith(".mzstatic.com") || host.endsWith(".itunes.com");
  } catch {
    return false;
  }
}

function getBuzzCtx() {
  if (!buzzCtx) buzzCtx = new AudioContext();
  return buzzCtx;
}

export function playPreview(url: string, playStartedAt: number, serverNow: number) {
  if (!isSafeMediaUrl(url)) return;
  const elapsed = Math.min(Math.max(0, (serverNow - playStartedAt) / 1000), 28);
  const sameClip = currentUrl === url && currentStartedAt === playStartedAt;
  const seekAndPlay = () => {
    try {
      if (!sameClip || Math.abs(audio.currentTime - elapsed) > 1.25) {
        audio.currentTime = elapsed;
      }
      void audio.play();
    } catch {
      /* autoplay may need a click */
    }
  };
  if (currentUrl !== url) {
    currentUrl = url;
    currentStartedAt = playStartedAt;
    audio.src = url;
    audio.addEventListener("canplay", seekAndPlay, { once: true });
    audio.load();
    return;
  }
  currentStartedAt = playStartedAt;
  seekAndPlay();
}

export function pausePreview() {
  audio.pause();
}

export function stopPreview() {
  audio.pause();
  audio.removeAttribute("src");
  currentUrl = "";
  currentStartedAt = 0;
}

export function playBuzz() {
  try {
    const ctx = getBuzzCtx();
    if (ctx.state === "suspended") void ctx.resume();
    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(Math.max(0.0001, 0.28 * masterVolume), now + 0.012);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);
    master.connect(ctx.destination);

    const low = ctx.createOscillator();
    low.type = "square";
    low.frequency.setValueAtTime(170, now);
    low.frequency.exponentialRampToValueAtTime(90, now + 0.38);
    low.connect(master);
    low.start(now);
    low.stop(now + 0.42);

    const sting = ctx.createOscillator();
    sting.type = "sawtooth";
    sting.frequency.setValueAtTime(620, now);
    sting.frequency.exponentialRampToValueAtTime(180, now + 0.18);
    const stingGain = ctx.createGain();
    stingGain.gain.setValueAtTime(0.16, now);
    stingGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
    sting.connect(stingGain);
    stingGain.connect(master);
    sting.start(now);
    sting.stop(now + 0.22);
  } catch {
    /* autoplay may need a click */
  }
}

export function playAchievement() {
  try {
    const ctx = getBuzzCtx();
    if (ctx.state === "suspended") void ctx.resume();
    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.setValueAtTime(Math.max(0.0001, 0.2 * masterVolume), now);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);
    master.connect(ctx.destination);

    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, i) => {
      const t = now + i * 0.08;
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, t);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.24, t + 0.018);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
      osc.connect(gain);
      gain.connect(master);
      osc.start(t);
      osc.stop(t + 0.34);
    });
  } catch {
    /* autoplay may need a click */
  }
}

export function unlockAudio() {
  void audio.play().then(() => audio.pause()).catch(() => undefined);
  try {
    const ctx = getBuzzCtx();
    if (ctx.state === "suspended") void ctx.resume();
  } catch {
    /* ignore */
  }
}
