"use client";

import QRCode from "qrcode";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { createHttpTransport, createWebSocketTransport, type Role, type SignalMessage, type SignalingTransport } from "@/lib/pairing/transport";
import { initialPairingState, pairingReducer } from "@/lib/pairing/state";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,80}$/;
const ICE_TIMEOUT_MS = 20_000;
const RECONNECT_GRACE_MS = 10_000;

type Session = { token: string; key: string };

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function computerSession(): Session {
  return { token: randomToken(), key: randomToken() };
}

/** The phone proves who it is with a key only this tab knows, so a leaked link alone cannot claim the session. */
function phoneSession(token: string): Session {
  const storageKey = `pocketdeck.phone-key.${token}`;
  let key: string | null = null;
  try { key = sessionStorage.getItem(storageKey); } catch { /* storage may be unavailable */ }
  if (!key || !TOKEN_PATTERN.test(key)) {
    key = randomToken();
    try { sessionStorage.setItem(storageKey, key); } catch { /* the session still works until the page reloads */ }
  }
  return { token, key };
}

function lostHint(role: Role, what: "lost" | "failed" | "ended") {
  const computer = role === "desktop";
  if (what === "ended") return computer ? "This session ended. Create a new pairing code to reconnect the phone." : "This session ended. Ask the computer to create a new QR code, then scan it again.";
  if (what === "failed") return computer ? "The connection failed. Create a new pairing code and try again." : "The connection failed. Ask the computer for a new QR code, then scan it again.";
  return computer ? "The connection was lost. Create a new pairing code to reconnect the phone." : "The connection was lost. Ask the computer to create a new QR code, then scan it again.";
}

const BLOCKED_HINT = "The network is blocking direct browser traffic. Guest Wi-Fi or router client isolation can do this even on the same network. Try the main Wi-Fi, allow your browser through the firewall, or configure the optional TURN relay described in the README.";

