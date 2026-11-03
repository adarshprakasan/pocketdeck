# PocketDeck

PocketDeck is an independent, browser-only control deck project. The landing page and first QR pairing slice are in place. It does not run operating system shortcuts or launch desktop apps.

## Run locally

Requires Node.js 20.9 or newer.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your computer browser and choose **Get started**. The development command starts both Next.js and the local WebSocket signaling service on port 3001. To pair a real phone on the same Wi-Fi, open the site from the computer's LAN address; the computer firewall must allow ports 3000 and 3001. Use `npm run build` to create a production build and `npm start` to serve it.

For deployment, run the signaling service with `node server/signaling.mjs` and set `NEXT_PUBLIC_SIGNALING_URL` to its `wss://` address. Set `ALLOWED_ORIGIN` on the signaling service to the exact PocketDeck site origin; see `.env.example`. A STUN server helps establish direct connections; some networks may need a TURN relay, which is not configured yet.

## Stack

- Next.js App Router
- TypeScript with strict checking
- Tailwind CSS 4
- Lucide icons

## Phase 1 scope

- Responsive landing page for desktop and mobile browsers
- Dark visual system with purple and blue accents
- 4 × 3 control deck preview
- Product feature and pairing flow sections
- Time-limited QR pairing sessions with computer-side approval
- WebRTC data channel establishment between paired browsers

The landing page deck preview is illustrative. The pairing flow establishes the encrypted browser connection, but deck editing and browser actions are planned for later phases.
