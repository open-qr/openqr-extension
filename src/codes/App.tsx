import { useCallback, useEffect, useMemo, useState } from "react";
import { AccountChip } from "@/components/AccountChip";
import { ConnectCard } from "@/components/ConnectCard";
import { CopyImageButton } from "@/components/CopyImageButton";
import { DownloadMenu } from "@/components/DownloadMenu";
import { LazyThumb } from "@/components/LazyThumb";
import { OpsStrip, surfaceableOps } from "@/components/OpsStrip";
import { PayloadEditor } from "@/components/PayloadEditor";
import { QrPreview } from "@/components/QrPreview";
import { apiClient } from "@/lib/api";
import { submitOp } from "@/lib/coordinator";
import { chromePort, copyText, openTab, send, SITE_LINKS, useDevBaseUrl, useSettings, useStorageValue, useTheme, useToast } from "@/lib/hooks";
import { buildPayload, looksLikeHttpUrl } from "@/lib/payloads";
import { payloadTooLong, validateDestination } from "@/lib/guards";
import { KEYS, store } from "@/lib/store";
import type {
  AccountState,
  CodeRow,
  CodesCache,
  FieldValues,
  OpRecord,
  PayloadType,
  ScansResponse,
  StagedPayload,
} from "@/lib/types";

type Tab = "codes" | "settings" | "create";

