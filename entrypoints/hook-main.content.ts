import {
  HANDSHAKE_KEY,
  REQUEST_PORT_EVENT,
  type HookMessage,
  type LatLng,
} from "@/lib/hook-protocol.ts";
import {
  DEFAULT_SPEED_MPS,
  isValidSpeed,
  joystickToMotion,
  movePosition,
  type Motion,
} from "@/lib/movement.ts";

/**
 * Runs in the page's MAIN world at document_start, before any page script.
 *
 * The Geolocation API is replaced synchronously here, so the page can never
 * reach the real implementation. This script cannot read extension storage,
 * so the fake location arrives later from the ISOLATED world content script
 * (entrypoints/hook.content.tsx) through a MessagePort. Calls made before the
 * location arrives are queued.
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
  world: "MAIN",
  registration: "runtime",
  main() {
    // -----------------------------------------------------------------------
    // Keep references to built-ins we rely on, before page scripts can
    // replace them.
    // -----------------------------------------------------------------------
    const apply = Reflect.apply;
    const getter = (proto: object, key: string) =>
      Object.getOwnPropertyDescriptor(proto, key)!.get!;
    const setter = (proto: object, key: string) =>
      Object.getOwnPropertyDescriptor(proto, key)!.set!;

    const messageEventData = getter(MessageEvent.prototype, "data");
    const messageEventPorts = getter(MessageEvent.prototype, "ports");
    const messageEventSource = getter(MessageEvent.prototype, "source");
    const messagePortOnMessage = setter(MessagePort.prototype, "onmessage");
    const stopImmediatePropagation = Event.prototype.stopImmediatePropagation;
    const addEventListener = EventTarget.prototype.addEventListener;
    const dispatchEvent = EventTarget.prototype.dispatchEvent;
    const _setTimeout = setTimeout;
    const _clearTimeout = clearTimeout;
    const _setInterval = setInterval;
    const _dateNow = Date.now;
    const _performanceNow = performance.now.bind(performance);
    const _CustomEvent = CustomEvent;
    const consoleError = console.error;

    /** Give up waiting for the configuration after this long. */
    const CONFIG_WAIT_LIMIT_MS = 10_000;
    /** Delay before invoking callbacks, mimicking a real position lookup. */
    const CALLBACK_DELAY_MS = 100;
    /** How often the position is advanced and watchers are notified while moving. */
    const MOVE_INTERVAL_MS = 250;

    // -----------------------------------------------------------------------
    // State
    // -----------------------------------------------------------------------
    type State =
      | { status: "pending" } // waiting for the configuration
      | { status: "ready"; position: [number, number] }
      | { status: "unavailable" }; // no fake location set, or no configuration arrived

    let state: State = { status: "pending" };

    type PendingRequest = {
      success: PositionCallback;
      error?: PositionErrorCallback | null;
      timer?: ReturnType<typeof setTimeout>;
    };
    /** getCurrentPosition() calls waiting for the configuration. */
    const pendingRequests = new Set<PendingRequest>();

    type Watcher = {
      success: PositionCallback;
      error?: PositionErrorCallback | null;
      timer?: ReturnType<typeof setTimeout>;
    };
    let watchIdCount = 0;
    const watchers = new Map<number, Watcher>();

    /** Speed at full joystick tilt, in meters per second. */
    let maxSpeed: number = DEFAULT_SPEED_MPS;
    let joystickX = 0;
    let joystickY = 0;
    /** Current speed and heading, derived from the joystick input. */
    let motion: Motion = { speed: 0, heading: NaN };

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------
    function createPositionData(position: [number, number]): GeolocationPosition {
      const data = {
        coords: {
          latitude: position[0],
          longitude: position[1],
          altitude: null,
          accuracy: 1,
          altitudeAccuracy: null,
          heading: motion.heading,
          speed: motion.speed,
          toJSON: function () {
            return JSON.parse(JSON.stringify(this));
          },
        },
        timestamp: _dateNow(),
        toJSON: function () {
          return JSON.parse(JSON.stringify(this));
        },
      };
      return data as unknown as GeolocationPosition;
    }

    function createPositionError(code: 1 | 2 | 3, message: string): GeolocationPositionError {
      return {
        code,
        message,
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      } as GeolocationPositionError;
    }

    function safeCall<T>(callback: ((arg: T) => void) | null | undefined, arg: T) {
      if (typeof callback !== "function") {
        return;
      }
      try {
        callback(arg);
      } catch (e) {
        apply(consoleError, console, [e]);
      }
    }

    function respond(request: PendingRequest | Watcher) {
      if (state.status === "ready") {
        safeCall(request.success, createPositionData(state.position));
      } else if (state.status === "unavailable") {
        safeCall(request.error, createPositionError(2, "Position unavailable"));
      }
    }

    function startTimeout(request: PendingRequest | Watcher, options: PositionOptions | undefined | null, onTimeout: () => void) {
      const timeout = options?.timeout;
      if (typeof timeout !== "number" || !Number.isFinite(timeout) || timeout < 0) {
        return;
      }
      request.timer = _setTimeout(() => {
        request.timer = undefined;
        onTimeout();
        safeCall(request.error, createPositionError(3, "Timeout expired"));
      }, timeout);
    }

    /** Settle every call that was waiting for the configuration. */
    function flushPending() {
      for (const request of pendingRequests) {
        _clearTimeout(request.timer);
        respond(request);
      }
      pendingRequests.clear();

      for (const watcher of watchers.values()) {
        _clearTimeout(watcher.timer);
        watcher.timer = undefined;
        respond(watcher);
      }
    }

    function notifyWatchers() {
      if (state.status !== "ready") {
        return;
      }
      for (const watcher of watchers.values()) {
        safeCall(watcher.success, createPositionData(state.position));
      }
    }

    // -----------------------------------------------------------------------
    // Geolocation API replacement
    //
    // The methods are replaced on Geolocation.prototype (where the native
    // methods live) instead of being added as own properties of
    // navigator.geolocation.
    // -----------------------------------------------------------------------
    const replacements = {
      getCurrentPosition(successCallback: PositionCallback, errorCallback?: PositionErrorCallback | null, options?: PositionOptions) {
        if (state.status !== "pending") {
          const request: PendingRequest = { success: successCallback, error: errorCallback };
          _setTimeout(() => respond(request), CALLBACK_DELAY_MS);
          return;
        }

        const request: PendingRequest = { success: successCallback, error: errorCallback };
        pendingRequests.add(request);
        startTimeout(request, options, () => pendingRequests.delete(request));
      },

      watchPosition(successCallback: PositionCallback, errorCallback?: PositionErrorCallback | null, options?: PositionOptions): number {
        const watchId = ++watchIdCount;
        const watcher: Watcher = { success: successCallback, error: errorCallback };
        watchers.set(watchId, watcher);

        if (state.status !== "pending") {
          _setTimeout(() => {
            if (watchers.get(watchId) === watcher) {
              respond(watcher);
            }
          }, CALLBACK_DELAY_MS);
        } else {
          // A watch keeps running after a timeout error, so only the timer is cleared.
          startTimeout(watcher, options, () => {});
        }

        return watchId;
      },

      clearWatch(watchId: number) {
        const watcher = watchers.get(watchId);
        if (watcher) {
          _clearTimeout(watcher.timer);
          watchers.delete(watchId);
        }
      },
    };

    for (const name of ["getCurrentPosition", "watchPosition", "clearWatch"] as const) {
      const descriptor = Object.getOwnPropertyDescriptor(Geolocation.prototype, name);
      Object.defineProperty(Geolocation.prototype, name, {
        configurable: descriptor?.configurable ?? true,
        enumerable: descriptor?.enumerable ?? true,
        writable: descriptor?.writable ?? true,
        value: replacements[name],
      });
    }

    // -----------------------------------------------------------------------
    // Communication with the ISOLATED world
    // -----------------------------------------------------------------------
    function handleMessage(message: HookMessage) {
      switch (message?.type) {
        case "config": {
          if (state.status !== "pending") {
            return;
          }
          if (isValidSpeed(message.speed)) {
            maxSpeed = message.speed;
          }
          const position = message.position;
          state = isValidLatLng(position)
            ? { status: "ready", position: [position.lat, position.lng] }
            : { status: "unavailable" };
          flushPending();
          break;
        }
        case "position-changed": {
          const position = message.position;
          if (!isValidLatLng(position)) {
            return;
          }
          const wasPending = state.status !== "ready";
          state = { status: "ready", position: [position.lat, position.lng] };
          lastMoveTime = _performanceNow();
          if (wasPending) {
            flushPending();
          } else {
            notifyWatchers();
          }
          break;
        }
        case "speed-changed": {
          if (isValidSpeed(message.speed)) {
            maxSpeed = message.speed;
            updateMotion();
          }
          break;
        }
        case "joystick": {
          if (Number.isFinite(message.x) && Number.isFinite(message.y)) {
            joystickX = Math.max(-1, Math.min(1, message.x));
            joystickY = Math.max(-1, Math.min(1, message.y));
            updateMotion();
          }
          break;
        }
      }
    }

    function isValidLatLng(value: LatLng | null | undefined): value is LatLng {
      return (
        typeof value === "object" && value !== null &&
        Number.isFinite(value.lat) && Number.isFinite(value.lng)
      );
    }

    let connected = false;

    function onWindowMessage(event: MessageEvent) {
      if (apply(messageEventSource, event, []) !== window) {
        return;
      }
      const data = apply(messageEventData, event, []);
      if (typeof data !== "object" || data === null || data[HANDSHAKE_KEY] !== true) {
        return;
      }

      // Hide every handshake message (including spare ports sent after the
      // connection was made) from the page's own message listeners.
      apply(stopImmediatePropagation, event, []);

      if (connected) {
        return;
      }
      const ports = apply(messageEventPorts, event, []) as readonly MessagePort[];
      if (ports.length !== 1) {
        return;
      }
      connected = true;

      // Setting onmessage also starts the port.
      apply(messagePortOnMessage, ports[0], [(e: MessageEvent) => {
        handleMessage(apply(messageEventData, e, []) as HookMessage);
      }]);
    }

    apply(addEventListener, window, ["message", onWindowMessage, true]);

    // In case the ISOLATED script started first and its port was already
    // delivered before this listener existed, ask for another one.
    apply(dispatchEvent, window, [new _CustomEvent(REQUEST_PORT_EVENT)]);

    // Never fall back to the real location: if no configuration arrives,
    // report the position as unavailable.
    _setTimeout(() => {
      if (state.status === "pending") {
        state = { status: "unavailable" };
        flushPending();
      }
    }, CONFIG_WAIT_LIMIT_MS);

    // -----------------------------------------------------------------------
    // Joystick movement
    // -----------------------------------------------------------------------
    let lastMoveTime = _performanceNow();

    function updateMotion() {
      const wasMoving = motion.speed > 0;
      // Advance up to now with the previous motion before switching to the new one.
      advance();
      motion = joystickToMotion(joystickX, joystickY, maxSpeed);
      // Report the stop right away so that speed 0 reaches the page.
      if (wasMoving && motion.speed === 0) {
        notifyWatchers();
      }
    }

    function advance() {
      const now = _performanceNow();
      // Cap the step so a throttled background tab does not jump far at once.
      const seconds = Math.min((now - lastMoveTime) / 1000, 5);
      lastMoveTime = now;
      if (state.status !== "ready" || motion.speed === 0) {
        return false;
      }
      state.position = movePosition(state.position, motion, seconds);
      return true;
    }

    _setInterval(() => {
      if (advance()) {
        notifyWatchers();
      }
    }, MOVE_INTERVAL_MS);
  },
});
