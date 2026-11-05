POCKETDECK — LOCAL BROWSER DECK

This package runs PocketDeck on your computer. Your phone opens PocketDeck in
its existing browser over the same Wi-Fi. No cloud host, phone app, or separate
Node.js installation is required.

START

Windows: double-click Start-PocketDeck.bat.
Mac: double-click start-pocketdeck.command.

Keep the launcher window open. On the computer, open http://localhost:3000.
Scan the QR code with your phone camera. Check that the four-digit code on your
phone matches the one on the computer, then approve the request on the computer.
Both devices need to be on the same Wi-Fi. Guest Wi-Fi may block device-to-device
traffic. If the computer asks about the firewall, allow PocketDeck on private
networks only.

To stop PocketDeck, press Ctrl+C in the launcher window. The phone deck is saved
in the phone's browser for the address it connected to. A backup copy is also
kept in this computer's PocketDeck browser, and the deck can be exported and
imported from the phone screen.

MAC: if macOS blocks the launcher, right-click it and choose Open, or run
  xattr -dr com.apple.quarantine PocketDeck
on the extracted folder in Terminal.

CHANGING THE PORT

Copy pocketdeck.env.example to pocketdeck.env, add PORT=3001 (or another free
port), and restart PocketDeck.

PRIVACY: LAN-ONLY MODE

PocketDeck contacts a public STUN server (Google's by default) to help browsers
find each other. To avoid any third-party contact on your own network, set
POCKETDECK_STUN_URLS=none in pocketdeck.env.

OPTIONAL TURN RELAY

Most same-Wi-Fi connections can use the default STUN setup. For networks that
block direct browser traffic, copy pocketdeck.env.example to pocketdeck.env,
enter your own TURN credentials, and restart PocketDeck. Keep that file private;
it contains credentials for your TURN service.

PocketDeck is browser-only. It does not launch desktop apps, control the
operating system, or install a phone app.
