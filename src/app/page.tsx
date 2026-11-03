import {
  ArrowDownRight,
  ArrowUpRight,
  AudioLines,
  Globe2,
  Link2,
  MousePointer2,
  Play,
  ScanLine,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Wifi,
} from "lucide-react";

const deckButtons = [
  { icon: "▶", label: "Play / pause", tone: "violet" },
  { icon: "◖", label: "Next track", tone: "blue" },
  { icon: "⌘", label: "Focus mode", tone: "amber" },
  { icon: "↗", label: "Open studio", tone: "green" },
  { icon: "♫", label: "Now playing", tone: "pink" },
  { icon: "Aa", label: "Paste intro", tone: "slate" },
  { icon: "◷", label: "Start timer", tone: "orange" },
  { icon: "⌕", label: "Research", tone: "cyan" },
  { icon: "✦", label: "Quick action", tone: "violet" },
  { icon: "↻", label: "Refresh view", tone: "blue" },
  { icon: "▣", label: "Dashboard", tone: "green" },
  { icon: "+", label: "Add button", tone: "empty" },
];

const features = [
  { icon: ScanLine, title: "Pair in a scan", text: "Connect your phone and computer browser with a quick QR scan." },
  { icon: MousePointer2, title: "Make it yours", text: "Arrange a 4 × 3 deck with the actions you reach for most." },
  { icon: ShieldCheck, title: "Browser only", text: "No installs, accounts, or desktop agent. Just two browsers." },
];

export default function Home() {
  return (
    <main>
      <header className="topbar shell">
        <a className="brand" href="#top" aria-label="PocketDeck home">
          <span className="brand-mark"><AudioLines size={19} strokeWidth={2.5} /></span>
          <span>pocket<span className="brand-light">deck</span></span>
        </a>
        <nav className="nav-links" aria-label="Main navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#features">Features</a>
        </nav>
        <a className="nav-cta" href="/connect">Get started <ArrowUpRight size={15} /></a>
      </header>

      <section className="hero shell" id="top">
        <div className="hero-copy">
          <div className="eyebrow"><span className="status-dot" /> YOUR PHONE, REIMAGINED</div>
          <h1>Your phone.<br />Your <span>command center.</span></h1>
          <p className="hero-subtitle">A personal control deck for your computer. Pair in a scan, then put your favorite browser actions right at your fingertips.</p>
          <div className="hero-actions">
            <a className="button-primary" href="/connect">Build your deck <ArrowUpRight size={17} /></a>
            <a className="button-quiet" href="#features"><Play size={14} fill="currentColor" /> See how it works</a>
          </div>
          <div className="hero-proof"><span className="proof-icons"><Smartphone size={15} /><Link2 size={14} /><Globe2 size={15} /></span><span>No app. No account. Just your browser.</span></div>
        </div>

        <div className="visual-wrap" aria-label="Preview of a PocketDeck control surface">
          <div className="visual-glow" />
          <div className="orbit orbit-one" /><div className="orbit orbit-two" />
          <div className="phone-frame">
            <div className="phone-island" />
            <div className="phone-screen">
              <div className="phone-head"><div><span className="phone-kicker">GOOD AFTERNOON</span><strong>Your deck</strong></div><span className="online-pill"><i /> Online</span></div>
              <div className="deck-grid">
                {deckButtons.map((button, index) => (
                  <div className={`deck-button tone-${button.tone}`} key={button.label}>
                    <span className="deck-icon">{button.icon}</span><span className="deck-label">{button.label}</span>
                    {index === 0 && <span className="active-ring" />}
                  </div>
                ))}
              </div>
              <div className="phone-foot"><span className="page-indicator"><i /> <i /> <i /></span><span className="edit-pill">EDIT DECK <Sparkles size={11} /></span></div>
            </div>
          </div>
          <div className="float-card connection-card"><span className="float-icon purple"><Wifi size={16} /></span><span><b>Connected</b><small>MacBook Pro · This browser</small></span><span className="mini-check">✓</span></div>
          <div className="float-card action-card"><span className="float-icon blue"><Globe2 size={16} /></span><span><b>One tap away</b><small>Your favorite actions</small></span></div>
          <div className="float-chip"><span className="chip-sparkle">✦</span> Made for your flow</div>
          <div className="decor-arrow"><ArrowDownRight size={21} /></div>
        </div>
        <div className="hero-bottom"><span>THE SHORTCUT TO YOUR FLOW</span><span className="bottom-line" /><span>01 / 03</span></div>
      </section>

      <section className="feature-section shell" id="features">
        <div className="section-heading"><div><span className="section-kicker">A BETTER WAY TO WORK</span><h2>Everything in reach.<br /><span>Nothing in the way.</span></h2></div><p>Turn the browser actions you use every day into a tactile, personal control surface.</p></div>
        <div className="feature-grid">
          {features.map(({ icon: Icon, title, text }, index) => <article className="feature-card" key={title}><div className="feature-top"><span className="feature-icon"><Icon size={19} /></span><span>0{index + 1}</span></div><h3>{title}</h3><p>{text}</p></article>)}
        </div>
      </section>

      <section className="how-section shell" id="how-it-works">
        <div className="how-panel"><div><span className="section-kicker">UP AND RUNNING IN SECONDS</span><h2>Two screens.<br /><span>One seamless setup.</span></h2><p>Open PocketDeck on your computer. Scan the QR code with your phone. Your deck is ready.</p><a className="button-primary" href="#top">Explore PocketDeck <ArrowUpRight size={16} /></a></div><div className="setup-steps"><div className="setup-step"><span className="step-icon"><Globe2 size={18} /></span><div><b>Open on your computer</b><small>Start a session in your browser</small></div><span className="step-number">01</span></div><div className="step-connector" /><div className="setup-step"><span className="step-icon"><ScanLine size={18} /></span><div><b>Scan with your phone</b><small>Pair securely with a QR code</small></div><span className="step-number">02</span></div><div className="step-connector" /><div className="setup-step"><span className="step-icon"><Sparkles size={18} /></span><div><b>Make it yours</b><small>Tap, customize, and get in flow</small></div><span className="step-number">03</span></div></div></div>
      </section>

      <footer className="footer shell"><a className="brand" href="#top"><span className="brand-mark"><AudioLines size={17} strokeWidth={2.5} /></span><span>pocket<span className="brand-light">deck</span></span></a><span>Your phone. Your shortcuts. Your command center.</span><span>© 2026 PocketDeck</span></footer>
    </main>
  );
}
