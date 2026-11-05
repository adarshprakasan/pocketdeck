"use client";

import { ArrowLeft, AudioLines, Check, CircleHelp, Clock3, Copy, LoaderCircle, LockKeyhole, Monitor, RefreshCw, Smartphone, Unplug, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { BrowserDeck } from "@/components/browser-deck";
import { usePairing } from "@/hooks/use-pairing";
import type { Role } from "@/lib/pairing/transport";
import type { Stage } from "@/lib/pairing/state";

const descriptions: Record<Stage, string> = {
  starting: "Preparing a secure, short-lived session…",
  ready: "Scan this code with your phone camera to request access.",
  waiting: "Your request is on its way. Check that the code below matches your computer, then wait for approval.",
  request: "A phone is asking to connect. Approve only if you started this request and the code matches your phone.",
  approved: "Approved. Establishing an encrypted browser connection…",
  connecting: "Connecting the two browsers…",
  connected: "Your browsers are connected securely.",
  expired: "This pairing code expired. Create a new one to try again.",
  rejected: "The pairing request was declined.",
  error: "Could not connect to the pairing service. Check that it is running and try again.",
};

const titles: Partial<Record<Stage, string>> = {
  request: "Approve this device",
  connected: "Connection established",
  waiting: "Waiting for approval",
  expired: "Code expired",
  rejected: "Request declined",
  error: "Connection unavailable",
};

const captions: Partial<Record<Stage, string>> = {
  ready: "READY TO SCAN",
  request: "PHONE REQUEST RECEIVED",
  connected: "CONNECTED",
  expired: "SESSION EXPIRED",
};

function hostOf(url: string) {
  try { return new URL(url).host; } catch { return ""; }
}

function StatusIcon({ stage }: { stage: Stage }) {
  if (stage === "connected") return <Check size={18} />;
  if (stage === "request") return <Smartphone size={18} />;
  if (stage === "error" || stage === "expired" || stage === "rejected") return <Unplug size={18} />;
  return <Monitor size={18} />;
}

function QrPlaceholder({ stage }: { stage: Stage }) {
  if (stage === "request") return <Smartphone size={46} />;
  if (stage === "starting") return <LoaderCircle className="spin" size={36} />;
  return <Clock3 size={38} />;
}

type Pairing = ReturnType<typeof usePairing>;

function QrPanel({ pairing }: { pairing: Pairing }) {
  const { state, qr, joinUrl, copied, copyLink, selectOrigin } = pairing;
  const ready = state.stage === "ready";
  return (
    <div className="qr-column">
      <div className={`qr-stage ${state.stage === "request" ? "qr-pending" : ""}`}>
        {qr && ready
          ? <Image src={qr} alt="QR code to pair a phone with PocketDeck" width={240} height={240} unoptimized />
          : <div className="qr-placeholder"><QrPlaceholder stage={state.stage} /></div>}
      </div>
      <div className="qr-caption">
        <span className={`live-dot ${ready ? "is-live" : ""}`} />
        {captions[state.stage] ?? "SESSION STATUS"}
      </div>
      {ready && (
        <>
          {state.origins.length > 1 ? (
            <label className="origin-picker">
              <span>Wrong address? Choose the network your phone is on</span>
              <select value={state.origin ?? ""} onChange={(event) => selectOrigin(event.target.value)}>
                {state.origins.map((origin) => <option key={origin} value={origin}>{hostOf(origin)}</option>)}
              </select>
            </label>
          ) : (
            <span className="qr-host">Phone connects to <strong>{hostOf(joinUrl)}</strong></span>
          )}
          <button className="copy-link" onClick={copyLink}>
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? "Link copied" : "Copy pairing link"}
          </button>
        </>
      )}
    </div>
  );
}

function StatusPanel({ role, pairing }: { role: Role; pairing: Pairing }) {
  const { state, secondsLeft, approve, reject, restart } = pairing;
  const { stage } = state;
  const showCode = Boolean(state.code) && (stage === "request" || (role === "phone" && stage === "waiting"));
  const retryable = stage === "expired" || stage === "rejected" || stage === "error";
  return (
    <div className="pair-details">
      <div className="connection-state">
        <span className={`state-icon state-${stage}`}><StatusIcon stage={stage} /></span>
        <div>
          <span className="state-title">{titles[stage] ?? "Secure pairing"}</span>
          <span className="state-copy">{stage === "request" ? `${state.device} wants to join your deck.` : state.hint ?? descriptions[stage]}</span>
        </div>
      </div>
      {showCode && (
        <div className="pair-code" role="status">
          <span>VERIFICATION CODE</span>
          <strong aria-label={`Verification code ${state.code?.split("").join(" ")}`}>{state.code}</strong>
        </div>
      )}
      {role === "desktop" && stage === "ready" && (
        <div className="expiry-row"><Clock3 size={14} /> Code refreshes in <strong>{Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}</strong></div>
      )}
      {role === "desktop" && stage === "request" && (
        <div className="approval-actions">
          <button className="approve-button" onClick={approve}><Check size={16} /> Approve phone</button>
          <button className="reject-button" onClick={reject}><X size={16} /> Decline</button>
        </div>
      )}
      {retryable && role === "desktop" && <button className="retry-button" onClick={restart}><RefreshCw size={15} /> Create a new pairing code</button>}
      {role === "desktop" && stage === "connected" && <button className="retry-button disconnect-button" onClick={restart}><Unplug size={15} /> Disconnect and reset</button>}
      {role === "phone" && stage === "error" && !state.hint && <button className="retry-button" onClick={restart}><RefreshCw size={15} /> Try again</button>}
      <div className="privacy-note">
        <LockKeyhole size={14} />
        <span>Pairing codes expire after 2 minutes. The computer must approve every phone. Browser-to-browser traffic is encrypted.</span>
      </div>
    </div>
  );
}

export function PairingScreen({ role, initialToken }: { role: Role; initialToken?: string }) {
  const pairing = usePairing(role, initialToken);
  const { state, activeChannel } = pairing;
  const computer = role === "desktop";

  return (
    <main className="pair-page">
      <header className="pair-header">
        <Link className="brand" href="/"><span className="brand-mark"><AudioLines size={18} /></span><span>pocket<span className="brand-light">deck</span></span></Link>
        <span className="secure-label"><LockKeyhole size={13} /> PRIVATE SESSION</span>
      </header>
      <div className={`pair-card ${computer ? "" : "phone-pair-card"}`}>
        <Link className="back-link" href="/"><ArrowLeft size={14} /> Back to PocketDeck</Link>
        <div className="pair-intro">
          <span className="pair-overline">{computer ? "COMPUTER SETUP" : "PHONE SETUP"}</span>
          <h1>{computer ? <>Pair your <span>phone.</span></> : <>Connect to your <span>computer.</span></>}</h1>
          <p>{computer ? "Scan this code with your phone camera. You’ll approve the connection here before anything is shared." : "Request a secure connection to the computer that created this QR code."}</p>
        </div>
        <div className="pair-content">
          {computer && <QrPanel pairing={pairing} />}
          <StatusPanel role={role} pairing={pairing} />
        </div>
        {state.stage === "connected" && activeChannel && <BrowserDeck role={role} channel={activeChannel} />}
        <div className="pair-foot"><span><CircleHelp size={13} /> Keep this page open while pairing.</span><span>NO APP REQUIRED</span></div>
      </div>
      <p className="pair-disclaimer"><Smartphone size={13} /> Works with modern browsers on Windows, macOS, Android, and iOS.</p>
    </main>
  );
}
