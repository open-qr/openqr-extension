/**
 * Client-side input guards, run before any API call or render.
 * The server re-validates everything (assertSafeUrl); these guards exist to
 * explain problems in the extension's own words, before a round trip.
 */
import { looksLikeHttpUrl } from "./payloads";

export const MAX_PAYLOAD_CHARS = 2000;

export type DestinationVerdict =
  | { ok: true; url: string; signedUrlWarning: boolean }
  | { ok: false; reason: "empty" | "scheme" | "private" | "too_long"; hint: string };

const PRIVATE_HOST =
  /^(localhost|127(\.\d+){3}|0\.0\.0\.0|10(\.\d+){3}|192\.168(\.\d+){2}|172\.(1[6-9]|2\d|3[01])(\.\d+){2}|\[::1?\]|.+\.local)$/i;

const SIGNED_URL_PARAM =
  /[?&](signature|sig|token|expires|expiry|x-amz-signature|x-amz-credential|x-goog-signature|seckey|sharedaccess)=/i;

export function validateDestination(raw: string): DestinationVerdict {
  const v = raw.trim();
  if (!v) {
    return { ok: false, reason: "empty", hint: "Enter the page the QR code should open." };
  }
  if (v.length > MAX_PAYLOAD_CHARS) {
    return {
      ok: false,
      reason: "too_long",
      hint: "This destination is over the 2000-character limit. Shorten it, or use a dynamic QR code with a short URL.",
    };
  }
  let parsed: URL;
  try {
    parsed = new URL(v);
  } catch {
    return {
      ok: false,
      reason: "scheme",
      hint: "Dynamic QR codes need a web address starting with https:// or http://.",
    };
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return {
      ok: false,
      reason: "scheme",
      hint: `QR codes can only point at web addresses. ${parsed.protocol.replace(":", "")} links are not supported.`,
    };
  }
  if (PRIVATE_HOST.test(parsed.hostname)) {
    return {
      ok: false,
      reason: "private",
      hint: "A QR code does not make a private page public. Scanners outside this network cannot reach it, so the code would fail everywhere it is printed.",
    };
  }
  // Preserve the input verbatim (query string and fragment included):
  // URL serialisation can re-encode characters and break signed links.
  return { ok: true, url: v, signedUrlWarning: SIGNED_URL_PARAM.test(v) };
}

/** Static payload length check with an actionable message. */
export function payloadTooLong(payload: string): string | null {
  if (payload.length <= MAX_PAYLOAD_CHARS) return null;
  return `This QR code needs ${payload.length.toLocaleString("en-GB")} characters; the limit is 2,000. Shorten the text or use a link.`;
}

export { looksLikeHttpUrl };
