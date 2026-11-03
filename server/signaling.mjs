import { createServer } from "node:http";
import { createHmac } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";

const port = Number(process.env.SIGNALING_PORT ?? 3001);
const rooms = new Map();
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

async function iceServersFor(token) {
  const cloudflareKeyId = process.env.CLOUDFLARE_TURN_KEY_ID;
  const cloudflareKeySecret = process.env.CLOUDFLARE_TURN_KEY_SECRET;
  if (cloudflareKeyId && cloudflareKeySecret) {
    try {
      const response = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(cloudflareKeyId)}/credentials/generate-ice-servers`, {
        method: "POST",
        headers: { Authorization: `Bearer ${cloudflareKeySecret}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ttl: 4 * 60 * 60, customIdentifier: token.slice(0, 12) }),
      });
      if (response.ok) {
        const result = await response.json();
        if (Array.isArray(result.iceServers) && result.iceServers.length) return result.iceServers;
        console.warn("[PocketDeck] Cloudflare TURN returned no ICE servers.");
      } else {
        console.warn(`[PocketDeck] Cloudflare TURN credential request failed with HTTP ${response.status}.`);
      }
    } catch (error) {
      console.warn("[PocketDeck] Cloudflare TURN credential request failed.", error instanceof Error ? error.message : "Unknown error.");
    }
  }
  const urls = process.env.TURN_URLS?.split(",").map((url) => url.trim()).filter((url) => /^(turn|turns):/i.test(url)) ?? [];
  const sharedSecret = process.env.TURN_SHARED_SECRET;
  const servers = [{ urls: "stun:stun.l.google.com:19302" }];
  if (!urls.length || !sharedSecret) return servers;
  const username = `${Math.floor(Date.now() / 1000) + 4 * 60 * 60}:${token}`;
  const credential = createHmac("sha1", sharedSecret).update(username).digest("base64");
  servers.push({ urls, username, credential });
  return servers;
}

wss.on("connection", (peer) => {
  let role;
  let token;

  peer.on("message", async (raw) => {
    let message;
    try { message = JSON.parse(raw.toString()); } catch { peer.close(1003, "invalid message"); return; }
    if (!message || typeof message.type !== "string") { peer.close(1003, "invalid message"); return; }

    if (message.type === "create") {
      if (role || typeof message.token !== "string" || !/^[A-Za-z0-9_-]{32,80}$/.test(message.token) || rooms.has(message.token)) {
        peer.close(1008, "invalid pairing session"); return;
      }
      role = "desktop";
      token = message.token;
      const expiresAt = Date.now() + 120_000;
      const expiry = setTimeout(() => closeRoom(token, "expired"), 120_000);
      expiry.unref();
      rooms.set(token, { desktop: peer, phone: null, approved: false, expiresAt, expiry });
      send(peer, { type: "created", expiresAt });
      return;
    }

    if (message.type === "join") {
      if (role || typeof message.token !== "string") { peer.close(1008, "invalid pairing request"); return; }
      const room = rooms.get(message.token);
      if (!room || room.expiresAt <= Date.now() || room.phone) { peer.close(1008, "pairing link expired or already used"); return; }
      role = "phone";
      token = message.token;
      room.phone = peer;
      const device = typeof message.device === "string" ? message.device.slice(0, 80) : "Phone browser";
      send(room.desktop, { type: "phone-request", device });
      send(peer, { type: "waiting-approval" });
      return;
    }

    const room = rooms.get(token);
    if (!room || (role !== "desktop" && role !== "phone")) { peer.close(1008, "no active pairing session"); return; }
    if (message.type === "approve" && role === "desktop") {
      if (!room.phone || room.approved) return;
      room.approved = true;
      clearTimeout(room.expiry);
      room.expiry = null;
      const iceServers = await iceServersFor(token);
      if (rooms.get(token) !== room) return;
      send(peer, { type: "approved", iceServers });
      send(room.phone, { type: "approved", iceServers });
      return;
    }
    if (message.type === "reject" && role === "desktop") { closeRoom(token, "rejected"); return; }
    if (message.type === "signal" && room.approved && (role === "desktop" || role === "phone")) {
      const target = role === "desktop" ? room.phone : room.desktop;
      if (message.data && typeof message.data === "object") send(target, { type: "signal", data: message.data });
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
