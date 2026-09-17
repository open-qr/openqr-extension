import { useEffect, useRef, useState } from "react";
import { downloadBlob, useToast } from "@/lib/hooks";
import { exportFilename, renderQrBlob } from "@/lib/qr";

/**
 * Copy the QR image to the clipboard. The PNG is prepared BEFORE the click
 * wherever practical (clipboard writes need the user gesture, and rendering
 * inside it can race the gesture window); if the clipboard rejects the write,
 * the prepared PNG downloads instead so the click never ends in nothing.
 */
export function CopyImageButton({ payload }: { payload: string }) {
  const blob = useRef<Blob | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const { show, node } = useToast();

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    if (!payload) {
      blob.current = null;
      return;
    }
    void renderQrBlob(payload, 512, "png")
      .then((b) => {
        if (cancelled) return;
        blob.current = b;
        setReady(true);
      })
      .catch(() => {
        blob.current = null;
      });
    return () => {
      cancelled = true;
    };
  }, [payload]);

  async function onClick() {
    if (!payload) return;
    setBusy(true);
    try {
      let b = blob.current;
      if (!b) b = await renderQrBlob(payload, 512, "png");
      try {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": b })]);
        show("QR image copied");
      } catch {
        downloadBlob(b, exportFilename(payload, 512));
        show("Clipboard unavailable, downloaded instead");
      }
    } catch {
      show("Could not copy. Try Download.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {node}
      <button type="button" className="btn btn-primary" disabled={!payload || busy} onClick={() => void onClick()}>
        {busy ? "Copying…" : "Copy image"}
      </button>
    </>
  );
}
