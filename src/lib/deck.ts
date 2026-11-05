export type MediaCommand = "play" | "pause" | "toggle" | "mute" | "seek-back" | "seek-forward";
export type WebCommand = "focus-mode" | "show-notice" | "ambient-mode";

export type DeckAction =
  | { type: "open-url"; url: string }
  | { type: "send-text"; text: string }
  | { type: "timer"; seconds: number }
  | { type: "media"; command: MediaCommand }
  | { type: "web-action"; command: WebCommand };

export type DeckButton = {
  id: string;
  title: string;
  icon: string;
  color: string;
  action: DeckAction | null;
};

export type DeckActionMessage = {
  type: "deck-action";
  buttonId: string;
  action: DeckAction;
};

export const deckColors = ["violet", "blue", "cyan", "green", "amber", "orange", "pink", "slate"] as const;
export const mediaCommands: MediaCommand[] = ["play", "pause", "toggle", "mute", "seek-back", "seek-forward"];
export const webCommands: WebCommand[] = ["focus-mode", "show-notice", "ambient-mode"];

export const DECK_SIZE = 12;
export const MAX_TITLE_LENGTH = 24;
export const MAX_ICON_GRAPHEMES = 2;
const MAX_ICON_LENGTH = 24; // UTF-16 units: a family emoji is 11
const MAX_SYNC_BYTES = 60_000;

// Every default button works on its own. Media buttons only act on audio or video that is open inside the
// PocketDeck page, so they are available in the editor but not shipped as defaults.
export const defaultDeck: DeckButton[] = [
  { id: "slot-1", title: "Open search", icon: "⌕", color: "violet", action: { type: "open-url", url: "https://www.google.com" } },
  { id: "slot-2", title: "10 minute timer", icon: "◔", color: "blue", action: { type: "timer", seconds: 600 } },
  { id: "slot-3", title: "25 minute timer", icon: "◷", color: "amber", action: { type: "timer", seconds: 1500 } },
  { id: "slot-4", title: "Focus mode", icon: "✦", color: "green", action: { type: "web-action", command: "focus-mode" } },
  { id: "slot-5", title: "Copy intro", icon: "Aa", color: "pink", action: { type: "send-text", text: "Hi team — quick update:" } },
  { id: "slot-6", title: "Open maps", icon: "⌖", color: "cyan", action: { type: "open-url", url: "https://www.openstreetmap.org" } },
  { id: "slot-7", title: "Show notice", icon: "✧", color: "violet", action: { type: "web-action", command: "show-notice" } },
  { id: "slot-8", title: "Sign-off", icon: "✎", color: "blue", action: { type: "send-text", text: "Thanks — talk soon." } },
  { id: "slot-9", title: "World clock", icon: "◎", color: "orange", action: { type: "open-url", url: "https://www.timeanddate.com/worldclock/" } },
  { id: "slot-10", title: "Ambient mode", icon: "◌", color: "cyan", action: { type: "web-action", command: "ambient-mode" } },
  { id: "slot-11", title: "Five minute timer", icon: "◴", color: "pink", action: { type: "timer", seconds: 300 } },
  { id: "slot-12", title: "Add action", icon: "+", color: "slate", action: null },
];

/** First `max` user-perceived characters, so emoji with joiners, flags and skin tones are never cut in half. */
export function limitGraphemes(text: string, max: number) {
  const trimmed = text.trim();
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segments: string[] = [];
    for (const { segment } of new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(trimmed)) {
      if (segments.length >= max) break;
      segments.push(segment);
    }
    return segments.join("");
  }
  return [...trimmed].slice(0, max).join("");
}

export function isDeckActionMessage(value: unknown): value is DeckActionMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Record<string, unknown>;
  if (message.type !== "deck-action" || typeof message.buttonId !== "string" || !/^slot-(?:[1-9]|1[0-2])$/.test(message.buttonId)) return false;
  if (!message.action || typeof message.action !== "object") return false;
  const action = message.action as Record<string, unknown>;
  if (action.type === "open-url") {
    if (typeof action.url !== "string" || action.url.length > 2048) return false;
    try { const url = new URL(action.url); return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password; } catch { return false; }
  }
  if (action.type === "send-text") return typeof action.text === "string" && action.text.length > 0 && action.text.length <= 5000;
  if (action.type === "timer") return typeof action.seconds === "number" && Number.isInteger(action.seconds) && action.seconds >= 1 && action.seconds <= 3600;
  if (action.type === "media") return typeof action.command === "string" && mediaCommands.includes(action.command as MediaCommand);
  if (action.type === "web-action") return typeof action.command === "string" && webCommands.includes(action.command as WebCommand);
  return false;
}