export function usePairing(role: Role, initialToken?: string) {
  const [state, dispatch] = useReducer(pairingReducer, initialPairingState);
  // Created on the client only. Nothing rendered before connecting depends on it, so hydration is unaffected.
  const [session, setSession] = useState<Session | null>(() => {
    if (typeof window === "undefined") return null;
    if (role === "desktop") return computerSession();
    return initialToken && TOKEN_PATTERN.test(initialToken) ? phoneSession(initialToken) : null;
  });
  const [activeChannel, setActiveChannel] = useState<RTCDataChannel | null>(null);
  const [qrImage, setQrImage] = useState<{ url: string; dataUrl: string } | null>(null);
  const [now, setNow] = useState(0);
  const [copied, setCopied] = useState(false);
  const transportRef = useRef<SignalingTransport | null>(null);
  const stageRef = useRef(state.stage);

  useEffect(() => { stageRef.current = state.stage; });

  useEffect(() => {
    if (!session) return;
    let disposed = false;
    let iceServers: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];
    let peer: RTCPeerConnection | null = null;
    let channel: RTCDataChannel | null = null;
    let connectionTimer: number | null = null;
    let reconnectTimer: number | null = null;
    const pendingCandidates: RTCIceCandidateInit[] = [];

    const clearTimer = (timer: number | null) => { if (timer !== null) window.clearTimeout(timer); return null; };
    const send = (data: Record<string, unknown>) => transportRef.current?.send("signal", { data });
    const addCandidate = async (target: RTCPeerConnection, candidate: RTCIceCandidateInit) => {
      // Late or duplicate candidates are normal and must never end the pairing.
      try { await target.addIceCandidate(candidate); } catch { /* ignore */ }
    };

    const setupPeer = () => {
      if (peer) return peer;
      const created = new RTCPeerConnection({ iceServers });
      peer = created;
      connectionTimer = window.setTimeout(() => {
        if (created.connectionState !== "connected" && created.connectionState !== "closed") dispatch({ type: "stage", stage: "error", hint: BLOCKED_HINT });
      }, ICE_TIMEOUT_MS);
      created.onicecandidate = (event) => { if (event.candidate) send({ candidate: event.candidate.toJSON() }); };
      created.onconnectionstatechange = () => {
        if (created.connectionState === "connected") {
          connectionTimer = clearTimer(connectionTimer);
          reconnectTimer = clearTimer(reconnectTimer);
          dispatch({ type: "stage", stage: "connected", hint: null });
          transportRef.current?.finish();
        } else if (created.connectionState === "connecting") {
          dispatch({ type: "stage", stage: "connecting" });
        } else if (created.connectionState === "disconnected") {
          dispatch({ type: "stage", stage: "connecting", hint: "Connection interrupted. PocketDeck is trying to recover…" });
          reconnectTimer = clearTimer(reconnectTimer);
          reconnectTimer = window.setTimeout(() => {
            reconnectTimer = null;
            if (created.connectionState !== "connected") dispatch({ type: "stage", stage: "error", hint: lostHint(role, "lost") });
          }, RECONNECT_GRACE_MS);
        } else if (created.connectionState === "failed") {
          connectionTimer = clearTimer(connectionTimer);
          reconnectTimer = clearTimer(reconnectTimer);
          dispatch({ type: "stage", stage: "error", hint: lostHint(role, "failed") });
        }
      };
      const channelReady = (next: RTCDataChannel) => {
        channel = next;
        next.onopen = () => {
          reconnectTimer = clearTimer(reconnectTimer);
          setActiveChannel(next);
          dispatch({ type: "stage", stage: "connected", hint: null });
          transportRef.current?.finish();
        };
        next.onclose = () => {
          setActiveChannel(null);
          if (created.connectionState !== "closed") dispatch({ type: "stage", stage: "error", hint: lostHint(role, "ended") });
        };
      };
      if (role === "desktop") channelReady(created.createDataChannel("pocketdeck", { ordered: true }));
      else created.ondatachannel = (event) => channelReady(event.channel);
      return created;
    };

    const handleSignal = async (data: Record<string, unknown>) => {
      const connection = setupPeer();
      try {
        if (role === "phone" && data.offer) {
          await connection.setRemoteDescription(data.offer as RTCSessionDescriptionInit);
          for (const candidate of pendingCandidates.splice(0)) await addCandidate(connection, candidate);
          const answer = await connection.createAnswer();
          await connection.setLocalDescription(answer);
          send({ answer });
          dispatch({ type: "stage", stage: "connecting" });
        } else if (role === "desktop" && data.answer) {
          await connection.setRemoteDescription(data.answer as RTCSessionDescriptionInit);
          for (const candidate of pendingCandidates.splice(0)) await addCandidate(connection, candidate);
          dispatch({ type: "stage", stage: "connecting" });
        } else if (data.candidate) {
          const candidate = data.candidate as RTCIceCandidateInit;
          if (connection.remoteDescription) await addCandidate(connection, candidate);
          else pendingCandidates.push(candidate);
        }
      } catch {
        dispatch({ type: "stage", stage: "error" });
      }
    };

    const beginOffer = async () => {
      const connection = setupPeer();
      const offer = await connection.createOffer();
      await connection.setLocalDescription(offer);
      send({ offer });
      dispatch({ type: "stage", stage: "connecting" });
    };

    const onMessage = async (message: SignalMessage) => {
      if (disposed) return;
      switch (message.type) {
        case "created":
          dispatch({ type: "created", expiresAt: message.expiresAt ?? null, origins: message.joinOrigins ?? (message.joinOrigin ? [message.joinOrigin] : []) });
          break;
        case "waiting-approval":
          dispatch({ type: "waiting", code: message.code ?? null });
          break;
        case "phone-request":
          dispatch({ type: "request", device: message.device ?? "Phone browser", code: message.code ?? null });
          break;
        case "approved":
          if (message.iceServers?.length) iceServers = message.iceServers;
          dispatch({ type: "stage", stage: "approved" });
          if (role === "desktop") void beginOffer().catch(() => dispatch({ type: "stage", stage: "error" }));
          break;
        case "signal":
          if (message.data) await handleSignal(message.data);
          break;
        case "closed": {
          // Once the data channel is up, or the session already ended, signaling news is irrelevant.
          if (channel?.readyState === "open" || stageRef.current === "expired" || stageRef.current === "rejected") break;
          const stage = message.reason === "expired" ? "expired" : message.reason === "rejected" ? "rejected" : "error";
          let hint: string | undefined;
          if (message.reason === "disconnected") hint = role === "phone" ? "The computer ended this session. Ask it to create a new QR code, then scan it again." : lostHint("desktop", "ended");
          dispatch({ type: "stage", stage, hint });
          break;
        }
      }
    };

    const onFatal = (error: Error & { status?: number }) => {
      if (disposed) return;
      if (/expired|already been used|already used/i.test(error.message)) dispatch({ type: "stage", stage: "expired" });
      else if (error.status === 429 || error.status === 503) dispatch({ type: "stage", stage: "error", hint: error.message });
      else dispatch({ type: "stage", stage: "error" });
    };

    const external = process.env.NEXT_PUBLIC_SIGNALING_URL;
    const transport = external
      ? createWebSocketTransport({ role, token: session.token, onMessage, onFatal, url: external })
      : createHttpTransport({ role, token: session.token, key: session.key, onMessage, onFatal });
    transportRef.current = transport;
    transport.start();

    return () => {
      disposed = true;
      transport.close();
      if (transportRef.current === transport) transportRef.current = null;
      connectionTimer = clearTimer(connectionTimer);
      reconnectTimer = clearTimer(reconnectTimer);
      peer?.close();
      peer = null;
      channel = null;
      setActiveChannel(null);
    };
  }, [session, role]);

  const origin = state.origin ?? (typeof window === "undefined" ? "" : window.location.origin);
  const joinUrl = session && origin ? `${origin}/join?token=${session.token}` : "";

  useEffect(() => {
    if (role !== "desktop" || state.stage !== "ready" || !joinUrl) return;
    let cancelled = false;
    QRCode.toDataURL(joinUrl, { width: 240, margin: 1, color: { dark: "#171622", light: "#ffffff" }, errorCorrectionLevel: "M" })
      .then((dataUrl) => { if (!cancelled) setQrImage({ url: joinUrl, dataUrl }); })
      .catch(() => dispatch({ type: "stage", stage: "error" }));
    return () => { cancelled = true; };
  }, [role, state.stage, joinUrl]);

  // The countdown comes from the service's expiry time, so it cannot drift from the real deadline.
  const expiresAt = state.expiresAt;
  useEffect(() => {
    if (role !== "desktop" || state.stage !== "ready" || !expiresAt) return;
    const tick = () => {
      const current = Date.now();
      setNow(current);
      if (current >= expiresAt) {
        transportRef.current?.send("disconnect");
        dispatch({ type: "stage", stage: "expired" });
      }
    };
    const first = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, 1000);
    return () => { window.clearTimeout(first); window.clearInterval(timer); };
  }, [role, state.stage, expiresAt]);

  const secondsLeft = expiresAt && now ? Math.max(0, Math.ceil((expiresAt - now) / 1000)) : 120;
  const qr = state.stage === "ready" && qrImage?.url === joinUrl ? qrImage.dataUrl : null;

  const approve = useCallback(() => {
    transportRef.current?.send("approve");
    dispatch({ type: "stage", stage: "approved" });
  }, []);
  const reject = useCallback(() => transportRef.current?.send("reject"), []);
  const restart = useCallback(() => {
    if (role !== "desktop") { window.location.reload(); return; }
    transportRef.current?.send("disconnect");
    dispatch({ type: "reset" });
    setQrImage(null);
    setSession(computerSession());
  }, [role]);
  const selectOrigin = useCallback((value: string) => dispatch({ type: "origin", origin: value }), []);
  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch { /* Clipboard access may be unavailable in an insecure context. */ }
  }, [joinUrl]);

  return { state, activeChannel, joinUrl, qr, secondsLeft, copied, approve, reject, restart, selectOrigin, copyLink };
}
