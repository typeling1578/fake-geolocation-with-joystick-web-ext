/**
 * Protocol shared by the MAIN world hook (entrypoints/hook-main.content.ts)
 * and the ISOLATED world content script (entrypoints/hook.content.tsx).
 *
 * Handshake:
 *   1. The ISOLATED script creates a MessageChannel and transfers one port to
 *      the MAIN world with `window.postMessage({ [HANDSHAKE_KEY]: true }, "*", [port])`.
 *   2. If the MAIN world script starts after that message was dispatched, it
 *      dispatches a `REQUEST_PORT_EVENT` on `window`, and the ISOLATED script
 *      answers with another port.
 *   3. The MAIN world accepts only the first port it receives; all further
 *      communication goes through that port, so nothing stays in the DOM.
 */

export const HANDSHAKE_KEY = "__fake_geolocation_with_joystick_port__";
export const REQUEST_PORT_EVENT = "__fake_geolocation_with_joystick_request_port__";

/** Content script IDs used with `browser.scripting.registerContentScripts`. */
export const MAIN_SCRIPT_ID = "hook-main";
export const ISOLATED_SCRIPT_ID = "hook-isolated";

export type LatLng = { lat: number; lng: number };

/** Messages sent from the ISOLATED world to the MAIN world. */
export type HookMessage =
  /** Initial configuration. `position: null` means no fake location is set. */
  | { type: "config"; position: LatLng | null }
  /** The fake default location was changed from the popup. */
  | { type: "position-changed"; position: LatLng }
  /** Joystick input, both axes in the range [-1, 1]. */
  | { type: "joystick"; x: number; y: number };
