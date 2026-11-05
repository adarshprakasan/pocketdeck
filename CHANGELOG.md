# Changelog

Notable changes to PocketDeck are documented here.

## [0.1.1] - Unreleased

### Fixed

- Connected sessions no longer end after 30 minutes. Signaling stops once the browsers connect, and a late "expired" notice can no longer remove a live deck.
- `PORT` in `pocketdeck.env` now works; the launchers no longer force port 3000.
- Editing a button no longer shortens the `Aa` icon, and emoji with joiners, flags, and skin tones are kept intact.
- The QR code no longer ignores networks in the `192.168.56.x` and `172.17.x.x` ranges. When several networks are found, the pairing screen offers a picker.
- Opening a pairing link (for example from a link preview) no longer sends an approval request to the computer.
- A single failed request or late network candidate no longer ends pairing; requests are retried with backoff.
- The desktop timer stays accurate in background tabs and now beeps and flags the tab title when it finishes.
- Replaced the default deck's four media buttons, which did nothing without media inside PocketDeck, with actions that work out of the box.
- Corrected the stale "no relay server yet" connection message.

### Security

- Each pairing shows a four-digit verification code on both screens, and a phone proves its identity with a key that stays in its browser tab instead of the shared pairing token.
- The pairing token no longer reaches TURN providers; sessions use a separate random identifier.
- Added limits on active pairing sessions, queued messages, pairing attempts per address, and phone actions per second.
- Signaling payloads are validated identically by both signaling transports.
- STUN is configurable; `POCKETDECK_STUN_URLS=none` gives a LAN-only mode.
- Releases include `SHA256SUMS` and build-provenance attestations, and GitHub Actions are pinned to commit SHAs.

### Added

- Deck Export and Import (JSON), and an automatic backup of the deck on the computer that restores a phone whose address has changed.
- Long-polling signaling, replacing twice-per-second polling.
- Keyboard and screen-reader support in the button editor (dialog semantics, focus trap, Escape) and live status messages; haptic feedback on supported phones.
- Test suite (`npm test`), `npm run typecheck`, and `npm audit` in CI.
- `npm run signaling` and documentation for the optional hosted signaling service.

### Changed

- Split the pairing screen and deck into smaller components and a `usePairing` hook with a state reducer, and removed the non-functional page dots.
- Deck storage uses a versioned format; decks saved by 0.1.0 are migrated automatically.
- Updated Next.js and lucide-react.

## [0.1.0] - 2026-11-04

### Added

- Windows x64, macOS Intel, and Apple Silicon portable ZIP downloads, each with a bundled Node.js runtime.
- QR-code pairing with approval on the computer and browser-to-browser WebRTC communication.
- A customizable 4 × 3 phone deck with browser-local persistence.
- Notice, text, URL, timer, embedded-media, and PocketDeck web actions.
- Connection recovery guidance, optional TURN configuration, and a responsive dark interface.

### Notes

- This release is browser-only. It does not install a phone app or control desktop applications or operating-system features.
- Phone and computer need to be able to reach each other over the local network. Some guest Wi-Fi networks, VPNs, and firewalls block this traffic.
