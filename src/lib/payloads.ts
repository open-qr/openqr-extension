/**
 * Local payload builders for the nine static types.
 *
 * The output must match POST /v1/codes byte-for-byte (the server builds the
 * canonical payload server-side): the same trim rules, the same mailto /
 * SMSTO / wa.me / WIFI / geo / vCard dialects, and the exact escape sets
 * (WIFI escapes backslash, semicolon, comma, colon, quote; vCard escapes
 * backslash, semicolon, comma and newline but NOT colon, so URLs survive).
 * Locked by fixtures/golden-payloads.json (authored from the wire format and
 * machine-verified against a local worker by scripts/capture-goldens.mjs).
 */
import type { FieldValues, PayloadType } from "./types";

export interface FieldDef {
  name: string;
  label: string;
  type: "text" | "textarea" | "tel" | "select" | "checkbox";
  placeholder?: string;
  required?: boolean;
  options?: Array<{ value: string; label: string }>;
}

export interface PayloadTypeMeta {
  id: PayloadType;
  label: string;
  fields: FieldDef[];
}

export const PAYLOAD_TYPES: PayloadTypeMeta[] = [
  { id: "url", label: "URL", fields: [{ name: "url", label: "Destination URL", type: "text", placeholder: "https://example.com/menu", required: true }] },
  { id: "text", label: "Text", fields: [{ name: "text", label: "Text", type: "textarea", placeholder: "Any text", required: true }] },
  {
    id: "email",
    label: "Email",
    fields: [
      { name: "email", label: "Email address", type: "text", placeholder: "hello@example.com", required: true },
      { name: "subject", label: "Subject", type: "text" },
      { name: "body", label: "Message", type: "textarea" },
    ],
  },
  { id: "phone", label: "Phone", fields: [{ name: "phone", label: "Phone number", type: "tel", placeholder: "+44 7700 900000", required: true }] },
  {
    id: "sms",
    label: "SMS",
    fields: [
      { name: "phone", label: "Phone number", type: "tel", placeholder: "+44 7700 900000", required: true },
      { name: "message", label: "Message", type: "textarea" },
    ],
  },
  {
    id: "whatsapp",
    label: "WhatsApp",
    fields: [
      { name: "phone", label: "Phone number", type: "tel", placeholder: "+44 7700 900000", required: true },
      { name: "message", label: "Prefilled message", type: "textarea" },
    ],
  },
  {
    id: "wifi",
    label: "Wi-Fi",
    fields: [
      { name: "ssid", label: "Network name (SSID)", type: "text", placeholder: "Cafe Guest", required: true },
      { name: "password", label: "Password", type: "text" },
      {
        name: "encryption",
        label: "Security",
        type: "select",
        options: [
          { value: "WPA", label: "WPA / WPA2 / WPA3" },
          { value: "WEP", label: "WEP" },
          { value: "nopass", label: "No password" },
        ],
      },
      { name: "hidden", label: "Hidden network", type: "checkbox" },
    ],
  },
  {
    id: "geo",
    label: "Location",
    fields: [
      { name: "lat", label: "Latitude", type: "text", placeholder: "51.5074", required: true },
      { name: "lng", label: "Longitude", type: "text", placeholder: "-0.1278", required: true },
    ],
  },
  {
    id: "vcard",
    label: "Contact (vCard)",
    fields: [
      { name: "firstName", label: "First name", type: "text" },
      { name: "lastName", label: "Last name", type: "text" },
      { name: "phone", label: "Phone", type: "tel" },
      { name: "email", label: "Email", type: "text" },
      { name: "org", label: "Organisation", type: "text" },
      { name: "title", label: "Job title", type: "text" },
      { name: "url", label: "Website", type: "text" },
      { name: "address", label: "Work address", type: "text" },
    ],
  },
];

export function payloadTypeMeta(id: PayloadType): PayloadTypeMeta | undefined {
  return PAYLOAD_TYPES.find((t) => t.id === id);
}

const s = (v: string | boolean | undefined): string =>
  v == null ? "" : String(v).trim();

