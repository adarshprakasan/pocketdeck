# PocketDeck

PocketDeck is an independent, browser-only control deck project. The landing page, QR pairing, and first browser action deck are in place. It does not run operating system shortcuts or launch desktop apps.

## Run locally

Requires Node.js 20.9 or newer.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your computer browser and choose **Get started**. Local development signaling uses the same Next.js origin, so only port 3000 is needed. To pair a real phone on the same Wi-Fi, open the site from the computer's LAN address and allow that port through the computer firewall. Use `npm run build` to create a production build and `npm start` to serve it.

For deployment, run the WebSocket signaling service with `node server/signaling.mjs` and set `NEXT_PUBLIC_SIGNALING_URL` to its `wss://` address. Set `ALLOWED_ORIGIN` on the signaling service to the exact PocketDeck site origin; see `.env.example`. The same-origin API signaling path is intended for a single local development server. A STUN server helps establish direct connections; some networks may need a TURN relay, which is not configured yet.

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
- Editable 4 × 3 phone deck with local persistence
- Validated URL, text, timer, media, and PocketDeck web actions

The landing page deck preview is illustrative. Open URL actions use a user-enabled action window or ask for a click before opening. Text is copied only after a click on the computer. Media actions can control audio or video embedded in the PocketDeck page; they cannot control other browser tabs. The signaling service uses STUN only, so some networks may need a TURN relay.
