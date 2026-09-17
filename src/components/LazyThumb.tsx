import { useEffect, useRef, useState } from "react";
import { buildQrOptions, createPreview } from "@/lib/qr";

type PreviewInstance = Awaited<ReturnType<typeof createPreview>>;

/**
 * List thumbnail rendered only when it scrolls into view: 500 canvases up
 * front would jank the tab. Payloads are local (short URL or payload string),
 * so a row costs no API call.
 */
export function LazyThumb({ payload, size = 40 }: { payload: string; size?: number }) {
  const host = useRef<HTMLSpanElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = host.current;
    if (!el || visible) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: "120px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible || !payload || !host.current) return;
    let cancelled = false;
    void createPreview(payload, size).then((qr: PreviewInstance) => {
      if (cancelled || !host.current) return;
      host.current.innerHTML = "";
      qr.append(host.current);
    });
    return () => {
      cancelled = true;
    };
  }, [visible, payload, size]);

  return (
    <span
      ref={host}
      className="qr-plate inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-border"
      style={{ width: size, height: size }}
    >
      {!visible && <span className="block size-full bg-muted" />}
    </span>
  );
}
