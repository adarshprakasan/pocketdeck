import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultDeck, isDeckActionMessage, isValidDeck, limitGraphemes, loadDeck, parseDeck, parseDeckSyncMessage, saveDeck, serializeDeck, type DeckButton } from "@/lib/deck";

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value), data };
}
const clone = () => structuredClone(defaultDeck) as DeckButton[];
const action = (value: unknown, buttonId = "slot-1") => isDeckActionMessage({ type: "deck-action", buttonId, action: value });

afterEach(() => vi.unstubAllGlobals());

describe("isDeckActionMessage", () => {
  it("accepts each supported action", () => {
    expect(action({ type: "open-url", url: "https://example.com/a?b=1" })).toBe(true);
    expect(action({ type: "send-text", text: "hello" })).toBe(true);
    expect(action({ type: "timer", seconds: 90 })).toBe(true);
    expect(action({ type: "media", command: "toggle" })).toBe(true);
    expect(action({ type: "web-action", command: "focus-mode" })).toBe(true);
  });

  it("rejects dangerous or malformed URLs", () => {
    for (const url of ["javascript:alert(1)", "data:text/html,hi", "file:///etc/passwd", "https://user:pass@example.com", "not a url", `https://example.com/${"a".repeat(2100)}`]) {
      expect(action({ type: "open-url", url }), url).toBe(false);
    }
  });

  it("rejects bad timers, text, commands and slots", () => {
    for (const seconds of [0, -1, 3601, 1.5, Number.NaN, "60"]) expect(action({ type: "timer", seconds }), String(seconds)).toBe(false);
    expect(action({ type: "send-text", text: "" })).toBe(false);
    expect(action({ type: "send-text", text: "x".repeat(5001) })).toBe(false);
    expect(action({ type: "media", command: "eject" })).toBe(false);
    expect(action({ type: "web-action", command: "rm -rf" })).toBe(false);
    expect(action({ type: "timer", seconds: 60 }, "slot-13")).toBe(false);
    expect(action({ type: "timer", seconds: 60 }, "slot-0")).toBe(false);
    expect(action(null)).toBe(false);
  });
});

describe("limitGraphemes", () => {
  it("keeps the two-character default icon intact", () => expect(limitGraphemes("Aa", 2)).toBe("Aa"));
  it("never splits multi-part emoji", () => {
    expect(limitGraphemes("👨‍👩‍👧", 2)).toBe("👨‍👩‍👧");
    expect(limitGraphemes("🇦🇪🇮🇳🇺🇸", 2)).toBe("🇦🇪🇮🇳");
    expect(limitGraphemes("👍🏽x", 1)).toBe("👍🏽");
    expect(limitGraphemes("  ❤️  ", 2)).toBe("❤️");
  });
  it("returns an empty string for blank input", () => expect(limitGraphemes("   ", 2)).toBe(""));
});

describe("deck validation and storage", () => {
  it("ships a valid default deck with no dead media buttons", () => {
    expect(isValidDeck(defaultDeck)).toBe(true);
    expect(defaultDeck.some((button) => button.action?.type === "media")).toBe(false);
  });

  it("rejects wrong length, wrong slot ids, bad colors and oversized titles", () => {
    expect(isValidDeck(clone().slice(0, 11))).toBe(false);
    const swapped = clone(); swapped[0].id = "slot-2";
    expect(isValidDeck(swapped)).toBe(false);
    const color = clone(); color[0].color = "neon";
    expect(isValidDeck(color)).toBe(false);
    const title = clone(); title[0].title = "x".repeat(25);
    expect(isValidDeck(title)).toBe(false);
  });

  it("parses the envelope and the legacy bare array", () => {
    expect(parseDeck(JSON.parse(serializeDeck(clone())))).toHaveLength(12);
    expect(parseDeck(clone())).toHaveLength(12);
    expect(parseDeck({ buttons: "nope" })).toBeNull();
    expect(parseDeck(null)).toBeNull();
  });

  it("round-trips through storage", () => {
    const storage = memoryStorage();
    vi.stubGlobal("localStorage", storage);
    const deck = clone(); deck[0].title = "Custom";
    saveDeck(deck);
    expect(loadDeck()).toMatchObject({ status: "loaded", deck: expect.arrayContaining([expect.objectContaining({ title: "Custom" })]) });
  });

  it("migrates a deck saved by version 0.1.0", () => {
    vi.stubGlobal("localStorage", memoryStorage({ "pocketdeck.deck.v1": JSON.stringify(clone()) }));
    expect(loadDeck().status).toBe("loaded");
  });

  it("reports empty, invalid and unavailable storage with the default deck", () => {
    vi.stubGlobal("localStorage", memoryStorage());
    expect(loadDeck().status).toBe("empty");
    vi.stubGlobal("localStorage", memoryStorage({ "pocketdeck.deck": "{not json" }));
    expect(loadDeck().status).toBe("invalid");
    vi.stubGlobal("localStorage", memoryStorage({ "pocketdeck.deck": JSON.stringify(clone().slice(0, 3)) }));
    expect(loadDeck()).toMatchObject({ status: "invalid" });
    vi.stubGlobal("localStorage", { getItem: () => { throw new Error("blocked"); } });
    const unavailable = loadDeck();
    expect(unavailable.status).toBe("unavailable");
    expect(unavailable.deck).toHaveLength(12);
  });
});

describe("parseDeckSyncMessage", () => {
  it("accepts valid sync messages only", () => {
    expect(parseDeckSyncMessage({ type: "deck-restore-request" })).toEqual({ type: "deck-restore-request" });
    expect(parseDeckSyncMessage({ type: "deck-backup", deck: clone() })?.type).toBe("deck-backup");
    expect(parseDeckSyncMessage({ type: "deck-backup", deck: [] })).toBeNull();
    expect(parseDeckSyncMessage({ type: "deck-restore", deck: "x" })).toBeNull();
    expect(parseDeckSyncMessage({ type: "other" })).toBeNull();
  });
});
