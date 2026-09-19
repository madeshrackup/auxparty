const audio = new Audio();
audio.preload = "auto";

let currentUrl = "";
let currentStartedAt = 0;

export function playPreview(url: string, playStartedAt: number, serverNow: number) {
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

export function stopPreview() {
  audio.pause();
  audio.removeAttribute("src");
  currentUrl = "";
  currentStartedAt = 0;
}

export function unlockAudio() {
  void audio.play().then(() => audio.pause()).catch(() => undefined);
}
