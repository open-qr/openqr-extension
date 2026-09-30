import { useEffect, useRef } from "react";
import { buildQrOptions, createPreview } from "@/lib/qr";

type PreviewInstance = Awaited<ReturnType<typeof createPreview>>;

/** Live QR preview on a white plate. The plate stays white in dark mode:
 *  scanners threshold against a light ground, and the preview must represent
 *  the export. With onOpen, the plate is a button that opens the full-size
 *  view: the affordance is the hover ring, not extra chrome. */
export function QrPreview({
  payload,
  size = 264,
  onOpen,
}: {
  payload: string;
  size?: number;
  onOpen?: () => void;
}) {
  const host = useRef<HTMLDivElement | null>(null);
  const inst = useRef<PreviewInstance | null>(null);

  useEffect(() => {
    let cancelled = false;
    const hostEl = host.current;
    if (!payload || !hostEl) return;

    if (!inst.current) {
      void createPreview(payload, size).then((qr) => {
        if (cancelled || !hostEl) return;
        inst.current = qr;
        hostEl.innerHTML = "";
        qr.append(hostEl);
      });
    } else {
      void inst.current.update(buildQrOptions(payload, size));
    }
    return () => {
      cancelled = true;
    };
  }, [payload, size]);

  if (!payload) {
    return (
      <div
        className="qr-plate flex items-center justify-center border border-dashed border-border text-center"
        style={{ width: size, height: size }}
      >
        <p className="px-8 text-xs text-muted-fg">
          Type a destination or pick a content type to see your QR code.
        </p>
      </div>
    );
  }
  const plate = (
    <div
      ref={host}
      className="qr-plate flex items-center justify-center overflow-hidden"
      style={{ width: size, height: size }}
    />
  );
  if (!onOpen) return plate;
  return (
    <button
      type="button"
      onClick={onOpen}
      title="Open full size in a tab"
      aria-label="Open this QR code full size in a browser tab"
      className="cursor-zoom-in rounded-card transition-shadow focus-visible:outline-2 focus-visible:outline-ring hover:ring-4 hover:ring-ring/40"
    >
      {plate}
    </button>
  );
}
