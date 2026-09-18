# Chrome Web Store listing

Submission copy for the Chrome Web Store entry, kept here so the listing and the product stay in sync.

## Identity

- **Name:** OpenQR: QR Code Generator
- **Short name:** OpenQR
- **Category:** Productivity
- **Language:** English (UK)
- **Website:** https://openqr.uk
- **Package:** `releases/openqr-extension-v0.1.2.zip` (tag v0.1.2, CI-green, verified loading in a clean profile)

## Summary (132 chars max)

> A QR code for the page you are on, instantly. Static codes stay on your device; dynamic codes stay editable with scan analytics.

## Description

Open the toolbar button and the page you are on is already a QR code. Copy the image, download PNG (512 to 4096 px) or vector SVG, done. No account needed: static codes are generated entirely on your device, and nothing about them ever touches a network.

Need more? One click makes the code dynamic. It redirects through OpenQR with a short URL, so you can change the destination after printing and see scan analytics.

- Instant QR for any page, link, selection or image address (right-click menu)
- Eight content types: URL, text, email, phone, SMS, WhatsApp, Wi-Fi, location, contact (vCard)
- Dynamic codes: editable destination, pause and resume, scan analytics, all from the extension
- Reliable by design: closing the popup mid-create can never lose or duplicate a code
- Light and dark mode; the QR preview always matches the exported image
- No analytics in the extension, no third-party loads, no watermarks, no size limits

Static and dynamic, honestly explained:

- A static QR code holds its content directly. Changing it means a new QR image; this one always points at what you encoded.
- A dynamic QR code redirects through OpenQR, so the printed code keeps working when the destination changes. Deleting it stops the redirect.

Free OpenQR accounts hold one active dynamic code; paid plans raise the limits (see openqr.uk/pricing). The extension works fully without an account.

## Single purpose (review form)

Create QR codes for web content directly from the browser, and manage OpenQR dynamic QR codes through the official API.

## Permission justifications (review form)

- `storage`: store your settings, drafts and OpenQR connection state on this device.
- `contextMenus`: add "Create QR code for this…" entries to the right-click menu.
- `activeTab`: read the current page's URL when you click the toolbar button, to prefill the QR. The extension does not read any other tab data and stores no browsing history.
- Host `https://openqr.uk/*`: the API for connected features (dynamic codes, scan analytics). The extension makes no other network requests; CI enforces this.

## Privacy disclosure (review form)

- Not selling data to third parties, not using data for unrelated purposes, not transferring data: yes.
- Authentication: the API key is stored only in this browser profile on this device; disconnect clears it.
- Personal communications and website content: the extension reads the active tab URL on click, and whatever the user types into it, only to generate QR codes locally or to create codes on OpenQR when the user explicitly asks.
- The privacy policy covering openqr.uk handling: https://openqr.uk/privacy.

## Graphics

- 1280×800 screenshots: `store-assets/store-1..4` (instant, types, codes+analytics, dark)
- Promo 440×280: `store-assets/promo-440x280.png`
- Icon: `public/icons/icon-128.png` (set in the manifest)
