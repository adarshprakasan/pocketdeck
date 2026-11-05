// Optional standalone signaling service for hosted deployments (the portable build uses /api/signaling).
// Run with: npm run signaling   (set ALLOWED_ORIGIN in production). It shares validation, ICE/TURN
// handling and rate limiting with the HTTP route through src/lib, so copy that folder when deploying.
import { createServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { iceServersFor, isValidSignalData, newSessionId, newVerificationCode } from "../src/lib/ice-servers.mjs";
import { createRateLimiter } from "../src/lib/rate-limit.mjs";

const port = Number(process.env.PORT ?? process.env.SIGNALING_PORT ?? 3001);
const tokenPattern = /^[A-Za-z0-9_-]{32,80}$/;
const MAX_ROOMS = 50;
const PAIRING_TTL_MS = 120_000;
const HEARTBEAT_MS = 30_000;
const rooms = new Map();
const createLimiter = createRateLimiter({ capacity: 10, refillPerSecond: 10 / 60 });
const joinLimiter = createRateLimiter({ capacity: 20, refillPerSecond: 20 / 60 });

const server = createServer((_request, response) => {
  response.writeHead(200, { "content-type": "text/plain" });
  response.end("PocketDeck signaling service is running.\n");
});
const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

server.on("upgrade", (request, socket, head) => {
  const origin = request.headers.origin;
  const allowedOrigin = process.env.ALLOWED_ORIGIN;
  if ((allowedOrigin && origin !== allowedOrigin) || (process.env.NODE_ENV === "production" && !allowedOrigin)) {
    socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
    socket.destroy();
    return;
  }
  wss.handleUpgrade(request, socket, head, (client) => wss.emit("connection", client, request));
});

function send(peer, message) {
  if (peer?.readyState === WebSocket.OPEN) peer.send(JSON.stringify(message));
}

function closeRoom(token, reason = "closed") {
  const room = rooms.get(token);
  if (!room) return;
  rooms.delete(token);
  if (room.expiry) clearTimeout(room.expiry);
  send(room.desktop, { type: "closed", reason });
  send(room.phone, { type: "closed", reason });
  room.desktop?.close(1000, reason);
  room.phone?.close(1000, reason);
}

// Drop dead connections so abandoned rooms do not linger.
const heartbeat = setInterval(() => {
  for (const peer of wss.clients) {
    if (peer.isAlive === false) { peer.terminate(); continue; }
    peer.isAlive = false;
    peer.ping();
  }
}, HEARTBEAT_MS);
heartbeat.unref();

wss.on("connection", (peer, request) => {
  const address = request.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim() || request.socket.remoteAddress || "unknown";
  let role;
  let token;
  peer.isAlive = true;
  peer.on("pong", () => { peer.isAlive = true; });

  peer.on("message", async (raw) => {
    let message;
    try { message = JSON.parse(raw.toString()); } catch { peer.close(1003, "invalid message"); return; }
    if (!message || typeof message.type !== "string") { peer.close(1003, "invalid message"); return; }

    if (message.type === "create") {
      if (role || typeof message.token !== "string" || !tokenPattern.test(message.token) || rooms.has(message.token)) {
        peer.close(1008, "invalid pairing session"); return;
      }
      if (!createLimiter.take(address) || rooms.size >= MAX_ROOMS) { peer.close(1013, "try again later"); return; }
      role = "desktop";
      token = message.token;
      const expiresAt = Date.now() + PAIRING_TTL_MS;
      const expiry = setTimeout(() => closeRoom(token, "expired"), PAIRING_TTL_MS);
      expiry.unref();
      rooms.set(token, { desktop: peer, phone: null, approved: false, expiresAt, expiry });
      send(peer, { type: "created", expiresAt });
      return;
    }

    if (message.type === "join") {
      if (role || typeof message.token !== "string" || !tokenPattern.test(message.token)) { peer.close(1008, "invalid pairing request"); return; }
      if (!joinLimiter.take(address)) { peer.close(1013, "try again later"); return; }
      const room = rooms.get(message.token);
      if (!room || room.expiresAt <= Date.now() || room.phone) { peer.close(1008, "pairing link expired or already used"); return; }
      role = "phone";
      token = message.token;
      room.phone = peer;
      room.code = newVerificationCode();
      const device = typeof message.device === "string" ? message.device.slice(0, 80) : "Phone browser";
      send(room.desktop, { type: "phone-request", device, code: room.code });
      send(peer, { type: "waiting-approval", code: room.code });
      return;
    }

    const room = rooms.get(token);
    if (!room || (role !== "desktop" && role !== "phone")) { peer.close(1008, "no active pairing session"); return; }
    if (message.type === "approve" && role === "desktop") {
      if (!room.phone || room.approved) return;
      room.approved = true;
      clearTimeout(room.expiry);
      room.expiry = null;
      const iceServers = await iceServersFor(newSessionId());
      if (rooms.get(token) !== room) return;
      send(peer, { type: "approved", iceServers });
      send(room.phone, { type: "approved", iceServers });
      return;
    }
    if (message.type === "reject" && role === "desktop") { closeRoom(token, "rejected"); return; }
    if (message.type === "signal" && room.approved) {
      const target = role === "desktop" ? room.phone : room.desktop;
      if (isValidSignalData(message.data)) send(target, { type: "signal", data: message.data });
      return;
    }
    if (message.type === "disconnect" && role === "desktop") { closeRoom(token, "disconnected"); return; }
    peer.close(1008, "message not allowed");
  });

  peer.on("close", () => {
    if (!token) return;
    const room = rooms.get(token);
    if (!room) return;
    if (room.desktop === peer) closeRoom(token, "computer-disconnected");
    else if (room.phone === peer) closeRoom(token, "phone-disconnected");
  });
});

server.listen(port, "0.0.0.0", () => console.log(`PocketDeck signaling listening on :${port}`));