/** WIFI escapes the backslash and the four structural characters. */
const escWifi = (v: string): string => v.replace(/([\\;,:"])/g, "\\$1");

/** vCard 3.0 escapes backslash, semicolon, comma and newline, not colon. */
const escVcard = (v: string): string =>
  v.replace(/([\\;,])/g, "\\$1").replace(/\r?\n/g, "\\n");

const looksLikeAbsoluteUrl = (v: string): boolean =>
  /^[a-z][\w+.-]*:\/\//i.test(v) || v.startsWith("mailto:");

/** Returns "" when the type's required fields are missing (callers reject). */
export function buildPayload(type: PayloadType, f: FieldValues): string {
  switch (type) {
    case "url": {
      const v = s(f.url);
      if (!v) return "";
      return looksLikeAbsoluteUrl(v) ? v : `https://${v}`;
    }
    case "text":
      return s(f.text);
    case "email": {
      const to = s(f.email);
      if (!to) return "";
      // RFC 6068 percent-encoding: a literal '+' in a mailto query means a
      // plus sign, so spaces go in as %20, not '+'.
      const params: string[] = [];
      if (s(f.subject)) params.push(`subject=${encodeURIComponent(s(f.subject))}`);
      if (s(f.body)) params.push(`body=${encodeURIComponent(s(f.body))}`);
      return `mailto:${to}${params.length ? `?${params.join("&")}` : ""}`;
    }
    case "phone":
      return s(f.phone) ? `tel:${s(f.phone)}` : "";
    case "sms": {
      const n = s(f.phone);
      if (!n) return "";
      return s(f.message) ? `SMSTO:${n}:${s(f.message)}` : `SMSTO:${n}`;
    }
    case "whatsapp": {
      const n = s(f.phone).replace(/[^\d]/g, "");
      if (!n) return "";
      const text = s(f.message);
      return `https://wa.me/${n}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
    }
    case "wifi": {
      const ssid = s(f.ssid);
      if (!ssid) return "";
      const enc = s(f.encryption) || "WPA";
      const parts = [`T:${enc === "nopass" ? "nopass" : enc}`, `S:${escWifi(ssid)}`];
      if (enc !== "nopass") parts.push(`P:${escWifi(s(f.password))}`);
      if (f.hidden) parts.push("H:true");
      return `WIFI:${parts.join(";")};;`;
    }
    case "geo": {
      const lat = s(f.lat);
      const lng = s(f.lng);
      return lat && lng ? `geo:${lat},${lng}` : "";
    }
    case "vcard": {
      const first = s(f.firstName);
      const last = s(f.lastName);
      const fn = [first, last].filter(Boolean).join(" ");
      if (!fn && !s(f.phone) && !s(f.email)) return "";
      const lines = [
        "BEGIN:VCARD",
        "VERSION:3.0",
        `N:${escVcard(last)};${escVcard(first)};;;`,
        `FN:${escVcard(fn || first || last)}`,
      ];
      if (s(f.org)) lines.push(`ORG:${escVcard(s(f.org))}`);
      if (s(f.title)) lines.push(`TITLE:${escVcard(s(f.title))}`);
      if (s(f.phone)) lines.push(`TEL;TYPE=CELL:${escVcard(s(f.phone))}`);
      if (s(f.email)) lines.push(`EMAIL;TYPE=INTERNET:${escVcard(s(f.email))}`);
      const u = s(f.url);
      if (u) lines.push(`URL:${escVcard(looksLikeAbsoluteUrl(u) ? u : `https://${u}`)}`);
      if (s(f.address)) lines.push(`ADR;TYPE=WORK:;;${escVcard(s(f.address))};;;;`);
      lines.push("END:VCARD");
      return lines.join("\n");
    }
  }
}

/** Does this trimmed string parse as an http(s) URL? (Selection heuristic.) */
export function looksLikeHttpUrl(v: string): boolean {
  try {
    const u = new URL(v.trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return /^[\w-]+(\.[\w-]+)+([/?#].*)?$/i.test(v.trim());
  }
}
