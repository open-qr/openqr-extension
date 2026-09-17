import type { StoragePort } from "@/lib/store";

/** In-memory chrome.storage stand-in with change events, for coordinator tests. */
export function fakePort(seed: Record<string, unknown> = {}, session: Record<string, unknown> = {}): StoragePort & {
  localData: Map<string, unknown>;
  sessionData: Map<string, unknown>;
  emit(key: string, area: "local" | "session"): void;
} {
  const localData = new Map(Object.entries(structuredClone(seed)));
  const sessionData = new Map(Object.entries(structuredClone(session)));
  const listeners = new Set<(changes: Record<string, unknown>, area: string) => void>();

  const area = (map: Map<string, unknown>, name: "local" | "session") => ({
    get: async (keys: string[] | null) => {
      if (keys == null) return Object.fromEntries(map);
      return Object.fromEntries(keys.map((k) => [k, map.get(k)]).filter(([, v]) => v !== undefined));
    },
    set: async (items: Record<string, unknown>) => {
      for (const [k, v] of Object.entries(items)) map.set(k, v);
      emit(Object.keys(items)[0] ?? "", name);
    },
    remove: async (keys: string[]) => {
      for (const k of keys) map.delete(k);
      emit(keys[0] ?? "", name);
    },
  });

  function emit(key: string, areaName: "local" | "session") {
    for (const cb of listeners) cb({ [key]: {} }, areaName);
  }

  return {
    localData,
    sessionData,
    emit,
    local: area(localData, "local"),
    session: area(sessionData, "session"),
    onChanged: {
      addListener: (cb) => listeners.add(cb),
      removeListener: (cb) => listeners.delete(cb),
    },
  };
}
