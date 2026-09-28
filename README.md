# Right There

Show your partner where to massage, without saying a word.

The **receiver** lies face down with their phone beside them and moves a finger to show where they want the hands. The **giver** sees the spot as a dot on a map of the back. Double-tap when it's *right there*.

**Open https://tsterker.github.io/right-there/ on both devices.** Prototype. There's no server: the two devices talk to each other directly over the Wi-Fi.

## How it works

1. **Pair.** Pick a role on one device, then scan its QR code with the other device's camera. The link opens Right There, which shows a reply code. Hold that up to the first device and tap *Scan their code*, or copy and paste it.
2. **Two swipes (receiver).** Put the phone flat where your hand rests. Swipe *neck → lower back*, then *left → right*. This tells the app how the phone is lying. Next time you can tap *Same as last time*.
3. **Guide.**
   - **Receiver:**
     - *Nudge*: drag anywhere, like on a trackpad. Slow drags are precise, quick ones travel far.
     - *Map*: touch the spot on the picture.
     - **Double-tap anywhere = right there.**
   - **Giver:** chooses once where they're standing, so the map matches what they see. Then sees the dot, the direction of each nudge ("↗ Higher and to their right") and the name of the area, with optional spoken cues. *I'm here* moves the dot to where the hands really are.

- **Map mode learns.** After a double-tap on a spot touched in map mode, the giver taps *I'm here — teach map* and then taps where their hands are. The receiver's phone saves the pair and uses it to correct later touches.
- **Swap roles:** *⋯ → Swap roles* keeps the same connection.
- **Dropouts:** if one device drops out, the other shows *Reconnect* with a new QR code, and the session picks up where it left off.
- **Network:** both devices need the same Wi-Fi, or one phone's hotspot. Guest and hotel Wi-Fi often block devices from reaching each other. *Not connecting? → public STUN helper* can help.
- **Vibration:** on Android, the receiver's phone ticks when the spot enters a new area. iPhones don't let web pages vibrate.

## Development

```bash
npm install
npm run dev          # http://localhost:5173 with hot reload
npm run dev:phone    # the same, plus a temporary HTTPS link for the phone
```

- **Testing with a phone.** Open `http://localhost:5173` on the computer. Its QR codes point the phone at the dev server, and edits reload on both screens.
  - **`npm run dev`:** the phone uses this computer's Wi-Fi address over plain HTTP.
  - **`npm run dev:phone`:** the phone gets HTTPS through a Cloudflare quick tunnel (no account needed). Its camera and screen-on then work too.
- **Both screens in one window:** `http://localhost:5173/#/demo` pairs them automatically. Drag on the receiver with the mouse; double-click = right there.
- **Checks:** `npm test` · `npm run typecheck` · `npm run e2e`. The e2e run builds the app, then drives Chrome and WebKit through a whole session. It needs Google Chrome, plus `npx playwright-core install webkit` once.
- **Build and publish:** `npm run build` writes one self-contained file, `dist/index.html` (also copied to `dist/right-there.html`), which works on any static host or opened from disk. Every push to `main` publishes it to GitHub Pages.
- **Forks** publish to their own `https://<you>.github.io/<repo>/`. For local builds, put that address in `.env.production`; QR codes shown by a copy opened from disk use it.

```
src/shared/          pure logic, unit-tested
  session.ts         shared state (the spot, "right there"), actions, validation
  room.ts            the hosting device's authority: validates, applies and numbers actions
  calibration.ts     phone orientation from the swipes, map-mode correction
  nudge.ts           pointer ballistics, auto-tune, nudge wording
  body.ts regions.ts the back model (in cm) and its named areas
src/client/
  p2p/               pairing without a signaling server: WebRTC offer/answer squeezed into ~160-character QR codes
  lib/connection.ts  each device's copy of the session
  screens/           landing, pairing, receiver (swipes, touch pad), giver (map)
```

The device that starts the session hosts it. It applies every action and sends it, numbered, to both screens, so the two copies stay identical. A device that reconnects gets a fresh snapshot, and anything it sent that wasn't confirmed is resent without being applied twice.
