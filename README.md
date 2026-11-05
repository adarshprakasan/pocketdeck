# PocketDeck

**Turn your phone into a customizable control deck for your computer.** PocketDeck runs on your Windows PC or Mac and pairs with your phone in its existing browser over the same Wi-Fi. No cloud hosting, mobile app, or desktop companion is needed.

[![Download for Windows](https://img.shields.io/badge/Download-Windows%20x64-5865F2?logo=windows)](https://github.com/adarshprakasan/pocketdeck/releases/latest/download/pocketdeck-windows-x64.zip)
[![Download for Mac Intel](https://img.shields.io/badge/Download-Mac%20Intel-111111?logo=apple)](https://github.com/adarshprakasan/pocketdeck/releases/latest/download/pocketdeck-macos-intel.zip)
[![Download for Apple Silicon](https://img.shields.io/badge/Download-Apple%20Silicon-111111?logo=apple)](https://github.com/adarshprakasan/pocketdeck/releases/latest/download/pocketdeck-macos-apple-silicon.zip)
[![Latest release](https://img.shields.io/github/v/release/adarshprakasan/pocketdeck?include_prereleases&label=release)](https://github.com/adarshprakasan/pocketdeck/releases)
[![Build and validate](https://github.com/adarshprakasan/pocketdeck/actions/workflows/validate.yml/badge.svg)](https://github.com/adarshprakasan/pocketdeck/actions/workflows/validate.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-purple.svg)](LICENSE)

## Get started

1. [Download the ZIP for your computer](https://github.com/adarshprakasan/pocketdeck/releases/latest) and extract it.
2. On Windows, double-click `Start-PocketDeck.bat`. On Mac, double-click `start-pocketdeck.command`.
3. Keep the launcher window open. On your computer, open [http://localhost:3000](http://localhost:3000).
4. Choose **Get started**, scan the QR code with your phone camera, and approve the pairing on the computer.

Both devices need to be on the same Wi-Fi. If your computer asks about its firewall, allow PocketDeck on private networks. To stop PocketDeck, press **Ctrl+C** in the launcher window. Your custom deck is stored in the phone browser for that local site address.

### Downloads

| Computer | Download |
| --- | --- |
| Windows 10/11, x64 | [PocketDeck for Windows](https://github.com/adarshprakasan/pocketdeck/releases/latest/download/pocketdeck-windows-x64.zip) |
| Mac with Intel processor | [PocketDeck for Mac Intel](https://github.com/adarshprakasan/pocketdeck/releases/latest/download/pocketdeck-macos-intel.zip) |
| Mac with Apple Silicon (M1/M2/M3/M4) | [PocketDeck for Apple Silicon](https://github.com/adarshprakasan/pocketdeck/releases/latest/download/pocketdeck-macos-apple-silicon.zip) |

Each ZIP includes its matching Node.js runtime. You do not need to install Node.js separately.

**Verify your download.** Every release includes a `SHA256SUMS` file and a signed build-provenance attestation. For example, on a Mac: `shasum -a 256 -c SHA256SUMS --ignore-missing`, or on Windows PowerShell: `Get-FileHash pocketdeck-windows-x64.zip`. With the GitHub CLI, `gh attestation verify <zip> --repo adarshprakasan/pocketdeck` confirms the file was built by this repository's workflow.

## What PocketDeck can do

- Pair a computer and phone browser using a short-lived QR code, a matching four-digit verification code, and computer-side approval.
- Show a customizable 4 × 3 deck of buttons on the phone, saved in that browser, with a backup copy on your computer and Export/Import to move it anywhere.
- Send text, open a URL after a click on the computer, show notices, and start timers.
- Control media embedded in the PocketDeck page.
- Connect browsers using WebRTC data channels, with a TURN relay available for networks that block direct connections.

PocketDeck cannot control other browser tabs, launch desktop apps, or run operating-system shortcuts. When the network blocks direct browser traffic, configure your own TURN service; the relay is optional and not included.

## Network and privacy

The computer runs the web server locally. Pairing uses an expiring code and requires approval on the computer. Browser-to-browser actions travel through an encrypted WebRTC data channel when a direct connection is available. Both devices should be on the same trusted Wi-Fi; guest networks and some VPNs or firewalls prevent devices from reaching one another.

The phone deck is saved in local browser storage on the phone. Browser storage is tied to the site address (for example `http://192.168.1.20:3000`), which changes when your computer gets a new IP. To keep a new address from starting empty, the phone sends a copy of the deck to your computer over the encrypted connection, and the computer's PocketDeck browser keeps it in its own local storage. A phone that has never saved a deck at its current address restores that copy automatically when it pairs. You can also **Export** the deck to a JSON file and **Import** it later. Nothing is sent to an account or a public server, and PocketDeck does not require an account, phone app, or public server.

**Third-party contact.** To help the two browsers find each other, PocketDeck uses a public STUN server (Google's by default), which sees your public IP address. For a fully LAN-only setup, set `POCKETDECK_STUN_URLS=none` in `pocketdeck.env`, or set it to your own `stun:` servers. Same-Wi-Fi pairing usually works without STUN.

**Pairing safety.** Each pairing shows the same four-digit code on the phone and on the computer. Approve only when the code on your phone matches. A phone proves its identity with a key that never leaves its browser tab, so a copied link alone cannot take over a session.

### Optional TURN relay

If your network blocks direct browser connections, configure a coturn REST service or Cloudflare Realtime TURN key:

1. Copy `pocketdeck.env.example` to `pocketdeck.env` in the extracted PocketDeck folder. The same file can also set `PORT`, `POCKETDECK_STUN_URLS`, and `POCKETDECK_LAN_ADDRESS`.
2. Add the TURN credentials from your provider.
3. Restart PocketDeck.

Keep `pocketdeck.env` private. It contains credentials for your relay service.

## Troubleshooting

- **The phone cannot open the QR link:** confirm the phone and computer are on the same Wi-Fi. Do not use `0.0.0.0` as the phone address; scan the QR shown by PocketDeck.
- **The browsers cannot connect:** turn off VPN temporarily, leave guest Wi-Fi, allow PocketDeck through the firewall on private networks, and scan a fresh QR code. Some routers isolate wireless clients.
- **The pairing disconnected:** start a new pairing from the computer and scan its fresh QR code.
- **Mac says the app cannot be opened:** PocketDeck is a local script launcher, not a signed Mac app, and macOS quarantines downloaded files. Right-click `start-pocketdeck.command` and choose **Open**, or in Terminal run `xattr -dr com.apple.quarantine PocketDeck` on the extracted folder (and `chmod +x start-pocketdeck.command` if needed). Only run software you trust, and check the download first (see below).
- **The QR code points to the wrong address:** the computer has several networks. When more than one is found, the pairing screen shows a picker under the QR code; or set `POCKETDECK_LAN_ADDRESS` in `pocketdeck.env`.
- **The port is already in use:** close the other local service using port 3000, or set `PORT=3001` (or another free port) in `pocketdeck.env` and restart PocketDeck.

## Build from source

Requires Node.js 20.9 or newer.

```bash
npm ci
npm run dev
```

Useful checks before a pull request: `npm run lint`, `npm run typecheck`, and `npm test`.

Open [http://localhost:3000](http://localhost:3000) on the computer and choose **Get started**. For LAN testing, keep both devices on the same Wi-Fi and allow port 3000 through the computer firewall on private networks. If the computer has multiple network adapters, set `POCKETDECK_LAN_ADDRESS` to its Wi-Fi/LAN IPv4 address.

To build a standalone package for the computer and architecture you are using:

```bash
npm run build:portable
npm run package:portable
```

The ZIP is created in `dist/`. GitHub Actions builds Windows x64, Mac Intel, and Apple Silicon packages. A tag named `pocketdeck-v...` publishes all three ZIPs as a GitHub Release after the builds pass.

### Optional hosted signaling service

The portable build pairs devices through its own `/api/signaling` route and needs nothing else. If you host PocketDeck's web app elsewhere, you can run the separate WebSocket signaling service in `server/signaling.mjs` instead. Start it with `npm run signaling`, set `ALLOWED_ORIGIN` to your site's origin in production, and build the web app with `NEXT_PUBLIC_SIGNALING_URL=wss://your-host`. It shares validation, rate limits, and TURN/STUN handling with the built-in route through `src/lib`, so deploy that folder with it.

## Contributing and support

Bug reports and feature ideas are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) before opening an issue or pull request. For suspected security vulnerabilities, follow [SECURITY.md](SECURITY.md) instead of posting details publicly.

## License

PocketDeck is distributed under the [MIT License](LICENSE). Third-party dependencies and the included Node.js runtime are subject to their own licenses.
