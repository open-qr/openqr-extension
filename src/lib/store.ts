/**
 * Storage layer over chrome.storage (local + session), written so the logic
 * runs unchanged under a fake port in tests.
 *
 * Layout (local): settings, apiKey, account, codesCache, ops, draft.
 * Layout (session): staging (context-menu payload), createWindowId.
 *
 * The API key lives in chrome.storage.local only: never in storage.sync, and
 * local storage is plaintext in the browser profile (the privacy copy says
 * so; setAccessLevel in background.ts keeps content scripts out of it).
 * Account-scoped data is stamped with account.sessionGen; a mismatch means
 * the entry belongs to a previous connection and must be discarded.
 */
import type {
  AccountState,
  CodesCache,
  CodeRow,
  Draft,
  MeResponse,
  OpRecord,
  Settings,
  StagedPayload,
} from "./types";

export interface StorageArea {
  get(keys: string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string[]): Promise<void>;
}

export interface StoragePort {
  local: StorageArea;
  session: StorageArea;
  onChanged: {
    addListener(cb: (changes: Record<string, unknown>, area: string) => void): void;
    removeListener(cb: (changes: Record<string, unknown>, area: string) => void): void;
  };
}

export const KEYS = {
  settings: "settings",
  apiKey: "apiKey",
  account: "account",
  codesCache: "codesCache",
  ops: "ops",
  draft: "draft",
  staging: "staging",
  createWindowId: "createWindowId",
} as const;

export const DEFAULT_SETTINGS: Settings = { theme: "system" };

export function newSessionGen(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

async function read<T>(area: StorageArea, key: string): Promise<T | undefined> {
  const items = await area.get([key]);
  return items[key] as T | undefined;
}

export const store = {
  settings: {
    get: (p: StoragePort) => read<Settings>(p.local, KEYS.settings),
    save: async (p: StoragePort, s: Settings) => {
      await p.local.set({ [KEYS.settings]: s });
    },
  },

  apiKey: {
    get: (p: StoragePort) => read<string>(p.local, KEYS.apiKey),
  },

  account: {
    get: (p: StoragePort) => read<AccountState>(p.local, KEYS.account),
    /** Stores the key + account atomically-ish: key first so a crash between
     *  the two writes can only leave a key without an account (recoverable
     *  by reconnect), never an account without its key. */
    connect: async (p: StoragePort, apiKey: string, me: MeResponse) => {
      await p.local.set({ [KEYS.apiKey]: apiKey });
      const account: AccountState = {
        sessionGen: newSessionGen(),
        email: me.email,
        name: me.name,
        me,
        connectedAt: Date.now(),
      };
      await p.local.set({ [KEYS.account]: account });
      return account;
    },
    /** Disconnect on this device: clears every account-scoped key, cache and
     *  pending operation immediately. The key survives on the server; use
     *  "Revoke access" (dashboard) to kill it. */
    disconnect: async (p: StoragePort) => {
      await p.local.remove([KEYS.apiKey, KEYS.account, KEYS.codesCache, KEYS.ops]);
    },
  },

  codesCache: {
    get: (p: StoragePort) => read<CodesCache>(p.local, KEYS.codesCache),
    /** Background coordinator is the single writer of the codes cache. */
    write: async (p: StoragePort, gen: string, items: CodeRow[]) => {
      const cache: CodesCache = { gen, items, fetchedAt: Date.now() };
      await p.local.set({ [KEYS.codesCache]: cache });
    },
    markStale: async (p: StoragePort) => {
      const c = await read<CodesCache>(p.local, KEYS.codesCache);
      if (c && !c.stale) await p.local.set({ [KEYS.codesCache]: { ...c, stale: true } });
    },
  },

  ops: {
    get: (p: StoragePort) => read<Record<string, OpRecord>>(p.local, KEYS.ops),
    put: async (p: StoragePort, op: OpRecord) => {
      const all = (await read<Record<string, OpRecord>>(p.local, KEYS.ops)) ?? {};
      all[op.opId] = op;
      await p.local.set({ [KEYS.ops]: pruneOps(all) });
    },
    /** Remove a terminal op (user dismissed it). */
    dismiss: async (p: StoragePort, opId: string) => {
      const all = (await read<Record<string, OpRecord>>(p.local, KEYS.ops)) ?? {};
      delete all[opId];
      await p.local.set({ [KEYS.ops]: all });
    },
  },

  draft: {
    get: (p: StoragePort) => read<Draft>(p.local, KEYS.draft),
    save: async (p: StoragePort, d: Draft) => {
      await p.local.set({ [KEYS.draft]: d });
    },
  },

  staging: {
    get: (p: StoragePort) => read<StagedPayload>(p.session, KEYS.staging),
    save: async (p: StoragePort, s: StagedPayload) => {
      await p.session.set({ [KEYS.staging]: s });
    },
    clear: async (p: StoragePort) => {
      await p.session.remove([KEYS.staging]);
    },
  },

  createWindowId: {
    get: (p: StoragePort) => read<number>(p.session, KEYS.createWindowId),
    save: async (p: StoragePort, id: number) => {
      await p.session.set({ [KEYS.createWindowId]: id });
    },
  },
};

/** Keep at most 50 ops: in-flight always survive; terminal ops go oldest-first. */
function pruneOps(all: Record<string, OpRecord>): Record<string, OpRecord> {
  const day = 24 * 60 * 60 * 1000;
  const active = (o: OpRecord) => o.state === "pending" || o.state === "sent";
  for (const e of Object.values(all)) {
    if (!active(e) && Date.now() - e.updatedAt > day) delete all[e.opId];
  }
  const entries = Object.values(all);
  if (entries.length <= 50) return { ...all };
  // Ascending score: in-flight first (-1), then terminal newest-first.
  const score = (o: OpRecord) => (active(o) ? -1 : Number.MAX_SAFE_INTEGER - o.updatedAt);
  const keep = [...entries].sort((a, b) => score(a) - score(b)).slice(0, 50);
  return Object.fromEntries(keep.map((o) => [o.opId, o]));
}
