import { useState } from "react";
import { chromePort, openTab, SITE_LINKS } from "@/lib/hooks";
import { store } from "@/lib/store";
import type { AccountState } from "@/lib/types";

/**
 * Compact account strip: who is connected, how much of the plan is in use,
 * and the disconnect/revoke distinction (disconnect clears this device;
 * revoke kills the key on the server).
 */
export function AccountChip({ account, onDisconnect }: { account: AccountState; onDisconnect: () => void }) {
  const [open, setOpen] = useState(false);
  const me = account.me;
  const cap = me.limits?.dynamic_codes;
  const used = me.usage?.active_dynamic;
  const meter =
    used != null ? (cap == null ? `${used} active` : `${used} of ${cap} active dynamic`) : null;

  return (
    <div className="relative">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 rounded-lg px-1.5 py-1 text-left hover:bg-muted"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-xs font-medium">{account.email}</span>
          {meter && <span className="text-[11px] text-muted-fg">{meter}</span>}
        </span>
        <span className="badge bg-accent text-fg">
          {typeof me.plan === "string" && me.plan ? me.plan : "connected"}
        </span>
      </button>

      {open && (
        <div className="card absolute inset-x-0 bottom-full z-40 mb-1.5 overflow-hidden py-1 shadow-lg">
          <MenuItem
            label="Recent codes"
            onClick={() => openTab(chrome.runtime.getURL("codes.html"))}
          />
          <MenuItem label="Manage keys" onClick={() => openTab(SITE_LINKS.dashboardKeys)} />
          <MenuItem
            label="Disconnect on this device"
            onClick={async () => {
              await store.account.disconnect(chromePort());
              onDisconnect();
            }}
          />
          <MenuItem label="Revoke access (dashboard)" onClick={() => openTab(SITE_LINKS.dashboardKeys)} />
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
