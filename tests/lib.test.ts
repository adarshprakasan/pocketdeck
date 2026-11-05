import { afterEach, describe, expect, it, vi } from "vitest";
import { iceServersFor, isValidSignalData, newSessionId, newVerificationCode } from "@/lib/ice-servers.mjs";
import { lanAddresses, lanOrigins } from "@/lib/network";
import { createRateLimiter } from "@/lib/rate-limit.mjs";

const iface = (address: string, internal = false) => [{ address, family: "IPv4" as const, internal, netmask: "255.255.255.0", mac: "00:00:00:00:00:00", cidr: `${address}/24` }];

describe("lanAddresses", () => {
  it("keeps real networks that the old filter wrongly excluded", () => {
    const found = lanAddresses({ "Wi-Fi": iface("192.168.56.10"), Ethernet: iface("172.17.4.2") });
    expect(found.map((entry) => entry.address)).toEqual(["192.168.56.10", "172.17.4.2"]);
  });
  it("skips virtual adapters, loopback and public addresses, and prefers Wi-Fi", () => {
    const found = lanAddresses({ "vEthernet (WSL)": iface("172.20.0.1"), docker0: iface("172.17.0.1"), lo: iface("127.0.0.1", true), Ethernet: iface("10.0.0.5"), "Wi-Fi": iface("192.168.1.20"), pub: iface("8.8.8.8") });
    expect(found.map((entry) => entry.address)).toEqual(["192.168.1.20", "10.0.0.5"]);
  });
  it("offers every candidate, honours the override first, and passes non-local hosts through", () => {
    const interfaces = { "Wi-Fi": iface("192.168.1.20"), Ethernet: iface("10.0.0.5") };
    expect(lanOrigins("http://localhost:3000/api", "192.168.9.9", interfaces)).toEqual(["http://192.168.9.9:3000", "http://192.168.1.20:3000", "http://10.0.0.5:3000"]);
    expect(lanOrigins("http://localhost:3000/api", "8.8.8.8", interfaces)[0]).toBe("http://192.168.1.20:3000");
    expect(lanOrigins("http://192.168.1.20:3000/api", undefined, interfaces)).toEqual(["http://192.168.1.20:3000"]);
    expect(lanOrigins("http://localhost:3000/api", undefined, {})).toEqual(["http://localhost:3000"]);
  });
});

describe("iceServersFor", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("never puts the pairing token in TURN credentials, and honours LAN-only mode", async () => {
    vi.stubEnv("POCKETDECK_STUN_URLS", "none");
    vi.stubEnv("TURN_URLS", "turn:turn.example.com:3478");
    vi.stubEnv("TURN_SHARED_SECRET", "secret");
    const id = newSessionId();
    const servers = await iceServersFor(id);
    expect(servers).toHaveLength(1);
    expect(servers[0].username).toMatch(new RegExp(`^\\d+:${id}$`));
    expect(servers[0].credential).toBeTruthy();
  });
  it("defaults to public STUN only, and accepts custom STUN", async () => {
    vi.stubEnv("POCKETDECK_STUN_URLS", "");
    expect(await iceServersFor("abc")).toEqual([{ urls: "stun:stun.l.google.com:19302" }]);
    vi.stubEnv("POCKETDECK_STUN_URLS", "stun:stun.example.org:3478, http://bad");
    expect(await iceServersFor("abc")).toEqual([{ urls: ["stun:stun.example.org:3478"] }]);
  });
  it("creates four-digit codes and unique ids", () => {
    expect(newVerificationCode()).toMatch(/^\d{4}$/);
    expect(newSessionId()).not.toBe(newSessionId());
  });
});

describe("isValidSignalData", () => {
  it("accepts only SDP and candidate payloads of sane size", () => {
    expect(isValidSignalData({ offer: {} })).toBe(true);
    expect(isValidSignalData({ candidate: {} })).toBe(true);
    expect(isValidSignalData({ other: 1 })).toBe(false);
    expect(isValidSignalData([])).toBe(false);
    expect(isValidSignalData(null)).toBe(false);
    expect(isValidSignalData({ offer: "x".repeat(61_000) })).toBe(false);
  });
});

describe("createRateLimiter", () => {
  it("allows a burst, blocks, then refills", () => {
    let time = 0;
    const limiter = createRateLimiter({ capacity: 3, refillPerSecond: 1, now: () => time });
    expect([1, 2, 3, 4].map(() => limiter.take("a"))).toEqual([true, true, true, false]);
    expect(limiter.take("b")).toBe(true);
    time += 2000;
    expect([limiter.take("a"), limiter.take("a"), limiter.take("a")]).toEqual([true, true, false]);
  });
  it("bounds memory by evicting the oldest keys", () => {
    const limiter = createRateLimiter({ capacity: 1, refillPerSecond: 0, maxKeys: 2 });
    limiter.take("a"); limiter.take("b"); limiter.take("c");
    expect(limiter.take("a")).toBe(true); // "a" was evicted, so it starts fresh
  });
});
