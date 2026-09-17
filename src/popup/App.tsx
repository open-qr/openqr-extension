import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AccountChip } from "@/components/AccountChip";
import { ConnectCard } from "@/components/ConnectCard";
import { CopyImageButton } from "@/components/CopyImageButton";
import { DownloadMenu } from "@/components/DownloadMenu";
import { OpsStrip, surfaceableOps } from "@/components/OpsStrip";
import { PayloadEditor } from "@/components/PayloadEditor";
import { QrPreview } from "@/components/QrPreview";
import { submitOp } from "@/lib/coordinator";
import { describeStoredError } from "@/lib/errors";
import { chromePort, copyText, openTab, send, SITE_LINKS, useTheme, useToast } from "@/lib/hooks";
import { buildPayload, looksLikeHttpUrl } from "@/lib/payloads";
import { payloadTooLong, validateDestination } from "@/lib/guards";
import { store } from "@/lib/store";
import type {
  AccountState,
  CodesCache,
  Draft,
  FieldValues,
  OpRecord,
  OpState,
  PayloadType,
} from "@/lib/types";
import { KEYS } from "@/lib/store";
import { useStorageValue } from "@/lib/hooks";

export default function App() {
  useTheme();
  const { show, node: toastNode } = useToast();

  const account = useStorageValue<AccountState | null>(KEYS.account, null);
  const ops = useStorageValue<Record<string, OpRecord>>(KEYS.ops, {});
  const codesCache = useStorageValue<CodesCache | null>(KEYS.codesCache, null);

  const [tabUrl, setTabUrl] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ type: PayloadType; fields: FieldValues } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [dynamicOpId, setDynamicOpId] = useState<string | null>(null);
  const hydrated = useRef(false);

  // Current tab URL via activeTab (granted by the action click that opened
  // this popup). chrome:// and store pages grant nothing: degrade to a hint.
  useEffect(() => {
    let alive = true;
    const devUrl = import.meta.env.DEV ? new URLSearchParams(location.search).get("url") : null;
    if (devUrl != null) {
      setTabUrl(devUrl);
      return;
    }
    void chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      if (alive) setTabUrl(typeof tab?.url === "string" && tab.url.startsWith("http") ? tab.url : "");
    });
    return () => {
      alive = false;
    };
  }, []);

  // Hydrate the draft once the tab URL is known: manual edits survive popup
  // reopen on the same tab; a different tab starts fresh.
  useEffect(() => {
    if (tabUrl === null || editor || hydrated.current) return;
    hydrated.current = true;
    void store.draft.get(chromePort()).then((draft) => {
      if (draft && draft.dirty && draft.tabUrl === tabUrl) {
        setEditor({ type: draft.type, fields: draft.fields });
      } else {
        setEditor({ type: "url", fields: tabUrl ? { url: tabUrl } : {} });
      }
    });
  }, [tabUrl, editor]);

  // Persist the draft (debounced).
  useEffect(() => {
    if (!editor || tabUrl === null) return;
    const t = setTimeout(() => {
      const draft: Draft = {
        tabUrl,
        type: editor.type,
        value: "",
        fields: editor.fields,
        dirty,
        updatedAt: Date.now(),
      };
      void store.draft.save(chromePort(), draft);
    }, 400);
    return () => clearTimeout(t);
  }, [editor, dirty, tabUrl]);

  const payload = useMemo(
    () => (editor ? buildPayload(editor.type, editor.fields) : ""),
    [editor],
  );
  const lengthError = payload ? payloadTooLong(payload) : null;
  const actionsDisabled = !payload || lengthError != null;

  // Refresh the codes cache on open when connected (single writer: background).
  useEffect(() => {
    if (account && (!codesCache || codesCache.stale)) {
      void send({ type: "refresh-cache" }).catch(() => {});
    }
  }, [account, codesCache]);

  const dynamicOp = dynamicOpId ? ops[dynamicOpId] : undefined;
  const dynamicDone =
    dynamicOp?.state === "done" && typeof dynamicOp.result?.short_url === "string"
      ? String(dynamicOp.result.short_url)
      : null;
  const dynamicFailed = dynamicOp?.state === "failed" ? dynamicOp : null;
  const dynamicActive =
    dynamicOp && (dynamicOp.state === "pending" || dynamicOp.state === "sent" || dynamicOp.state === "uncertain")
      ? dynamicOp
      : null;

  const makeEditable = useCallback(async () => {
    if (!account) {
      document.getElementById("connect")?.scrollIntoView({ behavior: "smooth" });
      show("Connect OpenQR first, then dynamic codes are one click.");
      return;
    }
    if (!editor) return;
    const verdict = validateDestination(String(editor.fields.url ?? ""));
    if (!verdict.ok) {
      show(verdict.hint);
      return;
    }
    const op = await submitOp(
      chromePort(),
      (m) => send(m),
      "create_dynamic",
      { destination: verdict.url },
      account.sessionGen,
    );
    setDynamicOpId(op.opId);
  }, [account, editor, show]);

  const saveToAccount = useCallback(async () => {
    if (!account || !editor) return;
    await submitOp(
      chromePort(),
      (m) => send(m),
      "create_static",
      { type: editor.type, fields: editor.fields },
      account.sessionGen,
    );
    show("Saving to your OpenQR account…");
  }, [account, editor, show]);

  const signedWarning = useMemo(() => {
    if (editor?.type !== "url") return false;
    const verdict = validateDestination(String(editor.fields.url ?? ""));
    return verdict.ok && verdict.signedUrlWarning;
  }, [editor]);

  const wifiType = editor?.type === "wifi";

  return (
    <div className="flex min-h-[560px] flex-col gap-4 p-4">
      {toastNode}

      {dynamicDone ? (
        <DynamicResult
          shortUrl={dynamicDone}
          onBack={() => setDynamicOpId(null)}
          show={show}
        />
      ) : (
        <>
          <header className="flex items-center justify-between">
            <h1 className="text-sm font-semibold">
              {dynamicActive ? "Creating your dynamic QR code…" : "QR code"}
            </h1>
            {dynamicActive && (
              <span className="badge bg-accent text-fg">{stateLabel(dynamicActive.state)}</span>
            )}
          </header>

          <div className="flex justify-center py-1">
            <QrPreview payload={payload} />
          </div>

          <PayloadEditor
            type={editor?.type ?? "url"}
            fields={editor?.fields ?? {}}
            onChange={(next) => {
              setEditor(next);
              setDirty(true);
            }}
          />

          {lengthError && <p className="note text-destructive">{lengthError}</p>}
          {tabUrl === "" && !dirty && (
            <p className="note">
              This page does not expose its address to extensions. Paste one above.
            </p>
          )}
          {signedWarning && (
            <p className="note">
              This looks like a signed link. These expire: a dynamic QR code lets you replace the destination later.
            </p>
          )}

          <div className="flex gap-2">
            <CopyImageButton payload={actionsDisabled ? "" : payload} />
            <DownloadMenu payload={actionsDisabled ? "" : payload} />
          </div>

          {looksLikeHttpUrl(payload) && (
            <section className="card space-y-2 p-4">
              <button type="button" className="btn btn-secondary w-full" disabled={actionsDisabled || !!dynamicActive} onClick={() => void makeEditable()}>
                {dynamicActive ? "Working…" : "Make editable and view scans"}
              </button>
              <p className="note">
                Creates a dynamic QR code with a short URL that redirects through OpenQR, so you can change the destination after printing and see scan analytics.
              </p>
              {dynamicFailed && (
                <CapOrError op={dynamicFailed} />
              )}
            </section>
          )}

          {account && (
            <button type="button" className="btn btn-ghost w-full text-sm" disabled={actionsDisabled} onClick={() => void saveToAccount()}>
              Save to OpenQR
            </button>
          )}
          {account && wifiType && (
            <p className="note">
              Saving a Wi-Fi code stores the network password inside the QR payload on OpenQR's servers.
            </p>
          )}
        </>
      )}

      <OpsStrip ops={surfaceableOps(ops)} onDismiss={() => show("Dismissed")} />

      {account ? (
        <RecentCodes cache={codesCache} />
      ) : (
        <div className="mt-auto">
          <ConnectCard />
        </div>
      )}

      <footer className="mt-auto flex items-center justify-between border-t border-border pt-2.5">
        {account ? (
          <AccountChip account={account} onDisconnect={() => show("Disconnected on this device")} />
        ) : (
          <span className="note">Static codes never leave this device.</span>
        )}
        <button type="button" className="btn btn-ghost px-2 py-1 text-xs" onClick={() => openTab(chrome.runtime.getURL("codes.html"))}>
          All codes
        </button>
      </footer>
    </div>
  );
}

