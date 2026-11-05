import { createHmac, randomBytes, randomInt } from "node:crypto";

const CREDENTIAL_TTL_SECONDS = 4 * 60 * 60;
const MAX_SIGNAL_BYTES = 60_000;

/** Random id used for TURN usernames, so the pairing token never reaches a third-party relay. */
export function newSessionId() {
  return randomBytes(9).toString("base64url");
}

/** Four-digit code both screens show so the person can confirm the phone they approve is the one in their hand. */
export function newVerificationCode() {
  return String(randomInt(0, 10_000)).padStart(4, "0");
}

/**
 * STUN servers. Defaults to Google's public STUN. Set POCKETDECK_STUN_URLS to your own
 * comma-separated stun:/stuns: URLs, or to "none" for LAN-only mode (no third-party contact).
 */
function stunServers() {
  const raw = process.env.POCKETDECK_STUN_URLS;
  if (raw !== undefined && raw.trim() !== "") {
    if (/^(none|off|false)$/i.test(raw.trim())) return [];
    const urls = raw.split(",").map((url) => url.trim()).filter((url) => /^stuns?:/i.test(url));
    if (urls.length) return [{ urls }];
  }
  return [{ urls: "stun:stun.l.google.com:19302" }];
}

/**
 * @param {string} sessionId value from newSessionId() — never the pairing token
 * @returns {Promise<Array<{ urls: string | string[], username?: string, credential?: string }>>}
 */
export async function iceServersFor(sessionId) {
  const cloudflareKeyId = process.env.CLOUDFLARE_TURN_KEY_ID;
  const cloudflareKeySecret = process.env.CLOUDFLARE_TURN_KEY_SECRET;
  if (cloudflareKeyId && cloudflareKeySecret) {
    try {
      const response = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(cloudflareKeyId)}/credentials/generate-ice-servers`, {
        method: "POST",
        headers: { Authorization: `Bearer ${cloudflareKeySecret}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ttl: CREDENTIAL_TTL_SECONDS, customIdentifier: sessionId }),
        cache: "no-store",
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
  const servers = stunServers();
  const urls = process.env.TURN_URLS?.split(",").map((url) => url.trim()).filter((url) => /^(turn|turns):/i.test(url)) ?? [];
  const sharedSecret = process.env.TURN_SHARED_SECRET;
  if (!urls.length || !sharedSecret) return servers;
  const username = `${Math.floor(Date.now() / 1000) + CREDENTIAL_TTL_SECONDS}:${sessionId}`;
  const credential = createHmac("sha1", sharedSecret).update(username).digest("base64");
  return [...servers, { urls, username, credential }];
}

/** Shared by both signaling transports so they accept exactly the same payloads. */
export function isValidSignalData(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  let size;
  try { size = JSON.stringify(data).length; } catch { return false; }
  if (size > MAX_SIGNAL_BYTES) return false;
  return ["offer", "answer", "candidate"].some((key) => key in data);
}
