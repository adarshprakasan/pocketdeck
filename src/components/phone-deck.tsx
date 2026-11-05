"use client";

import { Check, ChevronDown, Download, Pencil, Save, Smartphone, Upload, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from "react";
import { deckColors, isDeckActionMessage, limitGraphemes, loadDeck, mediaCommands, MAX_ICON_GRAPHEMES, MAX_TITLE_LENGTH, parseDeck, parseDeckSyncMessage, saveDeck, sendDeckSync, serializeDeck, webCommands, type DeckAction, type DeckButton, type DeckLoadStatus, type MediaCommand, type WebCommand } from "@/lib/deck";

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

const initialValues: Record<Draft["type"], string> = { none: "", "open-url": "https://", "send-text": "", timer: "300", media: "toggle", "web-action": "show-notice" };
const storageLabels: Record<DeckLoadStatus, string> = {
  loaded: "saved on this phone",
  empty: "default deck · changes save on this phone",
  invalid: "saved deck could not be read",
  unavailable: "phone storage unavailable",
};

export function PhoneDeck({ channel }: { channel: RTCDataChannel }) {
  // The phone deck only renders after pairing, in the browser, so reading storage here is safe.
  const [{ deck, status }, setLoaded] = useState(() => {
    const saved = loadDeck();
    return saved;
  });
  const [storageOrigin] = useState(() => window.location.origin);
  const [message, setMessage] = useState(() => status === "invalid" ? "Saved deck data could not be read, so the default deck is showing." : status === "unavailable" ? "Phone storage is unavailable. Deck changes may not persist." : "Connected and ready.");
  const [editing, setEditing] = useState(false);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const deckRef = useRef(deck);
  const statusRef = useRef(status);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const editorOpen = draft !== null;

  useEffect(() => { deckRef.current = deck; statusRef.current = status; });

  // Keep a copy on the computer, or restore from it when this address has never saved a deck.
  useEffect(() => {
    if (channel.readyState !== "open") return;
    if (statusRef.current === "loaded") sendDeckSync(channel, { type: "deck-backup", deck: deckRef.current });
    else if (statusRef.current === "empty") sendDeckSync(channel, { type: "deck-restore-request" });
  }, [channel]);

  useEffect(() => {
    const onMessage = (event: MessageEvent<string>) => {
      let incoming: unknown;
      try { incoming = JSON.parse(event.data); } catch { return; }
      const sync = parseDeckSyncMessage(incoming);
      if (sync) {
        if (sync.type !== "deck-restore" || statusRef.current !== "empty") return;
        try { saveDeck(sync.deck); } catch { setMessage("Could not save the restored deck on the phone."); return; }
        setLoaded({ deck: sync.deck, status: "loaded" });
        setMessage("Restored your deck from this computer.");
        return;
      }
      const acknowledgement = incoming as { type?: unknown; buttonId?: unknown };
      if (!acknowledgement || acknowledgement.type !== "deck-action-ack" || typeof acknowledgement.buttonId !== "string") return;
      const button = deckRef.current.find((item) => item.id === acknowledgement.buttonId);
      setMessage(`Computer received ${button?.title ?? "your action"}.`);
    };
    const onClose = () => setMessage("Connection lost. Reconnect the phone to continue.");
    channel.addEventListener("message", onMessage);
    channel.addEventListener("close", onClose);
    return () => {
      channel.removeEventListener("message", onMessage);
      channel.removeEventListener("close", onClose);
    };
  }, [channel]);

  useEffect(() => {
    if (editorOpen) firstFieldRef.current?.focus();
    else openerRef.current?.focus();
  }, [editorOpen]);

  const activeCount = useMemo(() => deck.filter((button) => button.action).length, [deck]);

  const commitDeck = (updated: DeckButton[], success: string) => {
    try { saveDeck(updated); }
    catch { setMessage("Could not save this deck on the phone. Check browser storage settings and try again."); return false; }
    setLoaded({ deck: updated, status: "loaded" });
    sendDeckSync(channel, { type: "deck-backup", deck: updated });
    setMessage(success);
    return true;
  };

  const sendAction = (button: DeckButton) => {
    if (!button.action) { setMessage("This button has no action yet. Edit it to add one."); return; }
    if (channel.readyState !== "open") { setMessage("Connection is not ready. Reconnect the phone and try again."); return; }
    try {
      channel.send(JSON.stringify({ type: "deck-action", buttonId: button.id, action: button.action }));
      navigator.vibrate?.(15);
      setMessage(`Sending ${button.title} to the computer…`);
    } catch {
      setMessage("Could not send the action. Reconnect the phone and try again.");
    }
  };

  const openEditor = (index: number) => {
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setEditIndex(index);
    setDraft(makeDraft(deck[index]));
  };

  const closeEditor = () => { setDraft(null); setEditIndex(null); };

  const saveButton = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft || editIndex === null) return;
    const button: DeckButton = {
      ...deck[editIndex],
      title: draft.title.trim().slice(0, MAX_TITLE_LENGTH) || "New button",
      icon: limitGraphemes(draft.icon, MAX_ICON_GRAPHEMES) || "+",
      color: draft.color,
      action: makeAction(draft),
    };
    if (button.action && !isDeckActionMessage({ type: "deck-action", buttonId: button.id, action: button.action })) {
      setMessage("Check the action details before saving.");
      return;
    }
    if (commitDeck(deck.map((current, index) => index === editIndex ? button : current), `${button.title} saved to your deck.`)) closeEditor();
  };

  const onEditorKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key === "Escape") { event.stopPropagation(); closeEditor(); return; }
    if (event.key !== "Tab") return;
    const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("input, select, textarea, button:not([disabled])"));
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };

  const exportDeck = () => {
    const url = URL.createObjectURL(new Blob([serializeDeck(deck)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "pocketdeck-deck.json";
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage("Deck exported. Import it to restore it at any address.");
  };

  const importDeck = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 200_000) { setMessage("That file is too large to be a PocketDeck deck."); return; }
    try {
      const imported = parseDeck(JSON.parse(await file.text()));
      if (!imported) { setMessage("That file is not a valid PocketDeck deck."); return; }
      commitDeck(imported, "Deck imported.");
    } catch {
      setMessage("Could not read that file.");
    }
  };

  const draftTypeChange = (type: Draft["type"]) => setDraft((current) => current ? { ...current, type, value: initialValues[type] } : current);
  const updateDraft = (patch: Partial<Draft>) => setDraft((current) => current ? { ...current, ...patch } : current);

  return (
    <section className="browser-deck phone-deck">
      <div className="deck-toolbar">
        <div><span className="deck-eyebrow"><Smartphone size={13} /> POCKETDECK CONTROL</span><h2>Your deck</h2></div>
        <span className="deck-live"><i /> LIVE</span>
      </div>
      <p className="deck-subtitle">{activeCount} actions · {storageLabels[status]}</p>
      <div className="deck-storage-origin"><span>Storage site</span><code>{storageOrigin}</code></div>
      <div className="control-grid">
        {deck.map((button, index) => (
          <button
            key={button.id}
            className={`control-button deck-color-${button.color} ${!button.action ? "control-empty" : ""}`}
            onClick={() => editing || !button.action ? openEditor(index) : sendAction(button)}
            onContextMenu={(event) => { event.preventDefault(); openEditor(index); }}
            aria-label={editing || !button.action ? `Edit ${button.title}` : button.title}
          >
            {editing && <span className="edit-badge"><Pencil size={10} /></span>}
            <span className="control-glyph">{button.icon}</span>
            <span className="control-label">{button.title}</span>
          </button>
        ))}
      </div>
      <div className="deck-bottom">
        <span className="deck-tools">
          <button className="deck-edit-toggle" onClick={exportDeck}><Download size={13} />Export</button>
          <button className="deck-edit-toggle" onClick={() => importRef.current?.click()}><Upload size={13} />Import</button>
          <input ref={importRef} type="file" accept="application/json,.json" className="sr-only" tabIndex={-1} aria-label="Import a PocketDeck deck file" onChange={importDeck} />
        </span>
        <button className={`deck-edit-toggle ${editing ? "active" : ""}`} onClick={() => setEditing((value) => !value)}>
          {editing ? <Check size={13} /> : <Pencil size={13} />}{editing ? "Done editing" : "Edit deck"}
        </button>
      </div>
      <p className="deck-hint" role="status" aria-live="polite">{editing ? "Tap any button to edit its name, color, icon, and action." : message}</p>
      {draft && (
        <div className="editor-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) closeEditor(); }}>
          <form className="button-editor" role="dialog" aria-modal="true" aria-labelledby="editor-title" onSubmit={saveButton} onKeyDown={onEditorKeyDown}>
            <div className="editor-heading">
              <div><span className="deck-eyebrow">CUSTOMIZE BUTTON {String((editIndex ?? 0) + 1).padStart(2, "0")}</span><h3 id="editor-title">Edit button</h3></div>
              <button type="button" className="editor-close" onClick={closeEditor} aria-label="Close editor"><X size={17} /></button>
            </div>
            <label className="editor-label">Button name<input ref={firstFieldRef} maxLength={MAX_TITLE_LENGTH} value={draft.title} onChange={(event) => updateDraft({ title: event.target.value })} placeholder="Name this action" required /></label>
            <label className="editor-label">Icon<input value={draft.icon} onChange={(event) => updateDraft({ icon: limitGraphemes(event.target.value, MAX_ICON_GRAPHEMES) })} placeholder="Add an emoji or symbol" /></label>
            <div className="editor-label">Button color
              <div className="color-picker">
                {deckColors.map((color) => <button key={color} type="button" className={`color-swatch deck-color-${color} ${draft.color === color ? "selected" : ""}`} aria-label={`${color} button color`} aria-pressed={draft.color === color} onClick={() => updateDraft({ color })} />)}
              </div>
            </div>
            <label className="editor-label">Action
              <select value={draft.type} onChange={(event) => draftTypeChange(event.target.value as Draft["type"])}>
                <option value="none">No action</option>
                <option value="open-url">Open a URL</option>
                <option value="send-text">Send text to computer</option>
                <option value="timer">Start a timer</option>
                <option value="media">Control media in PocketDeck</option>
                <option value="web-action">PocketDeck web action</option>
              </select>
              <ChevronDown className="select-chevron" size={14} />
            </label>
            {draft.type === "open-url" && <label className="editor-label">Website URL<input type="url" value={draft.value} onChange={(event) => updateDraft({ value: event.target.value })} placeholder="https://example.com" required /></label>}
            {draft.type === "send-text" && <label className="editor-label">Text to send<textarea maxLength={5000} rows={3} value={draft.value} onChange={(event) => updateDraft({ value: event.target.value })} placeholder="Type text to copy on your computer" required /></label>}
            {draft.type === "timer" && <label className="editor-label">Timer length (seconds)<input type="number" min={1} max={3600} step={1} value={draft.value} onChange={(event) => updateDraft({ value: event.target.value })} required /></label>}
            {draft.type === "media" && <label className="editor-label">Media action<select value={draft.value} onChange={(event) => updateDraft({ value: event.target.value })}>{mediaCommands.map((command) => <option value={command} key={command}>{command.replaceAll("-", " ")}</option>)}</select></label>}
            {draft.type === "web-action" && <label className="editor-label">PocketDeck action<select value={draft.value} onChange={(event) => updateDraft({ value: event.target.value })}>{webCommands.map((command) => <option value={command} key={command}>{command.replaceAll("-", " ")}</option>)}</select></label>}
            <div className="editor-actions"><button type="button" className="editor-cancel" onClick={closeEditor}>Cancel</button><button type="submit" className="editor-save"><Save size={14} /> Save button</button></div>
          </form>
        </div>
      )}
    </section>
  );
}
