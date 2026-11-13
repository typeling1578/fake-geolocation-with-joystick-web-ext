import JoyStick from "@/components/JoyStick";
import ReactDOM from "react-dom/client";
import {
  HANDSHAKE_KEY,
  REQUEST_PORT_EVENT,
  type HookMessage,
  type LatLng,
} from "@/lib/hook-protocol.ts";
import { DEFAULT_SPEED_MPS, isValidSpeed } from "@/lib/movement.ts";

type StorageData = {
  enabled: boolean | undefined,
  fakeDefaultLatLng: LatLng | undefined,
  moveSpeed: number | undefined,
};

function isJoystickMessage(message: unknown): message is Extract<HookMessage, { type: "joystick" }> {
  return (
    typeof message === "object" && message !== null &&
    (message as { type?: unknown }).type === "joystick" &&
    typeof (message as { x?: unknown }).x === "number" &&
    typeof (message as { y?: unknown }).y === "number"
  );
}

/**
 * Runs in the ISOLATED world next to the MAIN world hook
 * (entrypoints/hook-main.content.ts). It passes the fake location and joystick
 * input to the hook, and shows the joystick UI.
 *
 * This script is registered by the background script only while the add-on
 * is enabled (see entrypoints/background.ts).
 */
export default defineContentScript({
  matches: ["<all_urls>"],
  runAt: "document_start",
  allFrames: true,
  matchAboutBlank: true,
  matchOriginAsFallback: true,
  registration: "runtime",
  async main(ctx) {
    // -----------------------------------------------------------------------
    // Connect to the MAIN world synchronously, before page scripts run.
    // -----------------------------------------------------------------------
    const ports: MessagePort[] = [];

    function sendPort() {
      const channel = new MessageChannel();
      ports.push(channel.port1);
      window.postMessage({ [HANDSHAKE_KEY]: true }, "*", [channel.port2]);
    }

    function send(message: HookMessage) {
      // Only the port accepted by the MAIN world is listened to; the others are ignored.
      for (const port of ports) {
        port.postMessage(message);
      }
    }

    sendPort();
    // The MAIN world asks for another port if it missed the first one.
    window.addEventListener(REQUEST_PORT_EVENT, () => {
      if (ports.length < 2) {
        sendPort();
      }
    }, { once: true });

    // -----------------------------------------------------------------------
    // Pass the configuration.
    // -----------------------------------------------------------------------
    const data = await browser.storage.local.get(["enabled", "fakeDefaultLatLng", "moveSpeed"]) as StorageData;
    const position = data.enabled ? data.fakeDefaultLatLng ?? null : null;
    const speed = isValidSpeed(data.moveSpeed) ? data.moveSpeed : DEFAULT_SPEED_MPS;
    send({ type: "config", position, speed });

    browser.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local") {
        return;
      }
      const latlng = changes["fakeDefaultLatLng"]?.newValue as LatLng | undefined;
      if (latlng) {
        send({ type: "position-changed", position: { lat: latlng.lat, lng: latlng.lng } });
      }
      if ("moveSpeed" in changes) {
        const newSpeed = changes["moveSpeed"].newValue;
        send({ type: "speed-changed", speed: isValidSpeed(newSpeed) ? newSpeed : DEFAULT_SPEED_MPS });
      }
    });

    if (!position) {
      return;
    }

    // -----------------------------------------------------------------------
    // Joystick UI (top-level frame only). Input is relayed to subframes
    // through the background script.
    // -----------------------------------------------------------------------
    if (window !== window.top) {
      browser.runtime.onMessage.addListener((message: unknown) => {
        if (isJoystickMessage(message)) {
          send({ type: "joystick", x: message.x, y: message.y });
        }
      });
      return;
    }

    function handleMove(x: number, y: number) {
      send({ type: "joystick", x, y });
      browser.runtime.sendMessage({ type: "joystick", x, y } satisfies HookMessage).catch(() => {});
    }

    const ui = await createShadowRootUi(ctx, {
      name: "joystick-ui",
      position: "inline",
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
