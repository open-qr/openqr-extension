import { useEffect, useRef, useState } from "react";
import { downloadBlob, useToast } from "@/lib/hooks";
import { EXPORT_SIZES, exportFilename, renderQrBlob } from "@/lib/qr";

/** Download control with the size selection inside it (PNG 512 to 4096 + SVG). */
export function DownloadMenu({ payload }: { payload: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const { show, node } = useToast();

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  async function download(size: number | "svg") {
    setOpen(false);
    if (!payload) return;
    setBusy(true);
    try {
      const blob = await renderQrBlob(payload, size === "svg" ? 1024 : size, size === "svg" ? "svg" : "png");
      downloadBlob(blob, exportFilename(payload, size));
      show(`Saved ${exportFilename(payload, size)}`);
    } catch {
      show("Could not render this QR code. Try a smaller size.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={ref} className="relative">
      {node}
      <button
        type="button"
        className="btn btn-secondary"
        disabled={!payload || busy}
        onClick={() => setOpen((v) => !v)}
      >
        {busy ? "Rendering…" : "Download"}
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
          <path d="M1 3l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>
      {open && (
        <div className="card absolute right-0 z-40 mt-1.5 w-44 overflow-hidden py-1 shadow-lg">
          {EXPORT_SIZES.map((s) => (
            <MenuItem key={s} label={`PNG · ${s} × ${s}`} onClick={() => void download(s)} />
          ))}
          <MenuItem label="SVG (vector)" onClick={() => void download("svg")} />
        </div>
      )}
    </div>
  );
}

function MenuItem({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="block w-full px-3.5 py-2 text-left text-sm hover:bg-muted"
      onClick={onClick}
    >
      {label}
    </button>
  );
}
