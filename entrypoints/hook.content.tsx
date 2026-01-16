// import "./components/joystick.css";
import JoyStick from "@/components/JoyStick";
import ReactDOM from 'react-dom/client';

type StorageData = {
  enabled: boolean | undefined,
  fakeDefaultLatLng: { lat: number, lng: number } | undefined,
};

export default defineContentScript({
  matches: ["<all_urls>"],
  runAt: "document_start",
  // cssInjectionMode: "ui",
  async main(ctx) {
    const data = await browser.storage.local.get(["enabled", "fakeDefaultLatLng"]) as StorageData;
    if (!data.enabled || !data.fakeDefaultLatLng) {
      return;
    }
    const defaultPosition = [
      data.fakeDefaultLatLng.lat,
      data.fakeDefaultLatLng.lng,
    ];

    const { script } = await injectScript("/hook-main-world.js", {
      keepInDom: true,
      modifyScript(script) {
        script.dataset["default_position"] = JSON.stringify(defaultPosition);
      },
    });

    browser.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local") {
        return;
      }
      if (!Object.keys(changes).includes("fakeDefaultLatLng")) {
        return;
      }

      const latlng = changes["fakeDefaultLatLng"].newValue as { lat: number, lng: number };
      script.dispatchEvent(
        new CustomEvent("default-position-changed", {
          // @ts-expect-error: FirefoxではcloneIntoでクローンしないとアクセスが拒否される
          detail: typeof cloneInto !== "undefined" ? cloneInto(latlng, window) : latlng,
        }),
      );
    });

    function handleMove(x: number, y: number) {
      script.dispatchEvent(
        new CustomEvent("joystick-onmove", {
          // @ts-expect-error: FirefoxではcloneIntoでクローンしないとアクセスが拒否される
          detail: typeof cloneInto !== "undefined" ? cloneInto({ x, y }, window) : { x, y },
        }),
      );
    }

    const ui = await createShadowRootUi(ctx, {
      name: "joystick-ui",
      position: "inline",
      // position: "overlay",
      // alignment: "bottom-right",
      anchor: "body",
      onMount: (container) => {
        const app = document.createElement("div");
        container.append(app);

        const root = ReactDOM.createRoot(app);
        root.render(<JoyStick onMove={handleMove} />);
        return root;
      },
      onRemove: (root) => {
        root?.unmount();
      },
    });

    ui.autoMount();
  },
});