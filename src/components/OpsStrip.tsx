import { useEffect } from "react";
import { chromePort, send } from "@/lib/hooks";
import { store } from "@/lib/store";
import { describeStoredError } from "@/lib/errors";
import type { OpRecord } from "@/lib/types";

const OP_LABEL: Record<OpRecord["kind"], string> = {
  create_dynamic: "Dynamic QR code",
  create_static: "Saved QR code",
  update_destination: "Destination change",
  set_status: "Pause or resume",
};

/**
 * Pending / uncertain / failed operations, with recovery actions.
 * "uncertain" is the honest state: the request may have landed, so the only
 * safe moves are replay-via-idempotency ("Check") or dismiss.
 */
export function OpsStrip({ ops, onDismiss }: { ops: OpRecord[]; onDismiss: (opId: string) => void }) {
  useEffect(() => {
    // Surfaces drive the stale scan: the background may have died mid-flight.
    void send({ type: "sync-ops" }).catch(() => {});
  }, []);

  if (ops.length === 0) return null;

  return (
    <section className="space-y-2">
      {ops.map((op) => (
        <OpRow key={op.opId} op={op} onDismiss={onDismiss} />
      ))}
    </section>
  );
}

function OpRow({ op, onDismiss }: { op: OpRecord; onDismiss: (opId: string) => void }) {
  const label = OP_LABEL[op.kind];
  const check = () => void send({ type: "check-op", opId: op.opId }).catch(() => {});
  const dismiss = async () => {
    await store.ops.dismiss(chromePort(), op.opId);
    onDismiss(op.opId);
  };

  return (
    <div className="card flex items-center justify-between gap-2 px-3.5 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{label}</p>
        {op.state === "pending" && <p className="note">Sending…</p>}
        {op.state === "sent" && <p className="note">Waiting for OpenQR…</p>}
        {op.state === "uncertain" && (
          <p className="note text-fg">
            Not sure this went through. Check replays it safely; it cannot create a duplicate.
          </p>
        )}
        {op.state === "failed" && (
          <p className="note text-destructive">{describeStoredError(op.error).title}</p>
        )}
        {op.state === "done" && (
          <p className="note text-fg">
            Done{op.result && "_meta" in op.result && (op.result._meta as { idempotentReplay?: boolean }).idempotentReplay
              ? " (replayed: nothing was duplicated)"
              : ""}
            {op.result?.short_url ? ` · ${String(op.result.short_url)}` : ""}
          </p>
        )}
      </div>
      <div className="flex shrink-0 gap-1.5">
        {(op.state === "uncertain" || op.state === "sent") && (
          <button type="button" className="btn btn-secondary px-2.5 py-1.5 text-xs" onClick={check}>
            Check
          </button>
        )}
        {op.state !== "pending" && op.state !== "sent" && (
          <button type="button" className="btn btn-ghost px-2 py-1.5 text-xs" onClick={() => void dismiss()}>
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
}

/** Ops worth surfacing: everything not yet terminal, plus the newest few terminal ones. */
export function surfaceableOps(all: Record<string, OpRecord> | undefined): OpRecord[] {
  if (!all) return [];
  const list = Object.values(all).sort((a, b) => b.createdAt - a.createdAt);
  const active = list.filter((o) => o.state === "pending" || o.state === "sent" || o.state === "uncertain");
  const recent = list.filter((o) => o.state === "done" || o.state === "failed").slice(0, 2);
  return [...active, ...recent];
}
