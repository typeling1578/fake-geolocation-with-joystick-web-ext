export default defineBackground(() => {
  browser.runtime.onInstalled.addListener((details) => {
    if (details.reason == "install") {
      browser.tabs.create({
        url: "https://typeling1578.notion.site/Fake-geolocation-with-joystick-How-to-use-2de45a9a961a802b9e2adb3634023542",
      });
    }
  });

  async function registerContentScript(script: Browser.scripting.RegisteredContentScript) {
    const scripts = await browser.scripting.getRegisteredContentScripts({
      ids: [script.id],
    });
    if (scripts.length === 0) {
      await browser.scripting.registerContentScripts([script]);
    }
  }

  async function unregisterContentScript(id: string) {
    const scripts = await browser.scripting.getRegisteredContentScripts({
      ids: [id],
    });
    if (scripts.length > 0) {
      await browser.scripting.unregisterContentScripts({
        ids: [id],
      });
    }
  }

  async function updateHookRegistration() {
    const data = await browser.storage.local.get(["enabled", "fakeDefaultLatLng"]);
    if (data.enabled && data.fakeDefaultLatLng) {
      await registerContentScript({
        id: "hook",
        matches: ["<all_urls>"],
        runAt: "document_start",
        js: ["content-scripts/hook.js"]
      });
    } else {
      await unregisterContentScript("hook");
    }
  }

  browser.storage.onChanged.addListener(async (changes, areaName) => {
    if (areaName == "local") {
      await updateHookRegistration();
    }
  });

  updateHookRegistration();
});
