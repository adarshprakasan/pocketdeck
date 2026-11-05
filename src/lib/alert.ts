/** Beep and flag the tab title so a finished timer is noticed even when the page is in the background. */
export function announceTimerDone() {
  try {
    const AudioContextClass = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) {
      const context = new AudioContextClass();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = 880;
      gain.gain.value = 0.15;
      oscillator.connect(gain).connect(context.destination);
      oscillator.onended = () => void context.close();
      oscillator.start();
      oscillator.stop(context.currentTime + 0.6);
    }
  } catch { /* browsers may block audio until the page has been interacted with */ }

  if (!document.hidden) return;
  const original = document.title;
  document.title = "⏰ Timer finished — PocketDeck";
  const restore = () => {
    if (document.hidden) return;
    document.title = original;
    document.removeEventListener("visibilitychange", restore);
  };
  document.addEventListener("visibilitychange", restore);
}
