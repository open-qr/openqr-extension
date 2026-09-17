/**
 * QR rendering, always local: dynamic codes render from their short URL,
 * static codes from the payload. The /v1/qr endpoint is never called (no
 * quota use; previews work offline). House style matches openqr.uk.
 */
import type { Options } from "qr-code-styling";

export const HOUSE_FG = "#232E3A";
export const HOUSE_BG = "#FFFFFF";

export const EXPORT_SIZES = [512, 1024, 2048, 4096] as const;
export type ExportSize = (typeof EXPORT_SIZES)[number];

export function buildQrOptions(
  payload: string,
  size: number,
  overrides: Partial<Options> = {},
): Options {
  return {
    type: "canvas",
    width: size,
    height: size,
    // Generous quiet zone: the openqr.uk generator defaults to 8 modules.
    margin: Math.round((size / 100) * 8),
    data: payload,
    qrOptions: { errorCorrectionLevel: "Q" },
    dotsOptions: { type: "rounded", color: HOUSE_FG },
    cornersSquareOptions: { type: "extra-rounded", color: HOUSE_FG },
    cornersDotOptions: { type: "dot", color: HOUSE_FG },
    backgroundOptions: { color: HOUSE_BG },
    ...overrides,
  };
}

let modPromise: Promise<typeof import("qr-code-styling").default> | null = null;
function loadQr(): Promise<typeof import("qr-code-styling").default> {
  modPromise ??= import("qr-code-styling").then((m) => m.default);
  return modPromise;
}

/** Render a one-off export blob (PNG or SVG) at an exact pixel size. */
export async function renderQrBlob(
  payload: string,
  size: number,
  format: "png" | "svg",
): Promise<Blob> {
  const QRCodeStyling = await loadQr();
  const inst = new QRCodeStyling(buildQrOptions(payload, size));
  const data = await inst.getRawData(format);
  if (!data) throw new Error("QR render returned no data");
  return data instanceof Blob ? data : new Blob([data as BlobPart], {
    type: format === "png" ? "image/png" : "image/svg+xml",
  });
}

/** Instance for live previews (call .append then .update on changes). */
export async function createPreview(payload: string, size: number) {
  const QRCodeStyling = await loadQr();
  return new QRCodeStyling(buildQrOptions(payload, size));
}

export function exportFilename(payload: string, size: number | "svg"): string {
  const slug =
    payload === ""
      ? "openqr"
      : payload
          .replace(/^[a-z]+:\/\//i, "")
          .replace(/[^a-z0-9]+/gi, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 40)
          .toLowerCase() || "openqr";
  return `openqr-${slug}${size === "svg" ? "" : `-${size}`}.${size === "svg" ? "svg" : "png"}`;
}
