# Right There

Two phones, no server: the receiver points at their own back, the giver sees the spot on a map. README.md has the flow, the dev commands and the code map.

## Ship loop

Tim ships fast: work on `main` in small commits and push each one as soon as it's green.

1. Run `npm run typecheck && npm test && npm run e2e` until all three are green.
2. Touched the UI: read the screenshots `npm run e2e` saves in `/tmp/right-there-e2e/`, because layout slips only show there. When a screen changed visibly, run `npm run screenshots` and commit the refreshed `docs/*.png`.
3. Commit and push to `main`. The push deploys https://tsterker.github.io/right-there/.
4. Done when the Pages run for the push is green (`gh run watch <id> --exit-status`, id from `gh run list`) and `node scripts/e2e-engines.mjs --url https://tsterker.github.io/right-there/` passes against the live site.

## Scope

One job: navigating the back. Pressure feedback, massage tips, plans, timers, history and the relay server were cut on purpose and live in git history. Bring one back when Tim asks for it.

## Constraints

- **One static file.** `npm run build` inlines everything into `dist/index.html`, which also runs from disk. New code ships inside that bundle, with no backend and no runtime fetches; the opt-in public STUN server is the one exception.
- **Every change to shared state is an action.** `sanitizeAction` → `reduce` in `src/shared/session.ts` runs on the hosting device and is replayed on the other, so both copies stay equal. A new action brings its reducer case, its validation and a test.
- **Saved data lives on people's phones.** `mb.*` localStorage values load merged over defaults: add fields freely and keep existing names and meanings, since a rename silently drops someone's calibration.
- **Both devices run the same build.** After changing messages or state, reload both devices before testing; a stale tab speaks the old protocol.
