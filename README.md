# PocketDeck

PocketDeck is a browser-only phone control deck that runs on your own computer. The computer runs a local web server; the phone connects in its existing browser over the same Wi-Fi. No public hosting, phone app, or desktop-control features are required.

## Download for Windows or macOS

The release workflow creates separate self-contained ZIP files for Windows x64, macOS Intel, and Apple Silicon Macs. Each ZIP includes its matching Node.js runtime, so users do not need to install Node.js separately. Download links will appear on the [PocketDeck GitHub Releases page](https://github.com/adarshprakasan/pocketdeck/releases) after the first release is published.

1. Download the ZIP for your computer and extract it.
2. Windows: double-click `Start-PocketDeck.bat`. Mac: double-click `start-pocketdeck.command`.
3. Keep the launcher window open and visit [http://localhost:3000](http://localhost:3000) on the computer.
4. Scan the QR code with the phone camera and approve the request on the computer. Keep both devices on the same Wi-Fi. If the computer asks about its firewall, allow PocketDeck on private networks only.

The app stops when you press **Ctrl+C** in the launcher window. The phone deck is saved in that browser for the current site address. If a network closes the pairing, create and scan a fresh QR code.

## Optional TURN relay

PocketDeck uses STUN by default. If the network blocks direct browser traffic, copy `pocketdeck.env.example` to `pocketdeck.env`, add your own coturn or Cloudflare Realtime TURN credentials, and restart the app. The launcher reads that file at runtime. Keep `pocketdeck.env` private; it contains credentials for your TURN service.

## Build a package from source

Requires Node.js 20.9 or newer. The commands below build a package for the computer and architecture running them:

```bash
npm ci
npm run build:portable
npm run package:portable
```

The build places the app in `.next/standalone`; the package command creates a ZIP in `dist/`. Cross-platform release ZIPs are built by `.github/workflows/portable-downloads.yml` on GitHub Actions. Pushing a tag named `pocketdeck-v...` triggers a GitHub Release with all three ZIPs; running the workflow manually builds downloadable workflow artifacts without publishing a release.

## Run the developer version

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) on the computer and choose **Get started**. For LAN testing, keep both devices on the same Wi-Fi. When the computer has multiple network adapters, set `POCKETDECK_LAN_ADDRESS` to its Wi-Fi/LAN IPv4 address. Allow port 3000 through the computer firewall on private networks.

## Current features

- Responsive landing page and premium dark visual system
- 4 × 3 phone deck with editable buttons and browser-local persistence
- Time-limited QR pairing with computer-side approval
- Browser-to-browser WebRTC data channel
- URL, text, timer, embedded-media, and PocketDeck web actions
- Phone-side delivery acknowledgements and computer-side notices
- Brief connection recovery and fresh-QR guidance

Open URL actions ask for a click or use a user-enabled action window. Text is copied only after a click on the computer. Media actions can control audio or video embedded in PocketDeck; they cannot control other tabs. PocketDeck does not launch desktop apps or control operating-system features.
