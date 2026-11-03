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

export const defaultDeck: DeckButton[] = [
  { id: "slot-1", title: "Open search", icon: "⌕", color: "violet", action: { type: "open-url", url: "https://www.google.com" } },
  { id: "slot-2", title: "Play / pause", icon: "▶", color: "blue", action: { type: "media", command: "toggle" } },
  { id: "slot-3", title: "25 minute timer", icon: "◷", color: "amber", action: { type: "timer", seconds: 1500 } },
  { id: "slot-4", title: "Focus mode", icon: "✦", color: "green", action: { type: "web-action", command: "focus-mode" } },
  { id: "slot-5", title: "Copy intro", icon: "Aa", color: "pink", action: { type: "send-text", text: "Hi team — quick update:" } },
  { id: "slot-6", title: "Back 10 sec", icon: "↶", color: "cyan", action: { type: "media", command: "seek-back" } },
  { id: "slot-7", title: "Show notice", icon: "✧", color: "violet", action: { type: "web-action", command: "show-notice" } },
  { id: "slot-8", title: "Forward 10 sec", icon: "↷", color: "blue", action: { type: "media", command: "seek-forward" } },
  { id: "slot-9", title: "Mute media", icon: "◖", color: "orange", action: { type: "media", command: "mute" } },
  { id: "slot-10", title: "Ambient mode", icon: "◌", color: "cyan", action: { type: "web-action", command: "ambient-mode" } },
  { id: "slot-11", title: "Five minute timer", icon: "◴", color: "pink", action: { type: "timer", seconds: 300 } },
  { id: "slot-12", title: "Add action", icon: "+", color: "slate", action: null },
];

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

export function loadDeck(): DeckButton[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem("pocketdeck.deck.v1") ?? "null");
    if (Array.isArray(parsed) && parsed.length === 12 && parsed.every((button) => button && typeof button.id === "string" && typeof button.title === "string" && typeof button.icon === "string" && deckColors.includes(button.color) && (button.action === null || isDeckActionMessage({ type: "deck-action", buttonId: button.id, action: button.action })))) return parsed as DeckButton[];
  } catch { /* Use the starter deck if saved data is missing or invalid. */ }
  return defaultDeck.map((button) => ({ ...button, action: button.action ? { ...button.action } as DeckAction : null }));
}

export function saveDeck(deck: DeckButton[]) {
  localStorage.setItem("pocketdeck.deck.v1", JSON.stringify(deck));
}