function stateLabel(s: OpState): string {
  return s === "pending" ? "sending" : s === "sent" ? "waiting" : "checking";
}

function CapOrError({ op }: { op: OpRecord }) {
  const ui = describeStoredError(op.error);
  if (op.error?.code === "plan_limit_exceeded") {
    return (
      <div className="space-y-2 rounded-lg bg-accent p-3">
        <p className="text-sm font-medium">{ui.title}</p>
        <p className="note">{ui.body}</p>
        <div className="flex gap-2">
          <button type="button" className="btn btn-primary px-3 py-1.5 text-xs" onClick={() => openTab(SITE_LINKS.pricing)}>
            Upgrade
          </button>
          <button type="button" className="btn btn-secondary px-3 py-1.5 text-xs" onClick={() => openTab(chrome.runtime.getURL("codes.html"))}>
            Pause a code
          </button>
        </div>
      </div>
    );
  }
  return <p className="note text-destructive">{op.error?.message ?? ui.title}</p>;
}

function DynamicResult({
  shortUrl,
  onBack,
  show,
}: {
  shortUrl: string;
  onBack: () => void;
  show: (m: string) => void;
}) {
  return (
    <>
      <header className="flex items-center justify-between">
        <h1 className="text-sm font-semibold">Dynamic QR code ready</h1>
        <button type="button" className="btn btn-ghost px-2 py-1 text-xs" onClick={onBack}>
          Back
        </button>
      </header>
      <div className="flex justify-center py-1">
        <QrPreview payload={shortUrl} />
      </div>
      <p className="note text-center">
        This code redirects through OpenQR. Edit the destination any time; the printed code keeps working.
      </p>
      <div className="flex gap-2">
        <CopyImageButton payload={shortUrl} />
        <DownloadMenu payload={shortUrl} />
      </div>
      <button
        type="button"
        className="btn btn-secondary w-full"
        onClick={async () => {
          (await copyText(shortUrl)) ? show("Short URL copied") : show("Could not copy");
        }}
      >
        Copy short URL
      </button>
    </>
  );
}

function RecentCodes({ cache }: { cache: CodesCache | null }) {
  if (!cache || cache.items.length === 0) return null;
  const items = cache.items.slice(0, 5);
  return (
    <section className="space-y-1.5">
      <div className="flex items-center justify-between">
        <h2 className="label">Recent codes</h2>
      </div>
      <div className="card divide-y divide-border">
        {items.map((c) => (
          <button
            key={c.id}
            type="button"
            className="flex w-full items-center justify-between gap-2 px-3.5 py-2 text-left hover:bg-muted"
            onClick={() => openTab(chrome.runtime.getURL("codes.html"))}
          >
            <span className="min-w-0">
              <span className="block truncate text-sm">{c.label || (c.dynamic ? c.destination : c.destination)}</span>
              <span className="block truncate text-[11px] text-muted-fg">
                {c.dynamic ? `Dynamic · ${c.short_url ?? ""}` : `Static · ${typeLabel(c.type)}`}
              </span>
            </span>
            {c.status === "paused" && <span className="badge bg-muted text-muted-fg">paused</span>}
          </button>
        ))}
      </div>
    </section>
  );
}

function typeLabel(t: string): string {
  return t.charAt(0).toUpperCase() + t.slice(1);
}
