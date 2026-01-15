import { defineConfig } from "wxt";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

try {
  process.loadEnvFile();
} catch (e: any) {
  if (e.code !== "ENOENT") {
    throw e;
  }
}

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ["@wxt-dev/module-react", "@wxt-dev/i18n/module"],
  vite: () => ({
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./"),
      },
    },
  }),
  manifest: {
    name: "__MSG_extName__",
    description: "__MSG_extDescription__",
    // @ts-expect-error: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/author
    author: "typeling1578",
    homepage_url: "https://github.com/typeling1578/fake-geolocation-with-joystick-web-ext",
    default_locale: "en",
    permissions: ["storage", "geolocation", "scripting"],
    host_permissions: [
      "<all_urls>"
    ],
    web_accessible_resources: [
      {
        resources: ["hook-main-world.js"],
        matches: ["<all_urls>"],
      }
    ],
    browser_specific_settings: {
      gecko: {
        id: "{9258360d-822b-4da0-82b7-33bca439e8e8}",
        strict_min_version: "140.0",
        // @ts-expect-error: Firefox add-ons require data_collection_permissions to be specified, but wxt does not yet support it, so ignore the error.
        data_collection_permissions: {
          required: ["none"],
        },
      },
      gecko_android: {
        strict_min_version: "142.0",
      },
    },
    minimum_chrome_version: "126",
  },
  webExt: {
    binaries: {
      ...(process.env.WXT_BROWSER_CHROMIUM_PATH && {
        chrome: process.env.WXT_BROWSER_CHROMIUM_PATH
      }),
      ...(process.env.WXT_BROWSER_FIREFOX_PATH && {
        firefox: process.env.WXT_BROWSER_FIREFOX_PATH
      }),
    },
  },
});
