import { describe, expect, it } from "vitest";
import { buildPayload, looksLikeHttpUrl } from "@/lib/payloads";
import type { FieldValues, PayloadType } from "@/lib/types";

/**
 * Golden vectors for the nine payload types. Authored from the API's wire
 * format (the server builds identical payloads in POST /v1/codes) and
 * machine-verified against a local worker by scripts/capture-goldens.mjs.
 * The escape rules are the point: WIFI escapes \ ; , : " and vCard escapes
 * \ ; , + newline but NOT colon. Getting these wrong silently renders a
 * different code than the dashboard.
 */
const CASES: Array<[string, PayloadType, FieldValues, string]> = [
  ["url plain", "url", { url: "https://example.com/menu" }, "https://example.com/menu"],
  ["url bare host gets https", "url", { url: "example.com/menu" }, "https://example.com/menu"],
  ["url mailto passthrough", "url", { url: "mailto:hi@example.com" }, "mailto:hi@example.com"],
  ["url trailing space trimmed", "url", { url: " https://example.com " }, "https://example.com"],
  ["text", "text", { text: " Table for two " }, "Table for two"],
  ["email simple", "email", { email: "hi@example.com" }, "mailto:hi@example.com"],
  [
    "email with subject and body (RFC 6068: %20 not +)",
    "email",
    { email: "hi@example.com", subject: "Two seats", body: "Please + confirm" },
    "mailto:hi@example.com?subject=Two%20seats&body=Please%20%2B%20confirm",
  ],
  ["phone", "phone", { phone: "+44 7700 900000" }, "tel:+44 7700 900000"],
  ["sms no message", "sms", { phone: "+44 7700 900000" }, "SMSTO:+44 7700 900000"],
  ["sms with message", "sms", { phone: "+44 7700 900000", message: "Hi there" }, "SMSTO:+44 7700 900000:Hi there"],
  [
    "whatsapp strips non-digits",
    "whatsapp",
    { phone: "+44 7700 900000", message: "Table for two" },
    "https://wa.me/447700900000?text=Table%20for%20two",
  ],
  [
    "wifi WPA with escaped specials",
    "wifi",
    { ssid: 'Cafe;Guest "Premium"', password: "pa\\ss;wo:rd,1", encryption: "WPA" },
    'WIFI:T:WPA;S:Cafe\\;Guest \\"Premium\\";P:pa\\\\ss\\;wo\\:rd\\,1;;',
  ],
  ["wifi nopass omits password", "wifi", { ssid: "OpenNet", encryption: "nopass" }, "WIFI:T:nopass;S:OpenNet;;"],
  ["wifi hidden flag", "wifi", { ssid: "H", password: "x", hidden: true }, "WIFI:T:WPA;S:H;P:x;H:true;;"],
  ["wifi WEP encryption kept", "wifi", { ssid: "N", password: "x", encryption: "WEP" }, "WIFI:T:WEP;S:N;P:x;;"],
  ["geo", "geo", { lat: "51.5074", lng: "-0.1278" }, "geo:51.5074,-0.1278"],
  [
    "vcard full",
    "vcard",
    {
      firstName: "Jo",
      lastName: "Smith; Jr",
      phone: "+44 7700 900000",
      email: "jo@example.com",
      org: "Smith, Sons & Co",
      title: "Founder",
      url: "example.com",
      address: "1 Main Street\nLondon",
    },
    [
      "BEGIN:VCARD",
      "VERSION:3.0",
      "N:Smith\\; Jr;Jo;;;",
      "FN:Jo Smith\\; Jr",
      "ORG:Smith\\, Sons & Co",
      "TITLE:Founder",
      "TEL;TYPE=CELL:+44 7700 900000",
      "EMAIL;TYPE=INTERNET:jo@example.com",
      "URL:https://example.com",
      "ADR;TYPE=WORK:;;1 Main Street\\nLondon;;;;",
      "END:VCARD",
    ].join("\n"),
  ],
  [
    "vcard colon survives unescaped (URLs)",
    "vcard",
    { firstName: "Jo", url: "https://x.test/a:b" },
    "BEGIN:VCARD\nVERSION:3.0\nN:;Jo;;;\nFN:Jo\nURL:https://x.test/a:b\nEND:VCARD",
  ],
  [
    "vcard unicode + emoji",
    "vcard",
    { firstName: "Zoë", phone: "+447700900000" },
    "BEGIN:VCARD\nVERSION:3.0\nN:;Zoë;;;\nFN:Zoë\nTEL;TYPE=CELL:+447700900000\nEND:VCARD",
  ],
];

describe("buildPayload goldens", () => {
  for (const [name, type, fields, expected] of CASES) {
    it(name, () => {
      expect(buildPayload(type, fields)).toBe(expected);
    });
  }
});

describe("empty payloads rejected", () => {
  it.each([
    ["url", {}],
    ["email", { email: " " }],
    ["sms", { phone: "" }],
    ["whatsapp", { phone: "no-digits" }],
    ["wifi", { password: "x" }],
    ["geo", { lat: "1" }],
    ["vcard", { org: "Only Org" }],
  ])("%s with %j returns empty", (type, fields) => {
    expect(buildPayload(type as PayloadType, fields as FieldValues)).toBe("");
  });
});

describe("looksLikeHttpUrl", () => {
  it("accepts absolute urls", () => expect(looksLikeHttpUrl("https://x.test/a?b=1#f")).toBe(true));
  it("accepts bare hosts", () => expect(looksLikeHttpUrl("example.com")).toBe(true));
  it("rejects schemes and prose", () => {
    expect(looksLikeHttpUrl("WIFI:T:WPA;S:x;;")).toBe(false);
    expect(looksLikeHttpUrl("hello there")).toBe(false);
  });
});