export type DeckLoadStatus = "loaded" | "empty" | "invalid" | "unavailable";

export const DECK_STORAGE_KEY = "pocketdeck.deck";
const LEGACY_DECK_STORAGE_KEY = "pocketdeck.deck.v1";
const DECK_BACKUP_KEY = "pocketdeck.deck.backup";
const DECK_FORMAT_VERSION = 2;

function isValidButton(value: unknown, index: number): value is DeckButton {
  if (!value || typeof value !== "object") return false;
  const button = value as Record<string, unknown>;
  return button.id === `slot-${index + 1}`
    && typeof button.title === "string" && button.title.length > 0 && button.title.length <= MAX_TITLE_LENGTH
    && typeof button.icon === "string" && button.icon.length <= MAX_ICON_LENGTH
    && typeof button.color === "string" && (deckColors as readonly string[]).includes(button.color)
    && (button.action === null || isDeckActionMessage({ type: "deck-action", buttonId: button.id, action: button.action }));
}

export function isValidDeck(value: unknown): value is DeckButton[] {
  return Array.isArray(value) && value.length === DECK_SIZE && value.every(isValidButton);
}

/** Accepts the current envelope or the original bare array, and returns a safe deck or null. */
export function parseDeck(value: unknown): DeckButton[] | null {
  const candidate = value && typeof value === "object" && !Array.isArray(value) ? (value as { buttons?: unknown }).buttons : value;
  return isValidDeck(candidate) ? candidate : null;
}

export function serializeDeck(deck: DeckButton[]) {
  return JSON.stringify({ version: DECK_FORMAT_VERSION, buttons: deck });
}

function copyDefaultDeck(): DeckButton[] {
  return defaultDeck.map((button) => ({ ...button, action: button.action ? { ...button.action } as DeckAction : null }));
}

export function loadDeck(): { deck: DeckButton[]; status: DeckLoadStatus } {
  let stored: string | null;
  try { stored = localStorage.getItem(DECK_STORAGE_KEY) ?? localStorage.getItem(LEGACY_DECK_STORAGE_KEY); }
  catch { return { deck: copyDefaultDeck(), status: "unavailable" }; }
  if (stored === null) return { deck: copyDefaultDeck(), status: "empty" };

  let parsed: unknown;
  try { parsed = JSON.parse(stored); }
  catch { return { deck: copyDefaultDeck(), status: "invalid" }; }
  const deck = parseDeck(parsed);
  return deck ? { deck, status: "loaded" } : { deck: copyDefaultDeck(), status: "invalid" };
}

export function saveDeck(deck: DeckButton[]) {
  const serialized = serializeDeck(deck);
  localStorage.setItem(DECK_STORAGE_KEY, serialized);
  if (localStorage.getItem(DECK_STORAGE_KEY) !== serialized) throw new Error("Saved deck could not be verified.");
}

// The phone keeps the deck in browser storage tied to the site address, which changes with the computer's
// IP. These messages keep a copy on the computer (whose address stays localhost) so a new address does not
// start from an empty deck.
export type DeckSyncMessage =
  | { type: "deck-backup"; deck: DeckButton[] }
  | { type: "deck-restore-request" }
  | { type: "deck-restore"; deck: DeckButton[] };

export function parseDeckSyncMessage(value: unknown): DeckSyncMessage | null {
  if (!value || typeof value !== "object") return null;
  const message = value as { type?: unknown; deck?: unknown };
  if (message.type === "deck-restore-request") return { type: "deck-restore-request" };
  if ((message.type === "deck-backup" || message.type === "deck-restore") && isValidDeck(message.deck)) return { type: message.type, deck: message.deck };
  return null;
}

export function sendDeckSync(channel: RTCDataChannel, message: DeckSyncMessage) {
  if (channel.readyState !== "open") return;
  const payload = JSON.stringify(message);
  if (payload.length > MAX_SYNC_BYTES) return;
  try { channel.send(payload); } catch { /* the connection dropped; the next connect syncs again */ }
}

export function saveDeckBackup(deck: DeckButton[]) {
  try { localStorage.setItem(DECK_BACKUP_KEY, serializeDeck(deck)); } catch { /* backup is best-effort */ }
}

export function loadDeckBackup(): DeckButton[] | null {
  try {
    const stored = localStorage.getItem(DECK_BACKUP_KEY);
    return stored ? parseDeck(JSON.parse(stored)) : null;
  } catch { return null; }
}
