import { PairingScreen } from "@/components/pairing-screen";
import { registerPhoneJoin } from "@/lib/signaling-store";

type JoinPageProps = {
  searchParams: Promise<{ token?: string | string[] }>;
};

export default async function JoinPage({ searchParams }: JoinPageProps) {
  const params = await searchParams;
  const token = params.token;

  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{32,80}$/.test(token)) {
    return (
      <main className="pair-page">
        <div className="pair-loading">
          This pairing link is missing or invalid. Scan the current QR code again from the computer.
          <a className="retry-button" href="/connect">Return to computer pairing</a>
        </div>
      </main>
    );
  }

  const externalSignaling = Boolean(process.env.NEXT_PUBLIC_SIGNALING_URL);
  const registered = externalSignaling ? false : registerPhoneJoin(token);
  return <PairingScreen role="phone" initialToken={token} initialStage={registered ? "waiting" : "starting"} />;
}
