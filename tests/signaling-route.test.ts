import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { LIMITS, pruneExpired, rooms } from "@/lib/signaling-store";

type Json = Record<string, unknown> & { events?: Array<Record<string, unknown>>; error?: string; code?: string };
let POST: (request: Request) => Promise<Response>;
let counter = 0;

const make = () => `${(counter++).toString(36).padStart(4, "0")}${"x".repeat(40)}`;
const post = async (body: Record<string, unknown>, headers: Record<string, string> = {}) => {
  const response = await POST(new Request("http://localhost:3000/api/signaling", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) }));
  return { status: response.status, body: await response.json() as Json };
};

beforeAll(async () => {
  process.env.POCKETDECK_POLL_WAIT_MS = "60";
  process.env.POCKETDECK_STUN_URLS = "none";
  ({ POST } = await import("@/app/api/signaling/route"));
});
beforeEach(() => rooms.clear());

async function pair() {
  const token = make(); const desktopKey = make(); const phoneKey = make();
  expect((await post({ type: "create", token, role: "desktop", key: desktopKey })).status).toBe(200);
  const join = await post({ type: "join", token, role: "phone", key: phoneKey, device: "Test phone" });
  return { token, desktopKey, phoneKey, join };
}

describe("signaling route", () => {
  it("pairs, approves and exchanges signals end to end", async () => {
    const { token, desktopKey, phoneKey, join } = await pair();
    expect(join.body.code).toMatch(/^\d{4}$/);

    const request = await post({ type: "poll", token, role: "desktop", key: desktopKey });
    expect(request.body.events?.[0]).toMatchObject({ type: "phone-request", device: "Test phone", code: join.body.code });

    expect((await post({ type: "approve", token, role: "desktop", key: desktopKey })).status).toBe(200);
    for (const [role, key] of [["desktop", desktopKey], ["phone", phoneKey]] as const) {
      const polled = await post({ type: "poll", token, role, key });
      expect(polled.body.events?.[0]).toMatchObject({ type: "approved" });
    }

    expect((await post({ type: "signal", token, role: "desktop", key: desktopKey, data: { offer: { sdp: "x" } } })).status).toBe(200);
    const received = await post({ type: "poll", token, role: "phone", key: phoneKey });
    expect(received.body.events?.[0]).toMatchObject({ type: "signal", data: { offer: { sdp: "x" } } });
  });

  it("does not let a second phone, or the shared token alone, claim the session", async () => {
    const { token } = await pair();
    const intruder = await post({ type: "join", token, role: "phone", key: make() });
    expect(intruder.status).toBe(410);
    const usingTokenAsKey = await post({ type: "poll", token, role: "phone", key: token });
    expect(usingTokenAsKey.status).toBe(403);
  });

  it("lets the same phone retry its join", async () => {
    const { token, phoneKey, join } = await pair();
    const retry = await post({ type: "join", token, role: "phone", key: phoneKey });
    expect(retry.body).toMatchObject({ type: "waiting-approval", code: join.body.code });
  });

  it("keeps a polled session alive far past the old 30 minute cutoff, and closes it once nobody polls", async () => {
    // The long-poll deadline is measured with Date, which is frozen here, so do not wait at all.
    vi.stubEnv("POCKETDECK_POLL_WAIT_MS", "0");
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const { token, desktopKey } = await pair();
      await post({ type: "approve", token, role: "desktop", key: desktopKey });
      // Poll every 4 minutes for 40 minutes: each poll renews the window.
      for (let minute = 4; minute <= 40; minute += 4) {
        vi.advanceTimersByTime(4 * 60_000);
        await post({ type: "poll", token, role: "desktop", key: desktopKey });
        pruneExpired();
        expect(rooms.get(token)?.closed, `closed after ${minute} min`).toBeUndefined();
      }
      vi.advanceTimersByTime(LIMITS.approvedTtlMs + 1000); // nobody polls any more
      pruneExpired();
      expect(rooms.get(token)?.closed).toBe("expired");
    } finally { vi.useRealTimers(); vi.stubEnv("POCKETDECK_POLL_WAIT_MS", "60"); }
  });

  it("discards the room once both sides report the channel is open", async () => {
    const { token, desktopKey, phoneKey } = await pair();
    await post({ type: "approve", token, role: "desktop", key: desktopKey });
    await post({ type: "complete", token, role: "desktop", key: desktopKey });
    expect(rooms.has(token)).toBe(true);
    await post({ type: "complete", token, role: "phone", key: phoneKey });
    expect(rooms.has(token)).toBe(false);
  });

  it("rejects malformed signaling data and unapproved signals", async () => {
    const { token, desktopKey } = await pair();
    expect((await post({ type: "signal", token, role: "desktop", key: desktopKey, data: { candidate: {} } })).status).toBe(403);
    await post({ type: "approve", token, role: "desktop", key: desktopKey });
    expect((await post({ type: "signal", token, role: "desktop", key: desktopKey, data: { nope: 1 } })).status).toBe(400);
    expect((await post({ type: "signal", token, role: "desktop", key: desktopKey, data: { offer: "x".repeat(70_000) } })).status).toBe(400);
  });

  it("caps queued events and active rooms", async () => {
    const { token, desktopKey } = await pair();
    await post({ type: "approve", token, role: "desktop", key: desktopKey });
    let last = 200;
    for (let index = 0; index < LIMITS.maxEventsPerQueue + 5; index += 1) last = (await post({ type: "signal", token, role: "desktop", key: desktopKey, data: { candidate: { index } } })).status;
    expect(last).toBe(429);

    rooms.clear();
    for (let index = 0; index < LIMITS.maxRooms; index += 1) {
      rooms.set(make(), { events: { desktop: [], phone: [] }, phoneJoined: false, approved: false, expiresAt: Date.now() + 60_000, desktopKey: "k", phoneKey: null, code: null, done: { desktop: false, phone: false } });
    }
    expect((await post({ type: "create", token: make(), role: "desktop", key: make() }, { "x-forwarded-for": "10.9.9.9" })).status).toBe(503);
  });

  it("rate-limits repeated room creation from one address", async () => {
    const statuses: number[] = [];
    for (let index = 0; index < 14; index += 1) statuses.push((await post({ type: "create", token: make(), role: "desktop", key: make() }, { "x-forwarded-for": "10.1.2.3" })).status);
    expect(statuses.slice(0, 10).every((status) => status === 200)).toBe(true);
    expect(statuses).toContain(429);
  });

  it("long-polls: returns quickly empty when idle, and wakes for new events", async () => {
    const { token, desktopKey, phoneKey } = await pair();
    await post({ type: "approve", token, role: "desktop", key: desktopKey });
    await post({ type: "poll", token, role: "desktop", key: desktopKey });
    const waiting = post({ type: "poll", token, role: "desktop", key: desktopKey });
    setTimeout(() => void post({ type: "signal", token, role: "phone", key: phoneKey, data: { answer: { sdp: "y" } } }), 20);
    expect((await waiting).body.events?.[0]).toMatchObject({ type: "signal" });
    const idle = await post({ type: "poll", token, role: "phone", key: phoneKey });
    expect(idle.body.events).toBeDefined();
  });

  it("does not register a phone from anything but a join request", async () => {
    const token = make(); const desktopKey = make();
    await post({ type: "create", token, role: "desktop", key: desktopKey });
    expect(rooms.get(token)?.phoneJoined).toBe(false);
  });
});
