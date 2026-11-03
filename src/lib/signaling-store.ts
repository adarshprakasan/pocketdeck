export type SignalRole = "desktop" | "phone";
export type SignalEvent = { type: string; [key: string]: unknown };
export type SignalRoom = {
  events: Record<SignalRole, SignalEvent[]>;
  phoneJoined: boolean;
  approved: boolean;
  expiresAt: number;
  desktopKey: string;
  phoneKey: string | null;
  closed?: string;
};

const globalRooms = globalThis as typeof globalThis & { pocketDeckSignalRooms?: Map<string, SignalRoom> };
export const rooms = globalRooms.pocketDeckSignalRooms ??= new Map<string, SignalRoom>();

export function pruneExpired() {
  const now = Date.now();
  for (const [token, room] of rooms) {
    if (room.expiresAt <= now) {
      if (room.closed) rooms.delete(token);
      else {
        room.events.desktop.push({ type: "closed", reason: "expired" });
        room.events.phone.push({ type: "closed", reason: "expired" });
        room.closed = "expired";
        room.expiresAt = now + 30_000;
      }
    }
  }
}

export function registerPhoneJoin(token: string) {
  pruneExpired();
  const room = rooms.get(token);
  if (!room || room.closed || room.expiresAt <= Date.now()) return false;
  if (!room.phoneJoined) {
    room.phoneJoined = true;
    room.phoneKey = token;
    room.events.desktop.push({ type: "phone-request", device: "Phone browser" });
  }
  return room.phoneKey === token;
}
