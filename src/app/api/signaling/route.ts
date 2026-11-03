import { NextResponse } from "next/server";
import { networkInterfaces } from "node:os";
import { pruneExpired, rooms, type SignalRole, type SignalRoom } from "@/lib/signaling-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SignalEvent = { type: string; [key: string]: unknown };
const pairingTokenPattern = /^[A-Za-z0-9_-]{32,80}$/;

function localNetworkOrigin(requestUrl: string) {
  const origin = new URL(requestUrl);
  if (!/^(localhost|127\.0\.0\.1|\[::1\])$/i.test(origin.hostname)) return origin.origin;

  const override = process.env.POCKETDECK_LAN_ADDRESS;
  const addresses = Object.entries(networkInterfaces())
    .filter(([name]) => !/virtual|vpn|wsl|docker|hyper-v|loopback|vEthernet/i.test(name))
    .flatMap(([name, entries]) => (entries ?? []).map((entry) => ({ name, entry })))
    .filter(({ entry }) => entry.family === "IPv4" && !entry.internal && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(entry.address) && !/^192\.168\.(56|65)\./.test(entry.address) && !/^172\.(17|18)\./.test(entry.address))
    .sort((left, right) => Number(!/wi-?fi|wireless|wlan/i.test(left.name)) - Number(!/wi-?fi|wireless|wlan/i.test(right.name)))
    .map(({ entry }) => entry.address);
  const address = override && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(override)
    ? override
    : addresses[0];
  return address ? `${origin.protocol}//${address}${origin.port ? `:${origin.port}` : ""}` : origin.origin;
}

function fail(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
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

  if (type === "create") {
    if (role !== "desktop" || typeof body.key !== "string" || !pairingTokenPattern.test(body.key)) return fail(400, "Invalid computer session.");
    const existing = rooms.get(token);
    if (existing) {
      if (existing.desktopKey === body.key && !existing.closed) return NextResponse.json({ type: "created", expiresAt: existing.expiresAt, joinOrigin: localNetworkOrigin(request.url) });
      return fail(409, "This pairing session already exists.");
    }
    const expiresAt = Date.now() + 120_000;
    rooms.set(token, { events: { desktop: [], phone: [] }, phoneJoined: false, approved: false, expiresAt, desktopKey: body.key, phoneKey: null } satisfies SignalRoom);
    return NextResponse.json({ type: "created", expiresAt, joinOrigin: localNetworkOrigin(request.url) });
  }

  if (type === "join") {
    if (role !== "phone" || typeof body.key !== "string" || !pairingTokenPattern.test(body.key)) return fail(400, "Invalid phone session.");
    const room = rooms.get(token);
    if (!room || room.closed || room.expiresAt <= Date.now()) return fail(410, "This pairing link expired or has already been used.");
    if (room.phoneJoined) {
      if (room.phoneKey === token && body.key === token) return NextResponse.json({ type: "waiting-approval" });
      return fail(410, "This pairing link expired or has already been used.");
    }
    room.phoneJoined = true;
    room.phoneKey = token;
    const device = typeof body.device === "string" ? body.device.slice(0, 80) : "Phone browser";
    room.events.desktop.push({ type: "phone-request", device });
    return NextResponse.json({ type: "waiting-approval" });
  }

  if (role !== "desktop" && role !== "phone") return fail(400, "Invalid device role.");
  const room = rooms.get(token);
  if (!room) return fail(410, "This pairing session expired.");
  if (role === "desktop" && body.key !== room.desktopKey) return fail(403, "Computer session authorization failed.");
  if (role === "phone" && (!room.phoneJoined || body.key !== room.phoneKey)) return fail(403, "Phone session authorization failed.");

  if (type === "poll") {
    const events = room.events[role].splice(0);
    if (room.closed && events.length === 0) return fail(410, "This pairing session closed.");
    return NextResponse.json({ events });
  }

  if (type === "approve" && role === "desktop") {
    if (!room.phoneJoined || room.closed) return fail(409, "There is no phone request to approve.");
    room.approved = true;
    room.expiresAt = Date.now() + 30 * 60_000;
    room.events.desktop.push({ type: "approved" });
    room.events.phone.push({ type: "approved" });
    return NextResponse.json({ ok: true });
  }

  if ((type === "reject" || type === "disconnect" || type === "leave") && role === "desktop") {
    const reason = type === "reject" ? "rejected" : "disconnected";
    room.closed = reason;
    room.events.desktop.push({ type: "closed", reason });
    room.events.phone.push({ type: "closed", reason });
    room.expiresAt = Date.now() + 30_000;
    return NextResponse.json({ ok: true });
  }

  if (type === "leave" && role === "phone") {
    room.closed = "phone-disconnected";
    room.events.desktop.push({ type: "closed", reason: "phone-disconnected" });
    room.expiresAt = Date.now() + 30_000;
    return NextResponse.json({ ok: true });
  }

  if (type === "signal" && room.approved && !room.closed) {
    const data = body.data;
    if (!data || typeof data !== "object" || JSON.stringify(data).length > 60_000) return fail(400, "Invalid signaling data.");
    const signalData = data as Record<string, unknown>;
    if (!["offer", "answer", "candidate"].some((key) => key in signalData)) return fail(400, "Unsupported signaling data.");
    const target: SignalRole = role === "desktop" ? "phone" : "desktop";
    if (target === "phone" && !room.phoneJoined) return fail(409, "The phone is no longer connected.");
    room.events[target].push({ type: "signal", data: signalData });
    return NextResponse.json({ ok: true });
  }

  return fail(403, "This action is not allowed for the current session.");
}
