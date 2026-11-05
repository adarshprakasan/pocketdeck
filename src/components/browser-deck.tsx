"use client";

import { DesktopReceiver } from "@/components/desktop-receiver";
import { PhoneDeck } from "@/components/phone-deck";

export function BrowserDeck({ role, channel }: { role: "desktop" | "phone"; channel: RTCDataChannel }) {
  return role === "phone" ? <PhoneDeck channel={channel} /> : <DesktopReceiver channel={channel} />;
}
