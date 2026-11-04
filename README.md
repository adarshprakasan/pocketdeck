# PocketDeck

PocketDeck is an independent, browser-only control deck project. The landing page, QR pairing, and first browser action deck are in place. It does not run operating system shortcuts or launch desktop apps.

## Run locally

Requires Node.js 20.9 or newer.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your computer browser and choose **Get started**. Local development signaling uses the same Next.js origin, so only port 3000 is needed. When the page is opened at `localhost`, PocketDeck prefers the computer's Wi-Fi address for the QR link and skips common virtual-network ranges. If the computer has multiple network adapters, set `POCKETDECK_LAN_ADDRESS` to its Wi-Fi/LAN IPv4 address. Keep both devices on the same Wi-Fi and allow port 3000 through the computer firewall. Use `npm run build` to create a production build and `npm start` to serve it.

For deployment, run the WebSocket signaling service with `node server/signaling.mjs` and set `NEXT_PUBLIC_SIGNALING_URL` to its `wss://` address. Set `ALLOWED_ORIGIN` on the signaling service to the exact PocketDeck site origin; see `.env.example`. The same-origin API signaling path is intended for a single local development server. For networks that block direct browser traffic, configure either a coturn REST service with `TURN_URLS` and `TURN_SHARED_SECRET`, or Cloudflare Realtime TURN with `CLOUDFLARE_TURN_KEY_ID` and `CLOUDFLARE_TURN_KEY_SECRET`. The server issues four-hour credentials only after pairing approval; keep all TURN secrets server-side.

## Stack

- Next.js App Router
- TypeScript with strict checking
- Tailwind CSS 4
- Lucide icons

## Current features

- Responsive landing page for desktop and mobile browsers
- Dark visual system with purple and blue accents
- 4 × 3 control deck preview
- Product feature and pairing flow sections
- Time-limited QR pairing sessions with computer-side approval
- WebRTC data channel establishment between paired browsers
- Editable 4 × 3 phone deck saved in the current browser and site origin
- Validated URL, text, timer, media, and PocketDeck web actions
- Phone-side delivery acknowledgements and computer-side action notices
- Brief connection recovery, with clear fresh-QR guidance if the data channel closes

The landing page deck preview is illustrative. Open URL actions use a user-enabled action window or ask for a click before opening. Text is copied only after a click on the computer. Media actions can control audio or video embedded in the PocketDeck page; they cannot control other browser tabs. Pairing uses STUN by default and can use a coturn or Cloudflare Realtime TURN relay when configured. A brief network interruption gets a 10-second recovery window; if the data channel closes, create and scan a fresh QR code.
