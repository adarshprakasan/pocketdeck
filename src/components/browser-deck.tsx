"use client";

import { Check, ChevronDown, Copy, ExternalLink, Pencil, Power, RotateCcw, Save, Smartphone, Timer, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { deckColors, defaultDeck, isDeckActionMessage, loadDeck, mediaCommands, saveDeck, webCommands, type DeckAction, type DeckButton, type MediaCommand, type WebCommand } from "@/lib/deck";

type Role = "desktop" | "phone";
type Draft = { title: string; icon: string; color: string; type: DeckAction["type"] | "none"; value: string };

function makeDraft(button: DeckButton): Draft {
  const action = button.action;
  const value = !action ? "" : action.type === "open-url" ? action.url : action.type === "send-text" ? action.text : action.type === "timer" ? String(action.seconds) : action.command;
  return { title: button.title, icon: button.icon, color: button.color, type: action?.type ?? "none", value };
}

function makeAction(draft: Draft): DeckAction | null {
  if (draft.type === "none") return null;
  if (draft.type === "open-url") return { type: "open-url", url: draft.value.trim() };
  if (draft.type === "send-text") return { type: "send-text", text: draft.value };
  if (draft.type === "timer") return { type: "timer", seconds: Number(draft.value) };
  if (draft.type === "media") return { type: "media", command: draft.value as MediaCommand };
  return { type: "web-action", command: draft.value as WebCommand };
}

function formatTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

export function BrowserDeck({ role, channel }: { role: Role; channel: RTCDataChannel }) {
  const [deck, setDeck] = useState<DeckButton[]>(defaultDeck);
  const [editing, setEditing] = useState(false);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [message, setMessage] = useState("Connected and ready.");
  const [pendingUrl, setPendingUrl] = useState("");
  const [sharedText, setSharedText] = useState("");
  const [copied, setCopied] = useState(false);
  const [timerValue, setTimerValue] = useState<number | null>(null);
  const [focusMode, setFocusMode] = useState(false);
  const [ambientMode, setAmbientMode] = useState(false);
  const [hasActionWindow, setHasActionWindow] = useState(false);
  const timerRef = useRef<number | null>(null);
  const actionWindow = useRef<Window | null>(null);

  useEffect(() => {
    if (role === "phone") setDeck(loadDeck());
  }, [role]);

  useEffect(() => {
    if (role !== "desktop") return;
    const onMessage = (event: MessageEvent<string>) => {
      let incoming: unknown;
      try { incoming = JSON.parse(event.data); } catch { setMessage("Ignored an invalid action message."); return; }
      if (!isDeckActionMessage(incoming)) { setMessage("Ignored an unsupported action."); return; }
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
        if (timerRef.current !== null) window.clearInterval(timerRef.current);
        setTimerValue(action.seconds);
        let remaining = action.seconds;
        timerRef.current = window.setInterval(() => {
          remaining -= 1;
          if (remaining <= 0) {
            if (timerRef.current !== null) window.clearInterval(timerRef.current);
            timerRef.current = null;
            setTimerValue(0);
            setMessage("Timer complete.");
          } else setTimerValue(remaining);
        }, 1000);
        setMessage(`Timer started for ${Math.ceil(action.seconds / 60)} min.`);
      } else if (action.type === "media") {
        const media = Array.from(document.querySelectorAll("audio, video")) as HTMLMediaElement[];
        if (!media.length) { setMessage("No audio or video is open inside PocketDeck yet."); return; }
        const player = media[0];
        if (action.command === "play") void player.play().then(() => setMessage("Media playing.")).catch(() => setMessage("The browser could not start this media."));
        if (action.command === "pause") { player.pause(); setMessage("Media paused."); }
        if (action.command === "toggle") {
          if (player.paused) void player.play().then(() => setMessage("Media playing.")).catch(() => setMessage("The browser could not start this media."));
          else { player.pause(); setMessage("Media paused."); }
        }
        if (action.command === "mute") { player.muted = !player.muted; setMessage(player.muted ? "Media muted." : "Media unmuted."); }
        if (action.command === "seek-back" || action.command === "seek-forward") { player.currentTime = Math.max(0, player.currentTime + (action.command === "seek-back" ? -10 : 10)); setMessage(action.command === "seek-back" ? "Skipped back 10 seconds." : "Skipped forward 10 seconds."); }
      } else if (action.type === "web-action") {
        if (action.command === "focus-mode") { setFocusMode((value) => !value); setMessage("Focus mode toggled on this PocketDeck screen."); }
        if (action.command === "ambient-mode") { setAmbientMode((value) => !value); setMessage("Ambient mode toggled on this PocketDeck screen."); }
        if (action.command === "show-notice") { setMessage("This PocketDeck browser action was triggered by your phone."); }
        window.dispatchEvent(new CustomEvent("pocketdeck:action", { detail: action.command }));
      }
    };
    channel.addEventListener("message", onMessage);
    return () => channel.removeEventListener("message", onMessage);
  }, [channel, role]);

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    if (actionWindow.current && !actionWindow.current.closed) actionWindow.current.close();
  }, []);

  const activeCount = useMemo(() => deck.filter((button) => button.action).length, [deck]);

  const sendAction = (button: DeckButton) => {
    if (!button.action || channel.readyState !== "open") return;
    channel.send(JSON.stringify({ type: "deck-action", buttonId: button.id, action: button.action }));
    setMessage(`Sent ${button.title} to the computer.`);
  };

  const openEditor = (index: number) => {
    setEditIndex(index);
    setDraft(makeDraft(deck[index]));
  };

  const saveButton = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft || editIndex === null) return;
    const title = draft.title.trim().slice(0, 24);
    const icon = [...draft.icon.trim()][0]?.slice(0, 4) ?? "+";
    const button: DeckButton = { ...deck[editIndex], title: title || "New button", icon, color: draft.color, action: makeAction(draft) };
    if (button.action && !isDeckActionMessage({ type: "deck-action", buttonId: button.id, action: button.action })) {
      setMessage("Check the action details before saving.");
      return;
    }
    const updated = deck.map((current, index) => index === editIndex ? button : current);
    setDeck(updated);
    saveDeck(updated);
    setDraft(null);
    setEditIndex(null);
    setMessage(`${button.title} saved to your deck.`);
  };

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
    try { await navigator.clipboard.writeText(sharedText); setCopied(true); setMessage("Text copied to this computer’s clipboard."); window.setTimeout(() => setCopied(false), 1800); }
    catch { setMessage("Clipboard access is unavailable. Select and copy the text manually."); }
  };

  const draftTypeChange = (type: Draft["type"]) => {
    const initialValue = type === "timer" ? "300" : type === "media" ? "toggle" : type === "web-action" ? "show-notice" : type === "open-url" ? "https://" : type === "send-text" ? "" : "";
    setDraft((current) => current ? { ...current, type, value: initialValue } : current);
  };

  return <section className={`browser-deck ${role === "desktop" ? "desktop-deck" : "phone-deck"} ${focusMode ? "focus-mode" : ""} ${ambientMode ? "ambient-mode" : ""}`}>
    {role === "phone" ? <>
      <div className="deck-toolbar"><div><span className="deck-eyebrow"><Smartphone size={13} /> POCKETDECK CONTROL</span><h2>Your deck</h2></div><span className="deck-live"><i /> LIVE</span></div>
      <p className="deck-subtitle">{activeCount} actions · saved on this phone</p>
      <div className="control-grid">{deck.map((button, index) => <button key={button.id} className={`control-button deck-color-${button.color} ${!button.action ? "control-empty" : ""}`} onClick={() => editing ? openEditor(index) : sendAction(button)} onContextMenu={(event) => { event.preventDefault(); openEditor(index); }} aria-label={editing ? `Edit ${button.title}` : button.title}>
        {editing && <span className="edit-badge"><Pencil size={10} /></span>}<span className="control-glyph">{button.icon}</span><span className="control-label">{button.title}</span>
      </button>)}</div>
      <div className="deck-bottom"><span><span className="deck-page-dot" /><span className="deck-page-dot muted" /><span className="deck-page-dot muted" /></span><button className={`deck-edit-toggle ${editing ? "active" : ""}`} onClick={() => setEditing((value) => !value)}>{editing ? <Check size={13} /> : <Pencil size={13} />}{editing ? "Done editing" : "Edit deck"}</button></div>
      <p className="deck-hint">{editing ? "Tap any button to edit its name, color, icon, and action." : message}</p>
      {draft && <div className="editor-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDraft(null); }}><form className="button-editor" onSubmit={saveButton}>
        <div className="editor-heading"><div><span className="deck-eyebrow">CUSTOMIZE BUTTON {String((editIndex ?? 0) + 1).padStart(2, "0")}</span><h3>Edit button</h3></div><button type="button" className="editor-close" onClick={() => setDraft(null)} aria-label="Close editor"><X size={17} /></button></div>
        <label className="editor-label">Button name<input maxLength={24} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="Name this action" required /></label>
        <label className="editor-label">Icon<input maxLength={4} value={draft.icon} onChange={(event) => setDraft({ ...draft, icon: event.target.value })} placeholder="Add an emoji or symbol" /></label>
        <div className="editor-label">Button color<div className="color-picker">{deckColors.map((color) => <button key={color} type="button" className={`color-swatch deck-color-${color} ${draft.color === color ? "selected" : ""}`} aria-label={`${color} button color`} onClick={() => setDraft({ ...draft, color })} />)}</div></div>
        <label className="editor-label">Action<select value={draft.type} onChange={(event) => draftTypeChange(event.target.value as Draft["type"])}><option value="none">No action</option><option value="open-url">Open a URL</option><option value="send-text">Send text to computer</option><option value="timer">Start a timer</option><option value="media">Control media in PocketDeck</option><option value="web-action">PocketDeck web action</option></select><ChevronDown className="select-chevron" size={14} /></label>
        {draft.type === "open-url" && <label className="editor-label">Website URL<input type="url" value={draft.value} onChange={(event) => setDraft({ ...draft, value: event.target.value })} placeholder="https://example.com" required /></label>}
        {draft.type === "send-text" && <label className="editor-label">Text to send<textarea maxLength={5000} rows={3} value={draft.value} onChange={(event) => setDraft({ ...draft, value: event.target.value })} placeholder="Type text to copy on your computer" required /></label>}
        {draft.type === "timer" && <label className="editor-label">Timer length (seconds)<input type="number" min={1} max={3600} step={1} value={draft.value} onChange={(event) => setDraft({ ...draft, value: event.target.value })} required /></label>}
        {draft.type === "media" && <label className="editor-label">Media action<select value={draft.value} onChange={(event) => setDraft({ ...draft, value: event.target.value })}>{mediaCommands.map((command) => <option value={command} key={command}>{command.replaceAll("-", " ")}</option>)}</select></label>}
        {draft.type === "web-action" && <label className="editor-label">PocketDeck action<select value={draft.value} onChange={(event) => setDraft({ ...draft, value: event.target.value })}>{webCommands.map((command) => <option value={command} key={command}>{command.replaceAll("-", " ")}</option>)}</select></label>}
        <div className="editor-actions"><button type="button" className="editor-cancel" onClick={() => setDraft(null)}>Cancel</button><button type="submit" className="editor-save"><Save size={14} /> Save button</button></div>
      </form></div>}
    </> : <>
      <div className="desktop-deck-heading"><div><span className="deck-eyebrow"><Power size={13} /> BROWSER CONTROL</span><h2>Your phone is connected</h2><p>Actions from your phone arrive in this PocketDeck browser.</p></div><span className="deck-live"><i /> ENCRYPTED</span></div>
      <div className="desktop-control-row"><button className={`enable-window ${hasActionWindow ? "enabled" : ""}`} onClick={enableActionWindow}><ExternalLink size={15} />{hasActionWindow ? "Action window enabled" : "Enable link window"}</button><span>Opens links in a separate browser window</span></div>
      <div className="desktop-action-status" role="status"><span className="status-pulse" />{message}</div>
      {pendingUrl && <div className="received-card"><div className="received-copy"><span className="deck-eyebrow">LINK FROM YOUR PHONE</span><strong>{new URL(pendingUrl).hostname}</strong><small>{pendingUrl}</small></div><a href={pendingUrl} target="_blank" rel="noreferrer" onClick={() => setPendingUrl("")}>Open link <ExternalLink size={14} /></a><button aria-label="Dismiss link" onClick={() => setPendingUrl("")}><X size={15} /></button></div>}
      {sharedText && <div className="received-card"><div className="received-copy"><span className="deck-eyebrow">TEXT FROM YOUR PHONE</span><p>{sharedText}</p></div><button className="copy-received" onClick={copyText}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? "Copied" : "Copy text"}</button><button aria-label="Dismiss text" onClick={() => setSharedText("")}><X size={15} /></button></div>}
      {timerValue !== null && <div className={`timer-card ${timerValue === 0 ? "complete" : ""}`}><Timer size={17} /><div><span className="deck-eyebrow">{timerValue === 0 ? "TIMER FINISHED" : "PHONE TIMER"}</span><strong>{formatTime(timerValue)}</strong></div>{timerValue === 0 && <button onClick={() => setTimerValue(null)}><RotateCcw size={14} /> Dismiss</button>}</div>}
      <div className="browser-action-note"><ArrowLeft size={14} /><span>URL, text, timer, media, and PocketDeck web actions are validated before handling. Text is copied only after you choose Copy.</span></div>
    </>}
  </section>;
}
