# Contributing to PocketDeck

Thanks for helping improve PocketDeck. Keep changes focused and preserve the browser-only product boundary: PocketDeck pairs a computer browser and a phone browser; it does not install a mobile app or perform operating-system actions.

## Before you start

- Search existing issues before filing a duplicate.
- For a significant change, open an issue first to discuss the approach.
- For security concerns, follow [SECURITY.md](SECURITY.md) rather than filing a public issue.

## Local setup

Use Node.js 20.9 or newer:

```bash
npm ci
npm run dev
```

Open `http://localhost:3000` on the computer. For phone testing, connect both devices to the same Wi-Fi and allow the development server through the computer firewall on private networks.

## Before opening a pull request

Run the checks relevant to your changes:

```bash
npm run lint
npm run build:portable
```

For packaging changes, also run `npm run package:portable` on the matching operating system and architecture. Describe the change, user-visible behavior, and checks performed. Include screenshots for visual changes and steps to reproduce for bug fixes.

## Pull request guidelines

- Keep pull requests focused and explain why the change is useful.
- Do not commit `.env.local`, `pocketdeck.env`, TURN secrets, generated archives, or local build output.
- Update README or changelog when user instructions or release behavior change.
- Avoid adding dependencies when a small built-in solution is sufficient.
- Do not include unrelated formatting changes.
