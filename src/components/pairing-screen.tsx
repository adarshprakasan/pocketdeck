"use client";

import QRCode from "qrcode";
import { ArrowLeft, AudioLines, Check, CircleHelp, Clock3, Copy, LoaderCircle, LockKeyhole, Monitor, RefreshCw, Smartphone, Unplug, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

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

export function PairingScreen({ role, initialToken }: { role: Role; initialToken?: string }) {
  const [token, setToken] = useState<string | null>(initialToken ?? null);
  const [stage, setStage] = useState<Stage>("starting");
  const [qr, setQr] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(120);
  const [device, setDevice] = useState("Phone browser");
  const [copied, setCopied] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);
  const pendingCandidates = useRef<RTCIceCandidateInit[]>([]);

  const signal = useCallback((data: Record<string, unknown>) => {
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "signal", data }));
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
      channel.onopen = () => setStage("connected");
      channel.onclose = () => { if (peer.connectionState !== "closed") setStage("error"); };
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
    if (role === "desktop" && !token) setToken(createToken());
  }, [role, token]);

  useEffect(() => {
    if (!token) return;
    let disposed = false;
    const socket = new WebSocket(signalingUrl());
    socketRef.current = socket;
    socket.onopen = () => {
      if (role === "desktop") socket.send(JSON.stringify({ type: "create", token }));
      else socket.send(JSON.stringify({ type: "join", token, device: "Phone browser" }));
    };
    socket.onmessage = (event) => {
      let message: { type?: string; expiresAt?: number; device?: string; data?: Record<string, unknown> };
      try { message = JSON.parse(event.data as string); } catch { setStage("error"); return; }
      if (message.type === "created") setStage("ready");
      if (message.type === "waiting-approval") setStage("waiting");
      if (message.type === "phone-request") { setDevice(message.device ?? "Phone browser"); setStage("request"); }
      if (message.type === "approved") {
        setStage("approved");
        if (role === "desktop") void beginOffer().catch(() => setStage("error"));
      }
      if (message.type === "signal" && message.data) void handleSignal(message.data);
      if (message.type === "closed") setStage(message.reason === "expired" ? "expired" : message.reason === "rejected" ? "rejected" : "error");
    };
    socket.onerror = () => { if (!disposed) setStage("error"); };
    socket.onclose = (event) => {
      if (!disposed && event.code === 1008) setStage("expired");
    };
    return () => {
      disposed = true;
      socket.close();
      if (socketRef.current === socket) socketRef.current = null;
      peerRef.current?.close();
      peerRef.current = null;
    };
  }, [token, role, beginOffer, handleSignal]);

  useEffect(() => {
    if (role !== "desktop" || stage !== "ready" || !token) { setQr(null); return; }
    const url = new URL("/join", window.location.origin);
    url.searchParams.set("token", token);
    void QRCode.toDataURL(url.toString(), { width: 240, margin: 1, color: { dark: "#171622", light: "#ffffff" }, errorCorrectionLevel: "M" }).then(setQr).catch(() => setStage("error"));
  }, [role, stage, token]);

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
    setQr(null);
    setStage("starting");
    setToken(createToken());
  };
  const disconnect = () => restart();
  const joinUrl = token ? `${typeof window === "undefined" ? "" : window.location.origin}/join?token=${token}` : "";
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
          {role === "desktop" && <div className="qr-column"><div className={`qr-stage ${stage === "request" ? "qr-pending" : ""}`}>{qr && stage === "ready" ? <img src={qr} alt="QR code to pair a phone with PocketDeck" /> : <div className="qr-placeholder">{stage === "request" ? <Smartphone size={46} /> : stage === "starting" ? <LoaderCircle className="spin" size={36} /> : <Clock3 size={38} />}</div>}</div><div className="qr-caption"><span className={`live-dot ${stage === "ready" ? "is-live" : ""}`} />{stage === "ready" ? "READY TO SCAN" : stage === "request" ? "PHONE REQUEST RECEIVED" : stage === "connected" ? "CONNECTED" : stage === "expired" ? "SESSION EXPIRED" : "SESSION STATUS"}</div>{stage === "ready" && <button className="copy-link" onClick={copyLink}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? "Link copied" : "Copy pairing link"}</button>}</div>}
          <div className="pair-details"><div className="connection-state"><span className={`state-icon state-${stage}`}>{stage === "connected" ? <Check size={18} /> : stage === "request" ? <Smartphone size={18} /> : stage === "error" || stage === "expired" || stage === "rejected" ? <Unplug size={18} /> : <Monitor size={18} />}</span><div><span className="state-title">{stage === "request" ? "Approve this device" : stage === "connected" ? "Connection established" : stage === "waiting" ? "Waiting for approval" : stage === "expired" ? "Code expired" : stage === "rejected" ? "Request declined" : stage === "error" ? "Connection unavailable" : "Secure pairing"}</span><span className="state-copy">{stage === "request" ? `${device} wants to join your deck.` : descriptions[stage]}</span></div></div>
            {role === "desktop" && stage === "ready" && <div className="expiry-row"><Clock3 size={14} /> Code refreshes in <strong>{Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}</strong></div>}
            {role === "desktop" && stage === "request" && <div className="approval-actions"><button className="approve-button" onClick={approve}><Check size={16} /> Approve phone</button><button className="reject-button" onClick={reject}><X size={16} /> Decline</button></div>}
            {(stage === "expired" || stage === "rejected" || stage === "error") && role === "desktop" && <button className="retry-button" onClick={restart}><RefreshCw size={15} /> Create a new pairing code</button>}
            {role === "desktop" && stage === "connected" && <button className="retry-button disconnect-button" onClick={disconnect}><Unplug size={15} /> Disconnect and reset</button>}
            {role === "phone" && stage === "error" && <button className="retry-button" onClick={() => window.location.reload()}><RefreshCw size={15} /> Try again</button>}
            <div className="privacy-note"><LockKeyhole size={14} /><span>Pairing codes expire after 2 minutes. The computer must approve every phone. Browser-to-browser traffic is encrypted.</span></div>
          </div>
        </div>
        <div className="pair-foot"><span><CircleHelp size={13} /> Keep this page open while pairing.</span><span>NO APP REQUIRED</span></div>
      </div>
      <p className="pair-disclaimer"><Smartphone size={13} /> Works with modern browsers on Windows, macOS, Android, and iOS.</p>
    </main>
  );
}
