/**
 * The background coordinator: the single writer for every mutation and the
 * codes cache. UI surfaces persist an op record FIRST, then hand it to the
 * coordinator (chrome.runtime message), so a popup closing mid-request loses
 * nothing: the outcome lands in storage and every surface re-renders.
 *
 * State machine:
 *   pending → sent → done | failed | uncertain
 * "uncertain" means the request may or may not have reached the server
 * (network failure, timeout, service-worker termination). It is never
 * auto-retried: the UI offers "Check what happened", which replays the SAME
 * idempotency key (creates) or re-sends the naturally-idempotent patch, so a
 * replay can only ever produce one code.
 */
import { ApiError, apiClient } from "./api";
import { store, type StoragePort } from "./store";
import type { OpRecord, RateMeta } from "./types";

/** A "sent" op with no resolution after this long is surfaced as uncertain. */
export const STALE_SENT_MS = 30_000;

export interface SendMessage {
  (message: unknown): Promise<unknown>;
}

/** Persist a new pending op and kick the coordinator. UI-side entry point. */
export async function submitOp(
  port: StoragePort,
  send: SendMessage,
  kind: OpRecord["kind"],
  input: Record<string, unknown>,
  gen: string,
): Promise<OpRecord> {
  const opId = newOpId();
  const op: OpRecord = {
    opId,
    kind,
    gen,
    input,
    idempotencyKey:
      kind === "create_dynamic" || kind === "create_static" ? `openqr-ext-${opId}` : undefined,
    state: "pending",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await store.ops.put(port, op);
  // Fire and observe: the op record, not this reply, is the source of truth.
  void send({ type: "run-op", opId }).catch(() => {
    // The background may wake late or the popup may close here; the record
    // survives and 'sync-ops' on next surface mount picks it up.
  });
  return op;
}

export function newOpId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

async function effectiveBaseUrl(port: StoragePort): Promise<string | undefined> {
  if (!__EXT_DEV__) return undefined;
  const s = await store.settings.get(port);
  return s?.baseUrl;
}

/** Run (or replay) an op. Background-side entry point. */
export async function runOp(port: StoragePort, opId: string): Promise<void> {
  const all = await store.ops.get(port);
  const op = all?.[opId];
  if (!op || op.state === "done" || op.state === "failed") return;

  const apiKey = await store.apiKey.get(port);
  const account = await store.account.get(port);
  // A disconnect between submit and run means the op is void.
  if (!apiKey || !account || account.sessionGen !== op.gen) {
    await store.ops.put(port, { ...op, state: "failed", updatedAt: Date.now(), error: { message: "Disconnected before this ran." } });
    return;
  }

  const api = apiClient(apiKey, await effectiveBaseUrl(port));
  await store.ops.put(port, { ...op, state: "sent", updatedAt: Date.now() });

  try {
    const { data, meta } = await execute(api, op);
    await store.ops.put(port, {
      ...op,
      state: "done",
      updatedAt: Date.now(),
      result: { ...(data as Record<string, unknown>), _meta: meta },
    });
    await refreshCache(port);
  } catch (e) {
    if (e instanceof ApiError) {
      await store.ops.put(port, {
        ...op,
        state: "failed",
        updatedAt: Date.now(),
        error: { status: e.status, code: e.code, message: e.message, retryAfter: e.meta.retryAfter },
      });
    } else {
      // TypeError / abort / timeout: the request may have landed. Uncertain.
      await store.ops.put(port, { ...op, state: "uncertain", updatedAt: Date.now() });
    }
  }
}

type ApiLike = ReturnType<typeof apiClient>;

async function execute(api: ApiLike, op: OpRecord): Promise<{ data: unknown; meta: RateMeta }> {
  switch (op.kind) {
    case "create_dynamic":
      return api.createDynamic(op.input as { destination: string; label?: string }, op.idempotencyKey);
    case "create_static":
      return api.createStatic(
        op.input as Parameters<ApiLike["createStatic"]>[0],
        op.idempotencyKey,
      );
    case "update_destination":
      return api.updateDynamic(String(op.input.id), {
        destination: String(op.input.destination),
      });
    case "set_status":
      return api.updateDynamic(String(op.input.id), {
        status: op.input.status === "paused" ? "paused" : "active",
      });
  }
}

/** Single-writer cache refresh. A failure keeps old items and marks them stale. */
export async function refreshCache(port: StoragePort): Promise<void> {
  const apiKey = await store.apiKey.get(port);
  const account = await store.account.get(port);
  if (!apiKey || !account) return;
  try {
    const api = apiClient(apiKey, await effectiveBaseUrl(port));
    const { data } = await api.listCodes(500);
    await store.codesCache.write(port, account.sessionGen, data.codes);
  } catch {
    await store.codesCache.markStale(port);
  }
}

/** Promote "sent" ops that never resolved (SW death, lost message) to uncertain. */
export async function markStaleOps(port: StoragePort): Promise<void> {
  const all = await store.ops.get(port);
  if (!all) return;
  const now = Date.now();
  for (const op of Object.values(all)) {
    if (op.state === "sent" && now - op.updatedAt > STALE_SENT_MS) {
      await store.ops.put(port, { ...op, state: "uncertain", updatedAt: now });
    }
  }
}
