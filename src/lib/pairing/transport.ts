export type SignalMessage = {
  type?: string;
  expiresAt?: number;
  device?: string;
  code?: string | null;
  data?: Record<string, unknown>;
  reason?: string;
  joinOrigin?: string;
  joinOrigins?: string[];
  iceServers?: RTCIceServer[];
};

export type Role = "desktop" | "phone";

export interface SignalingTransport {
  /** Connect and register this device (create for the computer, join for the phone). */
  start(): void;
  send(type: string, payload?: Record<string, unknown>): void;
  /** The data channel is open: stop signaling. Safe to call more than once. */
  finish(): void;
  close(): void;
}

export type TransportOptions = {
  role: Role;
  token: string;
  key: string;
  /** Messages are delivered one at a time, in order; the transport waits for each handler. */
  onMessage: (message: SignalMessage) => void | Promise<void>;
  onFatal: (error: Error & { status?: number }) => void;
};

class HttpError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

/** Long-poll transport used by the portable build (no extra server process). */
export function createHttpTransport({ role, token, key, onMessage, onFatal }: TransportOptions): SignalingTransport {
  const controller = new AbortController();
  let active = true;

  const request = async (type: string, payload: Record<string, unknown> = {}, signal?: AbortSignal) => {
    const response = await fetch("/api/signaling", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      signal,
      body: JSON.stringify({ type, token, role, key, ...payload }),
    });
    const result = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) throw new HttpError(typeof result.error === "string" ? result.error : "Pairing service unavailable.", response.status);
    return result as { type?: string; events?: SignalMessage[] } & SignalMessage;
  };

  const fatal = (error: unknown) => {
    if (!active) return;
    onFatal(error instanceof Error ? error : new Error("Pairing service unavailable."));
  };

  const run = async () => {
    try {
      const registered = await request(role === "desktop" ? "create" : "join", role === "phone" ? { device: "Phone browser" } : {}, controller.signal);
      if (registered.type) await onMessage(registered);
    } catch (error) { fatal(error); return; }

    let failures = 0;
    while (active) {
      try {
        const result = await request("poll", {}, controller.signal);
        failures = 0;
        for (const message of result.events ?? []) await onMessage(message);
      } catch (error) {
        if (!active) return;
        // 4xx answers are definitive (expired, closed, not allowed). Anything else is retried with backoff.
        if (error instanceof HttpError && error.status < 500) { fatal(error); return; }
        failures += 1;
        if (failures > 5) { fatal(error); return; }
        await sleep(Math.min(4000, 300 * 2 ** failures));
      }
    }
  };

  return {
    start() { void run(); },
    send(type, payload = {}) {
      if (!active) return;
      // Control messages are never aborted, so a final "disconnect" still reaches the service.
      void request(type, payload).catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        fatal(error);
      });
    },
    finish() {
      if (!active) return;
      active = false;
      controller.abort();
      // Tell the service so it can discard the room instead of waiting for it to expire.
      void request("complete").catch(() => undefined);
    },
    close() {
      active = false;
      controller.abort();
    },
  };
}

/** WebSocket transport for the optional hosted signaling service (server/signaling.mjs). */
export function createWebSocketTransport({ role, token, onMessage, onFatal, url }: Omit<TransportOptions, "key"> & { url: string }): SignalingTransport {
  let socket: WebSocket | null = null;
  let active = true;
  let queue: Promise<void> = Promise.resolve();

  return {
    start() {
      const current = new WebSocket(url);
      socket = current;
      current.onopen = () => {
        current.send(JSON.stringify(role === "desktop" ? { type: "create", token } : { type: "join", token, device: "Phone browser" }));
      };
      current.onmessage = (event) => {
        let message: SignalMessage;
        try { message = JSON.parse(event.data as string) as SignalMessage; }
        catch { onFatal(new Error("Invalid message from the pairing service.")); return; }
        queue = queue.then(() => onMessage(message));
      };
      current.onerror = () => { if (active) onFatal(new Error("Could not connect to the pairing service.")); };
      current.onclose = (event) => {
        if (active && event.code === 1008) onFatal(Object.assign(new Error("This pairing link expired or has already been used."), { status: 410 }));
      };
    },
    send(type, payload = {}) {
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type, ...payload }));
    },
    // The socket stays open: the hosted service ties the room's lifetime to it.
    finish() {},
    close() {
      active = false;
      socket?.close();
      socket = null;
    },
  };
}
