"use client";

import { ArrowLeft, Check, Copy, ExternalLink, Power, RotateCcw, Timer, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { announceTimerDone } from "@/lib/alert";
import { isDeckActionMessage, loadDeckBackup, parseDeckSyncMessage, saveDeckBackup, sendDeckSync } from "@/lib/deck";
import { createRateLimiter } from "@/lib/rate-limit.mjs";

const MAX_MESSAGE_LENGTH = 100_000;

function formatTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

export function DesktopReceiver({ channel }: { channel: RTCDataChannel }) {
  const [message, setMessage] = useState("Connected and ready.");
  const [notice, setNotice] = useState("");
  const [pendingUrl, setPendingUrl] = useState("");
  const [sharedText, setSharedText] = useState("");
  const [copied, setCopied] = useState(false);
  const [timerValue, setTimerValue] = useState<number | null>(null);
  const [focusMode, setFocusMode] = useState(false);
  const [ambientMode, setAmbientMode] = useState(false);
  const [hasActionWindow, setHasActionWindow] = useState(false);
  const timerRef = useRef<number | null>(null);
  const noticeTimerRef = useRef<number | null>(null);
  const actionWindow = useRef<Window | null>(null);

  useEffect(() => {
    // A paired phone is trusted, but never allowed to flood the computer with actions.
    const limiter = createRateLimiter({ capacity: 10, refillPerSecond: 5 });

    const stopTimer = () => {
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
      timerRef.current = null;
    };

    // The countdown is computed from an end time, so it stays correct even when the browser throttles
    // timers in a background tab.
    const startTimer = (seconds: number) => {
      stopTimer();
      const endsAt = Date.now() + seconds * 1000;
      setTimerValue(seconds);
      timerRef.current = window.setInterval(() => {
        const remaining = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
        setTimerValue(remaining);
        if (remaining === 0) {
          stopTimer();
          setMessage("Timer complete.");
          announceTimerDone();
        }
      }, 500);
      setMessage(`Timer started for ${Math.ceil(seconds / 60)} min.`);
    };

    const onMessage = (event: MessageEvent<string>) => {
      if (typeof event.data !== "string" || event.data.length > MAX_MESSAGE_LENGTH) { setMessage("Ignored an oversized or unsupported message."); return; }
      let incoming: unknown;
      try { incoming = JSON.parse(event.data); } catch { setMessage("Ignored an invalid action message."); return; }

      const sync = parseDeckSyncMessage(incoming);
      if (sync) {
        if (sync.type === "deck-backup") saveDeckBackup(sync.deck);
        else if (sync.type === "deck-restore-request") {
          const backup = loadDeckBackup();
          if (backup) sendDeckSync(channel, { type: "deck-restore", deck: backup });
        }
        return;
      }

      if (!isDeckActionMessage(incoming)) { setMessage("Ignored an unsupported action."); return; }
      if (!limiter.take("phone")) { setMessage("Too many actions at once from the phone. Ignored the extra taps."); return; }
      channel.send(JSON.stringify({ type: "deck-action-ack", buttonId: incoming.buttonId }));
      const action = incoming.action;

      if (action.type === "open-url") {
        const url = new URL(action.url);
        if (actionWindow.current && !actionWindow.current.closed) {
          actionWindow.current.location.assign(url.href);
          setMessage(`Opened ${url.hostname} in the PocketDeck action window.`);
        } else {
          setPendingUrl(url.href);
          setMessage("A link is ready. Open it from this computer to continue.");
        }
      } else if (action.type === "send-text") {
        setSharedText(action.text);
        setMessage("Text arrived from the phone. Copy it here when you’re ready.");
      } else if (action.type === "timer") {
        startTimer(action.seconds);
      } else if (action.type === "media") {
        const media = Array.from(document.querySelectorAll("audio, video")) as HTMLMediaElement[];
        if (!media.length) { setMessage("No audio or video is open inside PocketDeck yet."); return; }
        const player = media[0];
        const play = () => void player.play().then(() => setMessage("Media playing.")).catch(() => setMessage("The browser could not start this media."));
        if (action.command === "play") play();
        if (action.command === "pause") { player.pause(); setMessage("Media paused."); }
        if (action.command === "toggle") {
          if (player.paused) play();
          else { player.pause(); setMessage("Media paused."); }
        }
        if (action.command === "mute") { player.muted = !player.muted; setMessage(player.muted ? "Media muted." : "Media unmuted."); }
        if (action.command === "seek-back" || action.command === "seek-forward") {
          const back = action.command === "seek-back";
          player.currentTime = Math.max(0, player.currentTime + (back ? -10 : 10));
          setMessage(back ? "Skipped back 10 seconds." : "Skipped forward 10 seconds.");
        }
      } else if (action.type === "web-action") {
        if (action.command === "focus-mode") { setFocusMode((value) => !value); setMessage("Focus mode toggled on this PocketDeck screen."); }
        if (action.command === "ambient-mode") { setAmbientMode((value) => !value); setMessage("Ambient mode toggled on this PocketDeck screen."); }
        if (action.command === "show-notice") {
          setMessage("This PocketDeck browser action was triggered by your phone.");
          setNotice("Show notice was triggered by your phone.");
          if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
          noticeTimerRef.current = window.setTimeout(() => { setNotice(""); noticeTimerRef.current = null; }, 5000);
        }
        window.dispatchEvent(new CustomEvent("pocketdeck:action", { detail: action.command }));
      }
    };

    channel.addEventListener("message", onMessage);
    return () => channel.removeEventListener("message", onMessage);
  }, [channel]);

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
    if (actionWindow.current && !actionWindow.current.closed) actionWindow.current.close();
  }, []);

  const enableActionWindow = () => {
    const opened = window.open("about:blank", "pocketdeck-action-window");
    if (!opened) { setMessage("Your browser blocked the action window. Allow pop-ups for PocketDeck and try again."); return; }
    opened.document.title = "PocketDeck action window";
    opened.document.body.style.cssText = "font:16px system-ui;background:#090b10;color:#eee;display:grid;place-items:center;height:90vh";
    opened.document.body.textContent = "PocketDeck links will open here.";
    actionWindow.current = opened;
    setHasActionWindow(true);
    setMessage("Action window is ready for links from your phone.");
  };

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(sharedText);
      setCopied(true);
      setMessage("Text copied to this computer’s clipboard.");
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setMessage("Clipboard access is unavailable. Select and copy the text manually.");
    }
  };

  const dismissNotice = () => {
    setNotice("");
    if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = null;
  };

  return (
    <section className={`browser-deck desktop-deck ${focusMode ? "focus-mode" : ""} ${ambientMode ? "ambient-mode" : ""}`}>
      <div className="desktop-deck-heading">
        <div><span className="deck-eyebrow"><Power size={13} /> BROWSER CONTROL</span><h2>Your phone is connected</h2><p>Actions from your phone arrive in this PocketDeck browser.</p></div>
        <span className="deck-live"><i /> ENCRYPTED</span>
      </div>
      <div className="desktop-control-row">
        <button className={`enable-window ${hasActionWindow ? "enabled" : ""}`} onClick={enableActionWindow}><ExternalLink size={15} />{hasActionWindow ? "Action window enabled" : "Enable link window"}</button>
        <span>Opens links in a separate browser window</span>
      </div>
      <div className="desktop-action-status" role="status"><span className="status-pulse" />{message}</div>
      {notice && (
        <div className="phone-notice" role="alert">
          <div><span className="deck-eyebrow">PHONE ACTION</span><button className="phone-notice-close" onClick={dismissNotice} aria-label="Dismiss notice"><X size={15} /></button></div>
          <strong>{notice}</strong>
        </div>
      )}
      {pendingUrl && (
        <div className="received-card">
          <div className="received-copy"><span className="deck-eyebrow">LINK FROM YOUR PHONE</span><strong>{new URL(pendingUrl).hostname}</strong><small>{pendingUrl}</small></div>
          <a href={pendingUrl} target="_blank" rel="noreferrer" onClick={() => setPendingUrl("")}>Open link <ExternalLink size={14} /></a>
          <button aria-label="Dismiss link" onClick={() => setPendingUrl("")}><X size={15} /></button>
        </div>
      )}
      {sharedText && (
        <div className="received-card">
          <div className="received-copy"><span className="deck-eyebrow">TEXT FROM YOUR PHONE</span><p>{sharedText}</p></div>
          <button className="copy-received" onClick={copyText}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? "Copied" : "Copy text"}</button>
          <button aria-label="Dismiss text" onClick={() => setSharedText("")}><X size={15} /></button>
        </div>
      )}
      {timerValue !== null && (
        <div className={`timer-card ${timerValue === 0 ? "complete" : ""}`}>
          <Timer size={17} />
          <div><span className="deck-eyebrow">{timerValue === 0 ? "TIMER FINISHED" : "PHONE TIMER"}</span><strong>{formatTime(timerValue)}</strong></div>
          {timerValue === 0 && <button onClick={() => setTimerValue(null)}><RotateCcw size={14} /> Dismiss</button>}
        </div>
      )}
      <div className="browser-action-note"><ArrowLeft size={14} /><span>URL, text, timer, media, and PocketDeck web actions are validated before handling. Text is copied only after you choose Copy.</span></div>
    </section>
  );
}
