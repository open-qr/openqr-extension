import { useState } from "react";
import { apiClient, looksLikeApiKey } from "@/lib/api";
import { chromePort, openTab, send, SITE_LINKS, useDevBaseUrl } from "@/lib/hooks";
import { store } from "@/lib/store";

/**
 * Beta connect flow: the key can only be minted on the website, so this walks
 * the user there, then takes the pasted key. The extension encourages a NEW
 * key (keys are revocable independently), and says plainly that it lives on
 * this device.
 */
export function ConnectCard({ onConnected, compact }: { onConnected?: () => void; compact?: boolean }) {
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const baseUrl = useDevBaseUrl();

  async function connect() {
    const k = key.trim();
    setError(null);
    if (!looksLikeApiKey(k)) {
      setError("That does not look like an OpenQR key. Keys start with oqr_.");
      return;
    }
    setBusy(true);
    try {
      const { data } = await apiClient(k, baseUrl).me();
      await store.account.connect(chromePort(), k, data);
      await send({ type: "connected" });
      onConnected?.();
    } catch (e) {
      setError(
        e instanceof Error && e.message
          ? `The key was not accepted: ${e.message}`
          : "The key was not accepted. Check it and try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="connect" className={compact ? "" : "card space-y-3 p-4"}>
      {!compact && (
        <div className="space-y-1">
          <h2 className="text-sm font-semibold">Connect OpenQR</h2>
          <p className="note">
            Dynamic QR codes stay editable and count scans. They redirect through OpenQR, so you can change the destination after printing.
          </p>
        </div>
      )}
      <button
        type="button"
        className="btn btn-secondary w-full"
        onClick={() => openTab(SITE_LINKS.dashboardKeys)}
      >
        Open openqr.uk to create a free key
      </button>
      <p className="note">
        In the dashboard, create a new key for this extension (name it "Chrome extension"). Keys can be revoked on their own, without touching anything else.
      </p>
      <div className="space-y-1.5">
        <input
          className="input font-mono text-[13px]"
          placeholder="Paste your key (oqr_…)"
          value={key}
          spellCheck={false}
          onChange={(e) => setKey(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void connect();
          }}
        />
        {error && <p className="note text-destructive">{error}</p>}
        <button type="button" className="btn btn-primary w-full" disabled={busy} onClick={() => void connect()}>
          {busy ? "Checking key…" : "Connect"}
        </button>
      </div>
      <p className="note">
        The key is stored on this device only.{" "}
        <button type="button" className="underline hover:text-fg" onClick={() => openTab(SITE_LINKS.privacy)}>
          Privacy
        </button>
      </p>
    </section>
  );
}
