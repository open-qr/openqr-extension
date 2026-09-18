# OpenQR for Chrome

The fastest trustworthy way to create a QR code while browsing, from [openqr.uk](https://openqr.uk). Open the toolbar button and the page you are on is already a QR code: copy the image, download PNG or SVG, done. No account, no configuration, nothing leaves your device.

When you need more, one click makes the code **dynamic**: it redirects through OpenQR, so you can change the destination after printing and see scan analytics.

## What it does

- **Instant QR for the current page.** Prefilled the moment the popup opens; static codes are generated entirely on your device.
- **Copy image or download.** PNG at 512 to 4096 px, or true-vector SVG. The size picker lives inside the download control.
- **Eight more content types.** URL, text, email, phone, SMS, WhatsApp, Wi-Fi, location and contact (vCard), with payload formats that match openqr.uk byte-for-byte (locked by tests against the server's own builder).
- **Right-click anything.** Pages, links, selections and image addresses get a "Create QR code for this…" entry that opens a compact create window.
- **Dynamic codes, done reliably.** "Make editable and view scans" creates a code with a short URL (oqr.to) you can re-point later. Creation runs through a background coordinator with idempotency keys, so closing the popup mid-request can never lose or duplicate a code: it comes back as "Not sure this went through", and Check replays it safely.
- **Your recent codes, honestly labelled.** Newest codes with search over what is shown; edit a dynamic destination, pause or resume it, read headline scans; everything else is one click into the dashboard.
- **Light and dark.** The QR preview always sits on a white plate, so it matches the exported image scanners see.

### Static vs dynamic, in one table

| | Static QR code | Dynamic QR code |
|---|---|---|
| Change destination | Needs a new QR image | Same printed code keeps working |
| Delete the record | Exported QR still holds its payload | Printed code stops resolving |
| Pause | Cannot disable an exported QR | Can pause the redirect |
| Short URL | Not applicable | Changing it can break printed codes |

## Privacy

- Static QR codes are generated on your device. No network request is made for them.
- The extension contains **no analytics** and loads **no third-party resource of any kind** (enforced by CI: the build fails if a remote asset sneaks in).
- Your API key is stored only in this browser profile, on this device, and is cleared the moment you disconnect.
- Connected use talks only to `https://openqr.uk`, whose logging is covered by the [privacy policy](https://openqr.uk/privacy). Scan analytics are aggregated; OpenQR stores no scanner identity.

### Why each permission

- `storage`: your settings, drafts and connection state.
- `contextMenus`: the "Create QR code for this…" entries.
- `activeTab`: reading the current page's URL when you click the toolbar button. Nothing else; no `tabs` permission, no browsing history.
- Host access to `https://openqr.uk`: the API for connected features.

## Install

From the Chrome Web Store once listed (link to follow), or for development: clone, `pnpm install`, `pnpm build`, then load the `dist/` directory via chrome://extensions with "Load unpacked".

## Development

```
pnpm install
pnpm watch        # dev build + rebuild on change (load dist/ once, then reload)
pnpm test         # unit: payload builders (golden fixtures), guards, coordinator state machine
pnpm e2e          # Playwright, real Chromium with the extension loaded, against a fixture API
pnpm build        # production build + manifest assertions
pnpm zip          # releases/openqr-extension-v<version>.zip
```

Notes for working on this repo:

- **Manifest V3, minimal permissions.** `scripts/assert-build.mjs` fails CI if the permission set, host permissions or the no-remote-assets rule are violated, or if the service worker graph drags in UI dependencies.
- **e2e runs in bundled Chromium, not branded Chrome**: Chrome 137+ ignores `--load-extension`. `__EXT_DEV__` (set by `--mode development`) gates the dev-only API base URL and test hooks.
- **Payload parity**: `tests/payloads.test.ts` locks the builders to `fixtures/golden-payloads.json`, and `scripts/capture-goldens.mjs` recaptures that file from a live OpenQR worker (set `BASE` and `KEY`) so wire-format drift is caught before release.
- **The coordinator is the single writer.** Every mutation (creates, destination edits, pause/resume) is persisted as an operation record before it runs, in the service worker, with an idempotency key. Surfaces observe storage; they never race each other.

Built on [`@open-qr/sdk`](https://www.npmjs.com/package/@open-qr/sdk), the same published SDK anyone can use against the [OpenQR API](https://openqr.uk/api).

## License

MIT. Poppins is bundled under the SIL Open Font License (see `LICENSE-FONTS`).
