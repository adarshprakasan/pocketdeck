"use client";

import QRCode from "qrcode";
import { ArrowLeft, AudioLines, Check, CircleHelp, Clock3, Copy, LoaderCircle, LockKeyhole, Monitor, RefreshCw, Smartphone, Unplug, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { BrowserDeck } from "@/components/browser-deck";

type Role = "desktop" | "phone";
type Stage = "starting" | "ready" | "waiting" | "request" | "approved" | "connecting" | "connected" | "expired" | "rejected" | "error";

const descriptions: Record<Stage, string> = {
  starting: "Preparing a secure, short-lived session…",
  ready: "Scan this code with your phone camera to request access.",
  waiting: "Your request is on its way. Approve this phone on the computer.",
  request: "A phone is asking to connect. Approve only if you started this request.",
  approved: "Approved. Establishing an encrypted browser connection…",
  connecting: "Connecting the two browsers…",
  connected: "Your browsers are connected securely.",
  expired: "This pairing code expired. Create a new one to try again.",
  rejected: "The pairing request was declined.",
  error: "Could not connect to the pairing service. Check that it is running and try again.",
};

function createToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function signalingUrl() {
  if (process.env.NEXT_PUBLIC_SIGNALING_URL) return process.env.NEXT_PUBLIC_SIGNALING_URL;
  return `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.hostname}:3001`;
}

export function PairingScreen({ role, initialToken, initialStage = "starting" }: { role: Role; initialToken?: string; initialStage?: Stage }) {
  const [token, setToken] = useState<string | null>(initialToken ?? null);
  const [desktopKey, setDesktopKey] = useState<string | null>(null);
  const [joinOrigin, setJoinOrigin] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>(initialStage);
  const [qr, setQr] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(120);
  const [device, setDevice] = useState("Phone browser");
  const [copied, setCopied] = useState(false);
  const [activeChannel, setActiveChannel] = useState<RTCDataChannel | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const sendControlRef = useRef<(type: string, payload?: Record<string, unknown>) => void>(() => undefined);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);
  const pendingCandidates = useRef<RTCIceCandidateInit[]>([]);

  const signal = useCallback((data: Record<string, unknown>) => {
    sendControlRef.current("signal", { data });
  }, []);

  const setupPeer = useCallback((activeRole: Role) => {
    if (peerRef.current) return peerRef.current;
    const peer = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    peerRef.current = peer;
    peer.onicecandidate = (event) => { if (event.candidate) signal({ candidate: event.candidate.toJSON() }); };
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === "connected") setStage("connected");
      else if (peer.connectionState === "connecting") setStage("connecting");
      else if (peer.connectionState === "failed" || peer.connectionState === "disconnected") setStage("error");
    };
    const channelReady = (channel: RTCDataChannel) => {
      channelRef.current = channel;
      channel.onopen = () => { setActiveChannel(channel); setStage("connected"); };
      channel.onclose = () => { setActiveChannel(null); if (peer.connectionState !== "closed") setStage("error"); };
    };
    if (activeRole === "desktop") channelReady(peer.createDataChannel("pocketdeck", { ordered: true }));
    else peer.ondatachannel = (event) => channelReady(event.channel);
    return peer;
  }, [signal]);

  const handleSignal = useCallback(async (data: Record<string, unknown>) => {
    const peer = setupPeer(role);
    try {
      if (role === "phone" && data.offer) {
        await peer.setRemoteDescription(data.offer as RTCSessionDescriptionInit);
        for (const candidate of pendingCandidates.current.splice(0)) await peer.addIceCandidate(candidate);
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        signal({ answer });
        setStage("connecting");
      } else if (role === "desktop" && data.answer) {
        await peer.setRemoteDescription(data.answer as RTCSessionDescriptionInit);
        for (const candidate of pendingCandidates.current.splice(0)) await peer.addIceCandidate(candidate);
        setStage("connecting");
      } else if (data.candidate) {
        const candidate = data.candidate as RTCIceCandidateInit;
        if (peer.remoteDescription) await peer.addIceCandidate(candidate);
        else pendingCandidates.current.push(candidate);
      }
    } catch {
      setStage("error");
    }
  }, [role, setupPeer, signal]);

  const beginOffer = useCallback(async () => {
    const peer = setupPeer("desktop");
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    signal({ offer });
    setStage("connecting");
  }, [setupPeer, signal]);

  useEffect(() => {
    if (role === "desktop") {
      if (!token) setToken(createToken());
      if (!desktopKey) setDesktopKey(createToken());
    }
  }, [role, token, desktopKey]);

  useEffect(() => {
    if (!token || (role === "desktop" && !desktopKey)) return;
    let disposed = false;
    const controller = new AbortController();
    const externalSignalingUrl = process.env.NEXT_PUBLIC_SIGNALING_URL;
    const onMessage = async (message: { type?: string; expiresAt?: number; device?: string; data?: Record<string, unknown>; reason?: string; joinOrigin?: string }) => {
      if (message.type === "created") { if (message.joinOrigin) setJoinOrigin(message.joinOrigin); setStage("ready"); }
      if (message.type === "waiting-approval") setStage("waiting");
      if (message.type === "phone-request") { setDevice(message.device ?? "Phone browser"); setStage("request"); }
      if (message.type === "approved") {
        setStage("approved");
        if (role === "desktop") void beginOffer().catch(() => setStage("error"));
      }
      if (message.type === "signal" && message.data) await handleSignal(message.data);
      if (message.type === "closed") setStage(message.reason === "expired" ? "expired" : message.reason === "rejected" ? "rejected" : "error");
    };

    if (externalSignalingUrl) {
      const socket = new WebSocket(signalingUrl());
      socketRef.current = socket;
      sendControlRef.current = (type, payload = {}) => {
        if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type, ...payload }));
      };
      socket.onopen = () => {
        if (role === "desktop") socket.send(JSON.stringify({ type: "create", token }));
        else socket.send(JSON.stringify({ type: "join", token, device: "Phone browser" }));
      };
      socket.onmessage = (event) => {
        let message: { type?: string; expiresAt?: number; device?: string; data?: Record<string, unknown>; reason?: string };
        try { message = JSON.parse(event.data as string); } catch { setStage("error"); return; }
        void onMessage(message);
      };
      socket.onerror = () => { if (!disposed) setStage("error"); };
      socket.onclose = (event) => { if (!disposed && event.code === 1008) setStage("expired"); };
      return () => {
        disposed = true;
        socket.close();
        if (socketRef.current === socket) socketRef.current = null;
        sendControlRef.current = () => undefined;
        peerRef.current?.close();
        peerRef.current = null;
        setActiveChannel(null);
      };
    }

    socketRef.current = null;
    const post = async (type: string, payload: Record<string, unknown> = {}) => {
      const response = await fetch("/api/signaling", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        signal: controller.signal,
        body: JSON.stringify({ type, token, role, key: role === "desktop" ? desktopKey : token, ...payload }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "Pairing service unavailable.");
      return result as { type?: string; joinOrigin?: string; events?: Array<{ type?: string; device?: string; data?: Record<string, unknown>; reason?: string }> };
    };
    const apiControl = (type: string, payload: Record<string, unknown> = {}) => {
      void post(type, payload).catch((error: unknown) => {
        if (!disposed && !(error instanceof DOMException && error.name === "AbortError")) setStage("error");
      });
    };
    sendControlRef.current = apiControl;
    const poll = async () => {
      try {
        const registered = await post(role === "desktop" ? "create" : "join", role === "phone" ? { device: "Phone browser" } : {});
        if (registered.type) await onMessage(registered as { type: string });
        while (!disposed) {
          const result = await post("poll");
          for (const message of result.events ?? []) await onMessage(message);
          await new Promise((resolve) => window.setTimeout(resolve, 500));
        }
      } catch (error) {
        if (!disposed) {
          if (error instanceof Error && /expired|already been used/i.test(error.message)) setStage("expired");
          else if (error instanceof Error && /closed/i.test(error.message)) setStage((current) => current === "rejected" || current === "expired" ? current : "error");
          else setStage("error");
        }
      }
    };
    void poll();
    return () => {
      disposed = true;
      controller.abort();
      sendControlRef.current = () => undefined;
      peerRef.current?.close();
      peerRef.current = null;
      setActiveChannel(null);
    };
  }, [token, desktopKey, role, beginOffer, handleSignal]);

  useEffect(() => {
    if (role !== "desktop" || stage !== "ready" || !token) { setQr(null); return; }
    const url = new URL("/join", joinOrigin ?? window.location.origin);
    url.searchParams.set("token", token);
    void QRCode.toDataURL(url.toString(), { width: 240, margin: 1, color: { dark: "#171622", light: "#ffffff" }, errorCorrectionLevel: "M" }).then(setQr).catch(() => setStage("error"));
  }, [role, stage, token, joinOrigin]);

  useEffect(() => {
    if (role !== "desktop" || stage !== "ready") return;
    setSecondsLeft(120);
    const timer = window.setInterval(() => setSecondsLeft((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [role, stage, token]);

  useEffect(() => {
    if (role === "desktop" && stage === "ready" && secondsLeft === 0) {
      socketRef.current?.send(JSON.stringify({ type: "disconnect" }));
      setStage("expired");
    }
  }, [role, stage, secondsLeft]);

  const approve = () => {
    socketRef.current?.send(JSON.stringify({ type: "approve" }));
    setStage("approved");
  };
  const reject = () => socketRef.current?.send(JSON.stringify({ type: "reject" }));
  const restart = () => {
    socketRef.current?.close();
    peerRef.current?.close();
    peerRef.current = null;
    setActiveChannel(null);
    setQr(null);
    setJoinOrigin(null);
    setStage("starting");
    setToken(createToken());
  };
  const disconnect = () => restart();
  const joinUrl = token ? `${joinOrigin ?? (typeof window === "undefined" ? "" : window.location.origin)}/join?token=${token}` : "";
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(joinUrl); setCopied(true); window.setTimeout(() => setCopied(false), 1600); } catch { /* Clipboard access may be unavailable in an insecure context. */ }
  };

  return (
    <main className="pair-page">
      <header className="pair-header"><a className="brand" href="/"><span className="brand-mark"><AudioLines size={18} /></span><span>pocket<span className="brand-light">deck</span></span></a><span className="secure-label"><LockKeyhole size={13} /> PRIVATE SESSION</span></header>
      <div className={`pair-card ${role === "phone" ? "phone-pair-card" : ""}`}>
        <a className="back-link" href="/"><ArrowLeft size={14} /> Back to PocketDeck</a>
        <div className="pair-intro"><span className="pair-overline">{role === "desktop" ? "COMPUTER SETUP" : "PHONE SETUP"}</span><h1>{role === "desktop" ? <>Pair your <span>phone.</span></> : <>Connect to your <span>computer.</span></>}</h1><p>{role === "desktop" ? "Scan this code with your phone camera. You’ll approve the connection here before anything is shared." : "Request a secure connection to the computer that created this QR code."}</p></div>
        <div className="pair-content">
          {role === "desktop" && <div className="qr-column"><div className={`qr-stage ${stage === "request" ? "qr-pending" : ""}`}>{qr && stage === "ready" ? <img src={qr} alt="QR code to pair a phone with PocketDeck" /> : <div className="qr-placeholder">{stage === "request" ? <Smartphone size={46} /> : stage === "starting" ? <LoaderCircle className="spin" size={36} /> : <Clock3 size={38} />}</div>}</div><div className="qr-caption"><span className={`live-dot ${stage === "ready" ? "is-live" : ""}`} />{stage === "ready" ? "READY TO SCAN" : stage === "request" ? "PHONE REQUEST RECEIVED" : stage === "connected" ? "CONNECTED" : stage === "expired" ? "SESSION EXPIRED" : "SESSION STATUS"}</div>{stage === "ready" && <><span className="qr-host">Phone connects to <strong>{new URL(joinUrl).host}</strong></span><button className="copy-link" onClick={copyLink}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? "Link copied" : "Copy pairing link"}</button></>}</div>}
          <div className="pair-details"><div className="connection-state"><span className={`state-icon state-${stage}`}>{stage === "connected" ? <Check size={18} /> : stage === "request" ? <Smartphone size={18} /> : stage === "error" || stage === "expired" || stage === "rejected" ? <Unplug size={18} /> : <Monitor size={18} />}</span><div><span className="state-title">{stage === "request" ? "Approve this device" : stage === "connected" ? "Connection established" : stage === "waiting" ? "Waiting for approval" : stage === "expired" ? "Code expired" : stage === "rejected" ? "Request declined" : stage === "error" ? "Connection unavailable" : "Secure pairing"}</span><span className="state-copy">{stage === "request" ? `${device} wants to join your deck.` : descriptions[stage]}</span></div></div>
            {role === "desktop" && stage === "ready" && <div className="expiry-row"><Clock3 size={14} /> Code refreshes in <strong>{Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}</strong></div>}
            {role === "desktop" && stage === "request" && <div className="approval-actions"><button className="approve-button" onClick={approve}><Check size={16} /> Approve phone</button><button className="reject-button" onClick={reject}><X size={16} /> Decline</button></div>}
            {(stage === "expired" || stage === "rejected" || stage === "error") && role === "desktop" && <button className="retry-button" onClick={restart}><RefreshCw size={15} /> Create a new pairing code</button>}
            {role === "desktop" && stage === "connected" && <button className="retry-button disconnect-button" onClick={disconnect}><Unplug size={15} /> Disconnect and reset</button>}
            {role === "phone" && stage === "error" && <button className="retry-button" onClick={() => window.location.reload()}><RefreshCw size={15} /> Try again</button>}
            <div className="privacy-note"><LockKeyhole size={14} /><span>Pairing codes expire after 2 minutes. The computer must approve every phone. Browser-to-browser traffic is encrypted.</span></div>
          </div>
        </div>
        {stage === "connected" && activeChannel && <BrowserDeck role={role} channel={activeChannel} />}
        <div className="pair-foot"><span><CircleHelp size={13} /> Keep this page open while pairing.</span><span>NO APP REQUIRED</span></div>
      </div>
      <p className="pair-disclaimer"><Smartphone size={13} /> Works with modern browsers on Windows, macOS, Android, and iOS.</p>
    </main>
  );
}
