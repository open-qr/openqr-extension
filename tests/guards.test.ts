import { describe, expect, it } from "vitest";
import { payloadTooLong, validateDestination } from "@/lib/guards";

describe("validateDestination", () => {
  it("accepts https and preserves query + fragment verbatim", () => {
    const raw = "https://example.com/menu?a=1&b=%20x#section";
    const v = validateDestination(raw);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.url).toBe(raw);
  });

  it("accepts http", () => {
    expect(validateDestination("http://example.com").ok).toBe(true);
  });

  it.each(["javascript:alert(1)", "data:text/html,hi", "file:///etc/hosts", "blob:https://x"])(
    "rejects %s with the scheme reason",
    (bad) => {
      const v = validateDestination(bad);
      expect(v.ok).toBe(false);
      if (!v.ok) expect(v.reason).toBe("scheme");
    },
  );

  it.each([
    "http://localhost:3000",
    "https://127.0.0.1/dev",
    "https://10.0.0.5/kiosk",
    "https://192.168.1.20/menu",
    "https://172.16.0.1/x",
    "https://printer.local",
  ])("rejects private host %s with the private reason", (bad) => {
    const v = validateDestination(bad);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe("private");
  });

  it("rejects over-length with an actionable hint", () => {
    const v = validateDestination(`https://example.com/${"a".repeat(2100)}`);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe("too_long");
  });

  it("flags signed urls without blocking", () => {
    const v = validateDestination("https://cdn.example.com/file.pdf?X-Goog-Signature=abc&expires=123");
    expect(v.ok && v.signedUrlWarning).toBe(true);
  });

  it("empty is the empty reason", () => {
    const v = validateDestination("   ");
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toBe("empty");
  });
});

describe("payloadTooLong", () => {
  it("null under the limit, message over it", () => {
    expect(payloadTooLong("x".repeat(2000))).toBeNull();
    expect(payloadTooLong("x".repeat(2001))).toMatch(/2,000/);
  });
});
