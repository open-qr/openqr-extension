/**
 * Service worker: context menus, the create window, and the background
 * coordinator. No React/UI imports here (the SW cold-starts on events; keep
 * its graph small). All state lives in storage, never in memory: the worker
 * is designed to be terminated between any two lines.
 */
import { markStaleOps, refreshCache, runOp } from "@/lib/coordinator";
import { looksLikeHttpUrl } from "@/lib/payloads";
import { store, type StoragePort } from "@/lib/store";
import type { StagedPayload } from "@/lib/types";

const port: StoragePort = {
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

const MENU_ITEMS = [
  { id: "qr-page", title: "Create QR code for this page", context: "page" },
  { id: "qr-link", title: "Create QR code for this link", context: "link" },
  { id: "qr-selection", title: "Create QR code for this selection", context: "selection" },
  { id: "qr-image", title: "Create QR code for image URL", context: "image" },
] as const;

function registerMenus(): void {
  // Menus persist across browser restarts; removeAll prevents duplicates on update.
  void chrome.contextMenus.removeAll(() => {
    for (const item of MENU_ITEMS) {
      chrome.contextMenus.create({
        id: item.id,
        title: item.title,
        contexts: [item.context],
      });
    }
  });
}

async function bootstrap(): Promise<void> {
  // Only extension pages (never content scripts) may read storage.
  if (chrome.storage.local.setAccessLevel) {
    void chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
  }
  registerMenus();
  await markStaleOps(port);
}

chrome.runtime.onInstalled.addListener(() => void bootstrap());
chrome.runtime.onStartup.addListener(() => void markStaleOps(port));

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  const msg = message as { type?: string; opId?: string };
  switch (msg?.type) {
    case "run-op":
      if (msg.opId) void runOp(port, msg.opId).finally(() => sendResponse({ accepted: true }));
      else sendResponse({ accepted: false });
      return true; // async reply
    case "check-op":
      if (msg.opId) void runOp(port, msg.opId).finally(() => sendResponse({ accepted: true }));
      else sendResponse({ accepted: false });
      return true;
    case "sync-ops":
      void markStaleOps(port).finally(() => sendResponse({ ok: true }));
      return true;
    case "connected":
      void refreshCache(port).finally(() => sendResponse({ ok: true }));
      return true;
    case "refresh-cache":
      void refreshCache(port).finally(() => sendResponse({ ok: true }));
      return true;
    default:
      return false;
  }
});

chrome.contextMenus.onClicked.addListener((info) => {
  const value =
    info.menuItemId === "qr-link"
      ? info.linkUrl
      : info.menuItemId === "qr-image"
        ? info.srcUrl
        : info.menuItemId === "qr-selection"
          ? (info.selectionText ?? info.pageUrl)
          : info.pageUrl;
  if (!value) return;
  const kind = info.menuItemId === "qr-selection" && !looksLikeHttpUrl(value) ? "text" : "url";
  const staged: StagedPayload = {
    id: `stage-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    kind,
    value,
    createdAt: Date.now(),
  };
  void openCreateWindow(staged);
});

/** Open (or focus) the 420x640 create window. The staged payload carries a
 *  fresh id + the page decides whether it may replace an unsaved draft. */
async function openCreateWindow(staged: StagedPayload): Promise<void> {
  await store.staging.save(port, staged);
  const existing = await store.createWindowId.get(port);
  if (existing != null) {
    try {
      const win = await chrome.windows.get(existing);
      if (win && win.id != null) {
        await chrome.windows.update(win.id, { focused: true, drawAttention: true });
        return; // staging already saved; the page reacts to onChanged
      }
    } catch {
      // window closed; fall through and create a new one
    }
  }
  const win = await chrome.windows.create({
    url: `codes.html?flow=create&stage=${encodeURIComponent(staged.id)}`,
    type: "popup",
    width: 420,
    height: 640,
  });
  if (win && win.id != null) await store.createWindowId.save(port, win.id);
}
