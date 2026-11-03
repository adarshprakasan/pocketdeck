"use client";

import { useEffect, useState } from "react";
import { PairingScreen } from "@/components/pairing-screen";

export default function JoinPage() {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get("token"));
  }, []);

  if (token === null) return <main className="pair-page"><div className="pair-loading">Opening your secure pairing link…</div></main>;
  if (!/^[A-Za-z0-9_-]{32,80}$/.test(token)) return <main className="pair-page"><div className="pair-loading">This pairing link is invalid. Ask the computer to create a new one.</div></main>;
  return <PairingScreen role="phone" initialToken={token} />;
}
