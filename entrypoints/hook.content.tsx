// import "./components/joystick.css";
import JoyStick from "@/components/JoyStick";
import ReactDOM from 'react-dom/client';

export default defineContentScript({
  matches: ["<all_urls>"],
  runAt: "document_start",
  // cssInjectionMode: "ui",
  async main(ctx) {
    if (!(await browser.storage.local.get({ enabled: false })).enabled) {
      return;
    }

    const defaultPosition = await browser.storage.local.get("fakeDefaultLatLng")
      .then((data) =>
        data.fakeDefaultLatLng as { lat: number, lng: number }
      )
      .then((fakeDefaultLatLng) =>
        fakeDefaultLatLng && [fakeDefaultLatLng.lat, fakeDefaultLatLng.lng]
      );
    if (!defaultPosition) {
      return;
    }

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