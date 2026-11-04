POCKETDECK — LOCAL BROWSER DECK

This package runs PocketDeck on your computer. Your phone opens PocketDeck in
its existing browser over the same Wi-Fi. No cloud host, phone app, or separate
Node.js installation is required.

START

Windows: double-click Start-PocketDeck.bat.
Mac: double-click start-pocketdeck.command.

Keep the launcher window open. On the computer, open http://localhost:3000.
Scan the QR code with your phone camera and approve the request on the computer.
Both devices need to be on the same Wi-Fi. Guest Wi-Fi may block device-to-device
traffic. If the computer asks about the firewall, allow PocketDeck on private
networks only.

To stop PocketDeck, press Ctrl+C in the launcher window. The phone deck is saved
in that browser on this computer's local site address.

OPTIONAL TURN RELAY

Most same-Wi-Fi connections can use the default STUN setup. For networks that
block direct browser traffic, copy pocketdeck.env.example to pocketdeck.env,
enter your own TURN credentials, and restart PocketDeck. Keep that file private;
it contains credentials for your TURN service.

PocketDeck is browser-only. It does not launch desktop apps, control the
operating system, or install a phone app.
