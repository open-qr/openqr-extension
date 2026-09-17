/** Browser-context helpers: chrome bindings, storage hooks, downloads. */
import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_BASE_URL, type Settings } from "./types";
import { DEFAULT_SETTINGS, KEYS, store, type StoragePort } from "./store";

export function chromePort(): StoragePort {
  return {
    local: {
      get: (keys) => chrome.storage.local.get(keys as string[] | null),
      set: (items) => chrome.storage.local.set(items),
      remove: (keys) => chrome.storage.local.remove(keys),
    },
    session: {
      get: (keys) => chrome.storage.session.get(keys as string[] | null),
      set: (items) => chrome.storage.session.set(items),
      remove: (keys) => chrome.storage.session.remove(keys),
    },
    onChanged: chrome.storage.onChanged,
  };
}

/** Message the background coordinator; rejects only on extension shutdown. */
export function send(message: unknown): Promise<unknown> {
  return chrome.runtime.sendMessage(message);
}

/** React binding to a storage.local key: reads on mount + on every change. */
export function useStorageValue<T>(key: string, fallback: T, area: "local" | "session" = "local"): T {
  const [value, setValue] = useState<T>(fallback);
  useEffect(() => {
    let alive = true;
    const a = area === "local" ? chrome.storage.local : chrome.storage.session;
    const read = () => {
      void a.get([key]).then((items) => {
        if (alive) setValue((items[key] as T | undefined) ?? fallback);
      });
    };
    read();
    const listener = () => read();
    chrome.storage.onChanged.addListener(listener);
    return () => {
      alive = false;
      chrome.storage.onChanged.removeListener(listener);
    };
    // fallback captured once deliberately: changes to it would re-read pointlessly
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, area]);
  return value;
}

export function useSettings(): { settings: Settings; save: (patch: Partial<Settings>) => void } {
  const settings = useStorageValue<Settings>(KEYS.settings, DEFAULT_SETTINGS);
  const save = useCallback(
    (patch: Partial<Settings>) => {
      void store.settings.save(chromePort(), { ...DEFAULT_SETTINGS, ...settings, ...patch });
    },
    [settings],
  );
  return { settings, save };
}

/** Applies the .dark class from settings + the system preference. */
export function useTheme(): void {
  const { settings } = useSettings();
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark =
        settings.theme === "dark" || (settings.theme === "system" && mq.matches);
      document.documentElement.classList.toggle("dark", dark);
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [settings.theme]);
}

/** Dev-only base URL override (production builds always use the real site). */
export function useDevBaseUrl(): string {
  const settings = useStorageValue<Settings>(KEYS.settings, DEFAULT_SETTINGS);
  return __EXT_DEV__ && settings.baseUrl ? settings.baseUrl : DEFAULT_BASE_URL;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Tiny toast queue; returns [show, node] for rendering. */
export function useToast(): { show: (msg: string) => void; node: React.ReactNode } {
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((m: string) => {
    setMsg(m);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(null), 2600);
  }, []);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const node = msg ? (
    <div className="fixed inset-x-4 bottom-4 z-50 rounded-lg bg-fg px-3.5 py-2.5 text-sm text-bg shadow-lg">
      {msg}
    </div>
  ) : null;
  return { show, node };
}

export const SITE_LINKS = {
  dashboardKeys: "https://openqr.uk/dashboard/keys?utm_source=openqr-extension",
  dashboard: "https://openqr.uk/dashboard?utm_source=openqr-extension",
  pricing: "https://openqr.uk/pricing?utm_source=openqr-extension",
  privacy: "https://openqr.uk/privacy",
  home: "https://openqr.uk/?utm_source=openqr-extension",
};

export function openTab(url: string): void {
  void chrome.tabs.create({ url });
}
