export type SignalRole = "desktop" | "phone";
export type SignalEvent = { type: string; [key: string]: unknown };
export type SignalRoom = {
  events: Record<SignalRole, SignalEvent[]>;
  phoneJoined: boolean;
  approved: boolean;
  expiresAt: number;
  desktopKey: string;
  phoneKey: string | null;
  code: string | null;
  done: Record<SignalRole, boolean>;
  closed?: string;
};

export const LIMITS = {
  /** Time to scan the QR code and send a request. */
  pairingTtlMs: 120_000,
  /** Sliding window while approved and negotiating; each poll renews it. Signaling stops once the channel opens. */
  approvedTtlMs: 5 * 60_000,
  closedTtlMs: 30_000,
  completedTtlMs: 60_000,
  maxRooms: 50,
  maxEventsPerQueue: 200,
};

const globalRooms = globalThis as typeof globalThis & { pocketDeckSignalRooms?: Map<string, SignalRoom> };
export const rooms = globalRooms.pocketDeckSignalRooms ??= new Map<string, SignalRoom>();

/** Queue an event for a peer. Returns false when the queue is full (an unresponsive or abusive peer). */
export function pushEvent(room: SignalRoom, role: SignalRole, event: SignalEvent) {
  const queue = room.events[role];
  if (queue.length >= LIMITS.maxEventsPerQueue) return false;
  queue.push(event);
  return true;
}

export function closeRoom(room: SignalRoom, reason: string, notify: SignalRole[], now = Date.now()) {
  room.closed = reason;
  for (const role of notify) pushEvent(room, role, { type: "closed", reason });
  room.expiresAt = now + LIMITS.closedTtlMs;
}

export function pruneExpired(now = Date.now()) {
  for (const [token, room] of rooms) {
    if (room.expiresAt > now) continue;
    if (room.closed) rooms.delete(token);
    else closeRoom(room, "expired", ["desktop", "phone"], now);
  }
}
