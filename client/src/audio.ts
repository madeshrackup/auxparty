const audio = new Audio();
audio.preload = "auto";

let currentUrl = "";

export function playPreview(url: string, playStartedAt: number, _serverNow: number) {
  const startAt = Math.min(Math.max(0, (Date.now() - playStartedAt) / 1000), 28);
  const seekAndPlay = () => {
    try {
      if (Math.abs(audio.currentTime - startAt) > 0.35) {
        audio.currentTime = startAt;
      }
      void audio.play();
    } catch {
      /* autoplay may need a click */
    }
  };
  if (currentUrl !== url) {
    currentUrl = url;
    audio.src = url;
    audio.addEventListener("canplay", seekAndPlay, { once: true });
    audio.load();
    return;
  }
  seekAndPlay();
}

export function stopPreview() {
  audio.pause();
  audio.removeAttribute("src");
  currentUrl = "";
}

export function unlockAudio() {
  void audio.play().then(() => audio.pause()).catch(() => undefined);
}
