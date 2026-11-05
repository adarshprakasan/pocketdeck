import { PairingScreen } from "@/components/pairing-screen";

type JoinPageProps = {
  searchParams: Promise<{ token?: string | string[] }>;
};

// Rendering this page must not change pairing state: link previews and prefetchers also request it.
// The phone joins from the browser (see usePairing), never from this server component.
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

  return <PairingScreen role="phone" initialToken={token} />;
}
