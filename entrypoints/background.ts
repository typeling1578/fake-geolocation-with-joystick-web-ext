import { ISOLATED_SCRIPT_ID, MAIN_SCRIPT_ID } from "@/lib/hook-protocol.ts";

type RegisteredContentScript = Parameters<typeof browser.scripting.registerContentScripts>[0][number];

const SCRIPT_IDS = [MAIN_SCRIPT_ID, ISOLATED_SCRIPT_ID];

const CONTENT_SCRIPTS: RegisteredContentScript[] = [
  {
    id: MAIN_SCRIPT_ID,
    js: ["content-scripts/hook-main.js"],
    matches: ["<all_urls>"],
    runAt: "document_start",
    allFrames: true,
    matchOriginAsFallback: true,
    world: "MAIN",
    persistAcrossSessions: true,
  },
  {
    id: ISOLATED_SCRIPT_ID,
    js: ["content-scripts/hook.js"],
    matches: ["<all_urls>"],
    runAt: "document_start",
    allFrames: true,
    matchOriginAsFallback: true,
    world: "ISOLATED",
    persistAcrossSessions: true,
  },
];

async function registerContentScripts() {
  try {
    await browser.scripting.registerContentScripts(CONTENT_SCRIPTS);
  } catch (e) {
    // Retry without matchOriginAsFallback in case the browser does not support it.
    console.warn("Failed to register content scripts, retrying without matchOriginAsFallback", e);
    await browser.scripting.registerContentScripts(
      CONTENT_SCRIPTS.map(({ matchOriginAsFallback, ...script }) => script),
    );
  }
}

/**
 * Register the hook content scripts while the add-on is enabled, and
 * unregister them while it is disabled, so nothing is injected into pages
 * when the add-on is off.
 *
 * @param force Re-register even if the scripts are already registered
 *              (e.g. after an update, when the script files may have changed).
 */
async function syncContentScripts(force = false) {
  const { enabled } = await browser.storage.local.get({ enabled: false });
  const registered = await browser.scripting.getRegisteredContentScripts({ ids: SCRIPT_IDS });

  const isFullyRegistered = registered.length === SCRIPT_IDS.length;
  if (enabled && isFullyRegistered && !force) {
    return;
  }
  if (!enabled && registered.length === 0) {
    return;
  }

  if (registered.length > 0) {
    await browser.scripting.unregisterContentScripts({ ids: registered.map((script) => script.id) });
  }
  if (enabled) {
    await registerContentScripts();
  }
}

// Serialize sync operations so that rapid toggles do not race each other.
let syncQueue: Promise<void> = Promise.resolve();
function queueSync(force = false) {
  syncQueue = syncQueue
    .then(() => syncContentScripts(force))
    .catch((e) => console.error("Failed to sync content scripts", e));
  return syncQueue;
}

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener((details) => {
    queueSync(true);

    if (details.reason == "install") {
      browser.tabs.create({
        url: "https://typeling1578.notion.site/Fake-geolocation-with-joystick-How-to-use-2de45a9a961a802b9e2adb3634023542",
      });
    }
  });

  browser.runtime.onStartup.addListener(() => {
    queueSync();
  });

  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && "enabled" in changes) {
      queueSync();
    }
  });

  // Relay joystick input from the top-level frame to all frames of the tab.
  browser.runtime.onMessage.addListener((message: unknown, sender) => {
    if (
      typeof message !== "object" || message === null ||
      (message as { type?: unknown }).type !== "joystick" ||
      sender.tab?.id === undefined || sender.frameId !== 0
    ) {
      return;
    }
    browser.tabs.sendMessage(sender.tab.id, message).catch(() => {});
  });

  queueSync();
});