export default function App() {
  useTheme();
  const { show, node: toastNode } = useToast();
  const params = new URLSearchParams(location.search);

  const [tab, setTab] = useState<Tab>(params.get("flow") === "create" ? "create" : "codes");
  const account = useStorageValue<AccountState | null>(KEYS.account, null);
  const ops = useStorageValue<Record<string, OpRecord>>(KEYS.ops, {});
  const cache = useStorageValue<CodesCache | null>(KEYS.codesCache, null);
  const apiKey = useStorageValue<string>(KEYS.apiKey, "");

  useEffect(() => {
    void send({ type: "sync-ops" }).catch(() => {});
  }, []);
  useEffect(() => {
    if (account && (!cache || cache.stale)) void send({ type: "refresh-cache" }).catch(() => {});
  }, [account, cache]);

  return (
    <div className="mx-auto max-w-4xl px-5 py-6">
      {toastNode}
      <header className="mb-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <img src="/icons/icon-32.png" width={28} height={28} alt="" />
          <h1 className="text-base font-semibold">OpenQR codes</h1>
        </div>
        <nav className="flex gap-1">
          <TabButton active={tab === "codes" || tab === "create"} onClick={() => setTab("codes")}>
            Codes
          </TabButton>
          <TabButton active={tab === "settings"} onClick={() => setTab("settings")}>
            Settings
          </TabButton>
        </nav>
      </header>

      {tab === "settings" ? (
        <SettingsPane account={account} />
      ) : tab === "create" ? (
        <CreatePane />
      ) : account ? (
        <CodesPane account={account} cache={cache} ops={ops} show={show} />
      ) : (
        <div className="space-y-4">
          <p className="note">
            Connect to see your saved and dynamic QR codes. Static generation works without an account from the toolbar.
          </p>
          <ConnectCard />
        </div>
      )}

      {account && (
        <footer className="mt-6 border-t border-border pt-3">
          <AccountChip account={account} onDisconnect={() => location.reload()} />
        </footer>
      )}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      className={`btn px-3 py-1.5 text-xs ${active ? "btn-primary" : "btn-ghost"}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Codes list + detail
// ---------------------------------------------------------------------------

type Filter = "all" | "dynamic" | "static" | "active" | "paused";

function CodesPane({
  account,
  cache,
  ops,
  show,
}: {
  account: AccountState;
  cache: CodesCache | null;
  ops: Record<string, OpRecord>;
  show: (m: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const items = useMemo(() => {
    const all = cache?.gen === account.sessionGen ? cache.items : [];
    const q = query.trim().toLowerCase();
    return all.filter((c) => {
      if (filter === "dynamic" && !c.dynamic) return false;
      if (filter === "static" && c.dynamic) return false;
      if (filter === "active" && c.status !== "active") return false;
      if (filter === "paused" && c.status !== "paused") return false;
      if (!q) return true;
      return (
        c.destination.toLowerCase().includes(q) ||
        (c.label ?? "").toLowerCase().includes(q) ||
        (c.short_url ?? "").toLowerCase().includes(q)
      );
    });
  }, [cache, account.sessionGen, query, filter]);

  const selected = items.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="space-y-4">
      <OpsStrip ops={surfaceableOps(ops)} onDismiss={() => {}} />

      <div className="flex flex-wrap items-center gap-2">
        <input
          className="input max-w-xs flex-1"
          placeholder="Search the codes shown"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {(["all", "dynamic", "static", "active", "paused"] as Filter[]).map((f) => (
          <button
            key={f}
            type="button"
            className={`badge cursor-pointer border px-2.5 py-1 ${
              filter === f ? "border-primary bg-accent text-fg" : "border-border bg-card text-muted-fg hover:bg-muted"
            }`}
            onClick={() => setFilter(f)}
          >
            {f}
          </button>
        ))}
        <button
          type="button"
          className="btn btn-secondary ml-auto px-3 py-1.5 text-xs"
          onClick={() => void send({ type: "refresh-cache" })}
        >
          Refresh
        </button>
      </div>

      {cache && (
        <p className="note">
          Recent codes: the newest {cache.items.length}
          {cache.items.length >= 500 ? " (the list stops at 500)" : ""}. Search covers the codes shown.
          {cache.stale ? " This list may be out of date; Refresh updates it." : ""}
        </p>
      )}

      {!cache || items.length === 0 ? (
        <p className="note">No codes match. Create one from any page with the OpenQR toolbar button.</p>
      ) : (
        <div className="card divide-y divide-border overflow-hidden">
          {items.map((c) => (
            <CodeListRow key={c.id} row={c} selected={c.id === selectedId} onSelect={() => setSelectedId(c.id)} />
          ))}
        </div>
      )}

      {selected && <CodeDetail row={selected} account={account} show={show} />}
    </div>
  );
}

function CodeListRow({ row, selected, onSelect }: { row: CodeRow; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      className={`flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted ${selected ? "bg-muted" : ""}`}
      onClick={onSelect}
    >
      <LazyThumb payload={row.dynamic ? (row.short_url ?? row.destination) : row.destination} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">
          {row.label || row.destination}
        </span>
        <span className="block truncate text-xs text-muted-fg">
          {row.dynamic ? `Dynamic · ${row.short_url ?? ""} → ${row.destination}` : `Static · ${row.type}`}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <span className="flex gap-1">
          {row.dynamic && <span className="badge bg-accent text-fg">dynamic</span>}
          {row.status === "paused" && <span className="badge bg-muted text-muted-fg">paused</span>}
        </span>
        <span className="text-[11px] text-muted-fg">{new Date(row.created_at).toLocaleDateString("en-GB")}</span>
      </span>
    </button>
  );
}

function CodeDetail({ row, account, show }: { row: CodeRow; account: AccountState; show: (m: string) => void }) {
  const payload = row.dynamic ? (row.short_url ?? row.destination) : row.destination;
  const [destination, setDestination] = useState(row.destination);
  const [scans, setScans] = useState<ScansResponse | null>(null);
  const [scansError, setScansError] = useState<string | null>(null);
  const apiKey = useStorageValue<string>(KEYS.apiKey, "");
  const baseUrl = useDevBaseUrl();

  useEffect(() => setDestination(row.destination), [row.id, row.destination]);

  useEffect(() => {
    if (!row.dynamic || !apiKey) return;
    let alive = true;
    setScans(null);
    setScansError(null);
    void apiClient(apiKey, baseUrl)
      .getScans(row.id, 30)
      .then(({ data }) => {
        if (alive) setScans(data);
      })
      .catch((e) => {
        if (alive) setScansError(e instanceof Error ? e.message : "Could not load scan analytics.");
      });
    return () => {
      alive = false;
    };
  }, [row.id, row.dynamic, apiKey, baseUrl]);

  const saveDestination = async () => {
    const verdict = validateDestination(destination);
    if (!verdict.ok) {
      show(verdict.hint);
      return;
    }
    await submitOp(chromePort(), (m) => send(m), "update_destination", { id: row.id, destination: verdict.url }, account.sessionGen);
    show("Saving the new destination…");
  };

  const toggleStatus = async () => {
    const next = row.status === "paused" ? "active" : "paused";
    await submitOp(chromePort(), (m) => send(m), "set_status", { id: row.id, status: next }, account.sessionGen);
    show(next === "paused" ? "Pausing…" : "Resuming…");
  };

  const destError = row.dynamic ? payloadTooLong(destination) : null;

  return (
    <section className="card mt-4 grid gap-6 p-5 md:grid-cols-[auto_1fr]">
      <div className="space-y-3">
        <QrPreview payload={payload} size={208} />
        <div className="flex gap-2">
          <CopyImageButton payload={payload} />
          <DownloadMenu payload={payload} />
        </div>
        <button
          type="button"
          className="btn btn-ghost w-full px-2 py-1.5 text-xs"
          onClick={async () => {
            (await copyText(payload)) ? show("Copied") : show("Could not copy");
          }}
        >
          Copy {row.dynamic ? "short URL" : "payload"}
        </button>
      </div>

      <div className="min-w-0 space-y-5">
        <div className="space-y-2">
          <h2 className="text-sm font-semibold">{row.label || (row.dynamic ? "Dynamic QR code" : `Static ${row.type} code`)}</h2>
          {row.dynamic ? (
            <>
              <label className="block space-y-1">
                <span className="label">Destination</span>
                <div className="flex gap-2">
                  <input
                    className="input font-mono text-[13px]"
                    value={destination}
                    spellCheck={false}
                    onChange={(e) => setDestination(e.target.value)}
                  />
                  <button type="button" className="btn btn-primary shrink-0" onClick={() => void saveDestination()}>
                    Save
                  </button>
                </div>
              </label>
              {destError && <p className="note text-destructive">{destError}</p>}
              <p className="note">
                Changing the destination keeps this printed code working: it redirects through OpenQR.
                Changing the short link itself can break printed codes, so that stays in the dashboard.
              </p>
              <div className="flex gap-2">
                <button type="button" className="btn btn-secondary" onClick={() => void toggleStatus()}>
                  {row.status === "paused" ? "Resume" : "Pause"}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => openTab(`https://openqr.uk/dashboard/${row.id}?utm_source=openqr-extension`)}
                >
                  Open in dashboard
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="break-all rounded-lg bg-muted px-3 py-2 font-mono text-xs">{row.destination}</p>
              <p className="note">
                A static QR code holds its content directly. Changing it means creating a new QR image:
                this one always points at what you see above. Static codes have no scan analytics.
              </p>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => openTab(`https://openqr.uk/dashboard/${row.id}?utm_source=openqr-extension`)}
              >
                Open in dashboard
              </button>
            </>
          )}
        </div>

        {row.dynamic && (
          <div className="space-y-2 border-t border-border pt-4">
            <h3 className="label">Scan analytics</h3>
            {scansError && <p className="note text-destructive">{scansError}</p>}
            {!scans && !scansError && <p className="note">Loading scans…</p>}
            {scans && (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Stat label="Total scans" value={scans.scans.total.toLocaleString("en-GB")} />
                  <Stat label="Last 7 days" value={scans.scans.last7.toLocaleString("en-GB")} />
                  <Stat label="Window" value={`${scans.analytics.days_window} days`} />
                  {scans.scans.topCountry && <Stat label="Top country" value={scans.scans.topCountry} />}
                  {scans.scans.topDevice && <Stat label="Top device" value={scans.scans.topDevice} />}
                </div>
                <Sparkline daily={scans.analytics.daily} />
                {!scans.analytics.by_device && (
                  <p className="note">
                    Detailed breakdowns (device, referrer, region) live in the dashboard with Pro.{" "}
                    <button type="button" className="underline" onClick={() => openTab(SITE_LINKS.pricing)}>
                      See plans
                    </button>
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted px-3 py-2">
      <p className="text-[11px] text-muted-fg">{label}</p>
      <p className="text-sm font-semibold">{value}</p>
    </div>
  );
}

/** Hand-rolled SVG sparkline, the house chart pattern. */
function Sparkline({ daily }: { daily: Array<{ day: string; n: number }> }) {
  if (daily.length === 0) return null;
  const w = 480;
  const h = 80;
  const max = Math.max(...daily.map((d) => d.n), 1);
  const step = daily.length > 1 ? w / (daily.length - 1) : w;
  const points = daily.map((d, i) => `${i * step},${h - (d.n / max) * (h - 8) - 4}`);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-20 w-full" role="img" aria-label="Scans per day">
      <polyline points={points.join(" ")} fill="none" stroke="var(--primary)" strokeWidth="2" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Create flow (context-menu window)
// ---------------------------------------------------------------------------

function CreatePane() {
  const { show, node } = useToast();
  const account = useStorageValue<AccountState | null>(KEYS.account, null);
  const [editor, setEditor] = useState<{ type: PayloadType; fields: FieldValues } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [staged, setStaged] = useState<StagedPayload | null>(null);

  // Consume the staged payload once, unless an unsaved draft exists.
  useEffect(() => {
    void store.staging.get(chromePort()).then((s) => {
      if (s && Date.now() - s.createdAt < 60_000) setStaged(s);
    });
  }, []);
  useEffect(() => {
    if (!staged || editor) return;
    if (dirty) return; // never silently overwrite an unsaved draft
    if (staged.kind === "url") {
      setEditor({ type: "url", fields: { url: staged.value } });
    } else {
      setEditor({ type: "text", fields: { text: staged.value } });
    }
    void store.staging.clear(chromePort());
  }, [staged, editor, dirty]);

  const payload = editor ? buildPayload(editor.type, editor.fields) : "";
  const lengthError = payload ? payloadTooLong(payload) : null;

  return (
    <div className="mx-auto max-w-md space-y-4 p-2">
      {node}
      <h1 className="text-sm font-semibold">Create a QR code</h1>
      <PayloadEditor
        type={editor?.type ?? "url"}
        fields={editor?.fields ?? {}}
        onChange={(next) => {
          setEditor(next);
          setDirty(true);
        }}
      />
      {lengthError && <p className="note text-destructive">{lengthError}</p>}
      <div className="flex justify-center">
        <QrPreview payload={payload} size={208} />
      </div>
      <div className="flex gap-2">
        <CopyImageButton payload={payload} />
        <DownloadMenu payload={payload} />
        {looksLikeHttpUrl(payload) && account && (
          <button
            type="button"
            className="btn btn-secondary"
            disabled={!!lengthError}
            onClick={async () => {
              const verdict = validateDestination(String(editor?.fields.url ?? ""));
              if (!verdict.ok) {
                show(verdict.hint);
                return;
              }
              await submitOp(chromePort(), (m) => send(m), "create_dynamic", { destination: verdict.url }, account.sessionGen);
              show("Creating a dynamic QR code…");
            }}
          >
            Make dynamic
          </button>
        )}
      </div>
      <p className="note">
        Static codes are generated on this device and never touch the network. Dynamic codes redirect through OpenQR and stay editable.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

function SettingsPane({ account }: { account: AccountState | null }) {
  const { settings, save } = useSettings();
  const dev = __EXT_DEV__;

  return (
    <div className="max-w-lg space-y-6">
      <section className="card space-y-3 p-4">
        <h2 className="text-sm font-semibold">Appearance</h2>
        <div className="flex gap-1.5">
          {(["system", "light", "dark"] as const).map((t) => (
            <button
              key={t}
              type="button"
              className={`badge cursor-pointer border px-3 py-1.5 ${
                settings.theme === t ? "border-primary bg-accent text-fg" : "border-border bg-card text-muted-fg hover:bg-muted"
              }`}
              onClick={() => save({ theme: t })}
            >
              {t}
            </button>
          ))}
        </div>
        <p className="note">The QR preview always sits on a white plate, so it matches the exported image.</p>
      </section>

      {account ? (
        <section className="card space-y-3 p-4">
          <h2 className="text-sm font-semibold">Connection</h2>
          <p className="text-sm">{account.email}</p>
          <p className="note">
            Your API key is stored on this device only. Disconnect clears it here; Revoke access
            retires the key on the server (dashboard).
          </p>
          <div className="flex gap-2">
            <DisconnectButton />
            <a className="btn btn-secondary" href={SITE_LINKS.dashboardKeys} target="_blank" rel="noreferrer">
              Manage keys
            </a>
          </div>
        </section>
      ) : (
        <ConnectCard />
      )}

      {dev && (
        <section className="card space-y-2 p-4">
          <h2 className="text-sm font-semibold">Developer</h2>
          <label className="block space-y-1">
            <span className="label">API base URL (dev builds only)</span>
            <input
              className="input font-mono text-[13px]"
              placeholder="http://localhost:3011"
              value={settings.baseUrl ?? ""}
              onChange={(e) => save({ baseUrl: e.target.value.trim() || undefined })}
            />
          </label>
          <p className="note">Production builds always talk to https://openqr.uk.</p>
        </section>
      )}

      <section className="card space-y-2 p-4">
        <h2 className="text-sm font-semibold">Privacy</h2>
        <p className="note">
          The extension talks only to openqr.uk. It contains no analytics. Static QR codes are
          generated entirely on this device.{" "}
          <a className="underline" href={SITE_LINKS.privacy} target="_blank" rel="noreferrer">
            Privacy policy
          </a>
          .
        </p>
      </section>
    </div>
  );
}

function DisconnectButton() {
  return (
    <button
      type="button"
      className="btn btn-danger"
      onClick={async () => {
        await store.account.disconnect(chromePort());
        location.reload();
      }}
    >
      Disconnect on this device
    </button>
  );
}
