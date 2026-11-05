import { NextResponse } from "next/server";
import { iceServersFor, isValidSignalData, newSessionId, newVerificationCode } from "@/lib/ice-servers.mjs";
import { lanOrigins } from "@/lib/network";
import { createRateLimiter } from "@/lib/rate-limit.mjs";
import { closeRoom, LIMITS, pruneExpired, pushEvent, rooms, type SignalRole, type SignalRoom } from "@/lib/signaling-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const pairingTokenPattern = /^[A-Za-z0-9_-]{32,80}$/;
// Best-effort per-address limits for the endpoints that create or claim rooms.
const createLimiter = createRateLimiter({ capacity: 10, refillPerSecond: 10 / 60 });
const joinLimiter = createRateLimiter({ capacity: 20, refillPerSecond: 20 / 60 });

function fail(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

function clientAddress(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

function pollWaitMs() {
  const configured = Number(process.env.POCKETDECK_POLL_WAIT_MS);
  return Number.isFinite(configured) && configured >= 0 && process.env.POCKETDECK_POLL_WAIT_MS ? configured : 20_000;
}

/** Long-poll: hold the request until there is something to deliver, the room closes, or the wait ends. */
async function waitForEvents(token: string, role: SignalRole, signal: AbortSignal) {
  const deadline = Date.now() + pollWaitMs();
  while (!signal.aborted && Date.now() < deadline) {
    pruneExpired();
    const room = rooms.get(token);
    if (!room || room.closed || room.events[role].length) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return fail(400, "Invalid request body."); }

  pruneExpired();
  const type = body.type;
  const token = body.token;
  const role = body.role;
  if (typeof type !== "string" || typeof token !== "string" || !pairingTokenPattern.test(token)) return fail(400, "Invalid pairing session.");
  const key = typeof body.key === "string" && pairingTokenPattern.test(body.key) ? body.key : null;

  if (type === "create") {
    if (role !== "desktop" || !key) return fail(400, "Invalid computer session.");
    const origins = lanOrigins(request.url);
    const existing = rooms.get(token);
    if (existing) {
      if (existing.desktopKey === key && !existing.closed) return NextResponse.json({ type: "created", expiresAt: existing.expiresAt, joinOrigin: origins[0], joinOrigins: origins });
      return fail(409, "This pairing session already exists.");
    }
    if (!createLimiter.take(clientAddress(request))) return fail(429, "Too many pairing attempts. Wait a moment and try again.");
    if (rooms.size >= LIMITS.maxRooms) return fail(503, "Too many active pairing sessions. Try again shortly.");
    const expiresAt = Date.now() + LIMITS.pairingTtlMs;
    rooms.set(token, { events: { desktop: [], phone: [] }, phoneJoined: false, approved: false, expiresAt, desktopKey: key, phoneKey: null, code: null, done: { desktop: false, phone: false } } satisfies SignalRoom);
    return NextResponse.json({ type: "created", expiresAt, joinOrigin: origins[0], joinOrigins: origins });
  }

  if (type === "join") {
    // The phone proves identity with a key only it knows, never with the (shared) pairing token.
    if (role !== "phone" || !key) return fail(400, "Invalid phone session.");
    if (!joinLimiter.take(clientAddress(request))) return fail(429, "Too many attempts. Wait a moment and try again.");
    const room = rooms.get(token);
    if (!room || room.closed || room.expiresAt <= Date.now()) return fail(410, "This pairing link expired or has already been used.");
    if (room.phoneJoined) {
      if (room.phoneKey === key) return NextResponse.json({ type: "waiting-approval", code: room.code });
      return fail(410, "This pairing link expired or has already been used.");
    }
    room.phoneJoined = true;
    room.phoneKey = key;
    room.code = newVerificationCode();
    const device = typeof body.device === "string" ? body.device.slice(0, 80) : "Phone browser";
    pushEvent(room, "desktop", { type: "phone-request", device, code: room.code });
    return NextResponse.json({ type: "waiting-approval", code: room.code });
  }

  if (role !== "desktop" && role !== "phone") return fail(400, "Invalid device role.");
  const room = rooms.get(token);
  if (!room) return fail(410, "This pairing session expired.");
  if (role === "desktop" && key !== room.desktopKey) return fail(403, "Computer session authorization failed.");
  if (role === "phone" && (!room.phoneJoined || key !== room.phoneKey)) return fail(403, "Phone session authorization failed.");

  if (type === "poll") {
    if (!room.closed && room.approved) room.expiresAt = Date.now() + LIMITS.approvedTtlMs;
    if (!room.events[role].length) await waitForEvents(token, role, request.signal);
    const current = rooms.get(token);
    if (!current) return fail(410, "This pairing session expired.");
    const events = current.events[role].splice(0);
    if (current.closed && events.length === 0) return fail(410, "This pairing session closed.");
    return NextResponse.json({ events });
  }

  if (type === "approve" && role === "desktop") {
    if (!room.phoneJoined || room.closed) return fail(409, "There is no phone request to approve.");
    if (room.approved) return NextResponse.json({ ok: true });
    room.approved = true;
    room.expiresAt = Date.now() + LIMITS.approvedTtlMs;
    const iceServers = await iceServersFor(newSessionId());
    pushEvent(room, "desktop", { type: "approved", iceServers });
    pushEvent(room, "phone", { type: "approved", iceServers });
    return NextResponse.json({ ok: true });
  }

  // Either side reports that its data channel is open, so signaling is no longer needed.
  if (type === "complete" && room.approved) {
    room.done[role] = true;
    if (room.done.desktop && room.done.phone) rooms.delete(token);
    else room.expiresAt = Date.now() + LIMITS.completedTtlMs;
    return NextResponse.json({ ok: true });
  }

  if ((type === "reject" || type === "disconnect" || type === "leave") && role === "desktop") {
    closeRoom(room, type === "reject" ? "rejected" : "disconnected", ["desktop", "phone"]);
    return NextResponse.json({ ok: true });
  }

  if (type === "leave" && role === "phone") {
    closeRoom(room, "phone-disconnected", ["desktop"]);
    return NextResponse.json({ ok: true });
  }

  if (type === "signal" && room.approved && !room.closed) {
    if (!isValidSignalData(body.data)) return fail(400, "Invalid signaling data.");
    const target: SignalRole = role === "desktop" ? "phone" : "desktop";
    if (target === "phone" && !room.phoneJoined) return fail(409, "The phone is no longer connected.");
    if (!pushEvent(room, target, { type: "signal", data: body.data as Record<string, unknown> })) return fail(429, "Too many pending signaling messages.");
    return NextResponse.json({ ok: true });
  }

  return fail(403, "This action is not allowed for the current session.");
}
