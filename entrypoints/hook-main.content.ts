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
import { createNativeMask } from "@/lib/main-world/native-mask.ts";
import { createGeolocationObjects } from "@/lib/main-world/geolocation-objects.ts";
import { patchGeolocationPermission } from "@/lib/main-world/permissions.ts";

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
    // Patch built-ins first, while they are still the genuine ones.
    // -----------------------------------------------------------------------
    const mask = createNativeMask();
    const objects = createGeolocationObjects(mask);
    patchGeolocationPermission(mask);

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
    const _mathRandom = Math.random;
    const _Number = Number;
    const _CustomEvent = CustomEvent;
    const _reportError: ((e: unknown) => void) | undefined =
      typeof reportError === "function" ? reportError : undefined;
    const createNullRecord = <T>() => Object.create(null) as Record<number, T>;

    /** The genuine Geolocation object of this window. */
    const geolocation = navigator.geolocation;

    /** Give up waiting for the configuration after this long. */
    const CONFIG_WAIT_LIMIT_MS = 10_000;
    /** Delay before invoking callbacks, mimicking a real position lookup. */
    const CALLBACK_DELAY_MS = 100;
    /** How often the position is advanced and watchers are notified while moving. */
    const MOVE_INTERVAL_MS = 250;
    /** Reported accuracy range in meters, typical of a GPS fix. */
    const ACCURACY_MIN_M = 8;
    const ACCURACY_MAX_M = 20;

    // -----------------------------------------------------------------------
    // State
    //
    // Requests are kept in null-prototype records iterated with for...in,
    // so that page scripts patching Map/Set/Array methods cannot observe or
    // break them.
    // -----------------------------------------------------------------------
    type State =
      | { status: "pending" } // waiting for the configuration
      | { status: "ready"; position: [number, number] }
      | { status: "unavailable" }; // no fake location set, or no configuration arrived

    let state: State = { status: "pending" };

    type Request = {
      success: PositionCallback;
      error: PositionErrorCallback | null | undefined;
      timer?: ReturnType<typeof setTimeout>;
    };
    let requestIdCount = 0;
    /** getCurrentPosition() calls waiting for the configuration. */
    let pendingRequests = createNullRecord<Request>();

    let watchIdCount = 0;
    const watchers = createNullRecord<Request>();

    /** Speed at full joystick tilt, in meters per second. */
    let maxSpeed: number = DEFAULT_SPEED_MPS;
    let joystickX = 0;
    let joystickY = 0;
    /** Current speed and heading, derived from the joystick input. */
    let motion: Motion = { speed: 0, heading: NaN };
    /** The most recent position given to the page, reused within maximumAge. */
    let lastPosition: { position: GeolocationPosition; timestamp: number } | null = null;

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------
    function createPosition(position: [number, number]): GeolocationPosition {
      const accuracy = ACCURACY_MIN_M + _mathRandom() * (ACCURACY_MAX_M - ACCURACY_MIN_M);
      const moving = motion.speed > 0;
      const timestamp = _dateNow();
      const result = objects.createPosition({
        latitude: position[0],
        longitude: position[1],
        altitude: null,
        accuracy,
        altitudeAccuracy: null,
        // While stationary, report null like typical (non-GPS) native sources do.
        heading: moving ? motion.heading : null,
        speed: moving ? motion.speed : null,
      }, timestamp);
      lastPosition = { position: result, timestamp };
      return result;
    }

    /**
     * Invoke a page callback like the browser does: with `this` undefined,
     * reporting exceptions as uncaught errors instead of propagating them.
     */
    function invoke<T>(callback: ((arg: T) => void) | null | undefined, arg: T) {
      if (typeof callback !== "function") {
        return;
      }
      try {
        apply(callback, undefined, [arg]);
      } catch (e) {
        if (_reportError) {
          _reportError(e);
        } else {
          _setTimeout(() => { throw e; }, 0);
        }
      }
    }

    function respond(request: Request) {
      if (state.status === "ready") {
        invoke(request.success, createPosition(state.position));
      } else if (state.status === "unavailable") {
        invoke(request.error, objects.createError(2, "Position unavailable"));
      }
    }

    function startTimeout(request: Request, timeout: number | undefined, onTimeout: () => void) {
      if (timeout === undefined) {
        return;
      }
      request.timer = _setTimeout(() => {
        request.timer = undefined;
        onTimeout();
        invoke(request.error, objects.createError(3, "Timeout expired"));
      }, timeout);
    }

    /**
     * Answer a request once the configuration is known: from the cache if it
     * is recent enough (maximumAge), otherwise after the lookup delay, or with
     * a timeout error if `timeout` is shorter than that delay.
     */
    function scheduleResponse(request: Request, options: ParsedOptions, isWatch: boolean, isActive: () => boolean = () => true) {
      const cached = lastPosition;
      // maximumAge 0 always asks for a fresh position.
      if (state.status === "ready" && cached && options.maximumAge > 0 && _dateNow() - cached.timestamp <= options.maximumAge) {
        _setTimeout(() => {
          if (isActive()) {
            invoke(request.success, cached.position);
          }
        }, 0);
        return;
      }
      if (options.timeout !== undefined && options.timeout < CALLBACK_DELAY_MS) {
        _setTimeout(() => {
          if (isActive()) {
            invoke(request.error, objects.createError(3, "Timeout expired"));
          }
        }, options.timeout);
        // A one-shot request ends with the timeout; a watch keeps going.
        if (!isWatch) {
          return;
        }
      }
      _setTimeout(() => {
        if (isActive()) {
          respond(request);
        }
      }, CALLBACK_DELAY_MS);
    }

    /** Settle every call that was waiting for the configuration. */
    function flushPending() {
      const requests = pendingRequests;
      pendingRequests = createNullRecord<Request>();
      for (const id in requests) {
        const request = requests[id]!;
        _clearTimeout(request.timer);
        respond(request);
      }

      for (const id in watchers) {
        const watcher = watchers[id]!;
        _clearTimeout(watcher.timer);
        watcher.timer = undefined;
        respond(watcher);
      }
    }

    function notifyWatchers() {
      if (state.status !== "ready") {
        return;
      }
      for (const id in watchers) {
        invoke(watchers[id]!.success, createPosition(state.position));
      }
    }

    // -----------------------------------------------------------------------
    // Argument handling, following the WebIDL definitions:
    //
    //   undefined getCurrentPosition(PositionCallback successCallback,
    //     optional PositionErrorCallback? errorCallback = null,
    //     optional PositionOptions options = {});
    //   long watchPosition(...same arguments...);
    //   undefined clearWatch(long watchId);
    //
    // For invalid calls, the original native method is called with arguments
    // that make it throw before it does anything, so the page gets exactly
    // the native TypeError (message included).
    // -----------------------------------------------------------------------
    const noop = () => {};

    /** Throw the native error for an invalid call. */
    function throwNative(original: Function, thisArg: unknown, args: unknown[]): never {
      const result = apply(original, thisArg, args);
      // Not expected: the native method accepted the arguments. Do not leave a
      // real watch running.
      if (typeof result === "number") {
        apply(originalClearWatch!, geolocation, [result]);
      }
      throw new TypeError("Illegal invocation");
    }

    type ParsedOptions = {
      /** Timeout in milliseconds, or undefined for none. */
      timeout: number | undefined;
      /** Maximum age of a cached position in milliseconds. */
      maximumAge: number;
    };

    /** [Clamp] unsigned long conversion. */
    function clampUnsignedLong(value: unknown): number {
      const n = _Number(value);
      return n !== n ? 0 : n < 0 ? 0 : n > 0xFFFFFFFF ? 0xFFFFFFFF : n - (n % 1);
    }

    /**
     * Validate getCurrentPosition()/watchPosition() arguments and convert the
     * options.
     */
    function parseArgs(original: Function, thisArg: unknown, args: unknown[]): ParsedOptions {
      if (thisArg !== geolocation) {
        throwNative(original, thisArg, [noop]);
      }
      if (args.length === 0) {
        throwNative(original, thisArg, []);
      }
      if (typeof args[0] !== "function") {
        throwNative(original, thisArg, [args[0]]);
      }
      if (args[1] !== undefined && args[1] !== null && typeof args[1] !== "function") {
        throwNative(original, thisArg, [noop, args[1]]);
      }
      const options = args[2];
      if (options === undefined || options === null) {
        return { timeout: undefined, maximumAge: 0 };
      }
      if (typeof options !== "object" && typeof options !== "function") {
        throwNative(original, thisArg, [noop, null, options]);
      }
      // Read the dictionary members in the same (alphabetical) order as the
      // native conversion, so getters on the options object run identically.
      const dict = options as PositionOptions;
      void dict.enableHighAccuracy;
      const maximumAge = dict.maximumAge;
      const maximumAgeMs = maximumAge === undefined ? 0 : clampUnsignedLong(maximumAge);
      const timeout = dict.timeout;
      return {
        timeout: timeout === undefined ? undefined : clampUnsignedLong(timeout),
        maximumAge: maximumAgeMs,
      };
    }

    // -----------------------------------------------------------------------
    // Geolocation API replacement
    // -----------------------------------------------------------------------
    const originalGetCurrentPosition = mask.replaceMethod(Geolocation.prototype, "getCurrentPosition", (target, thisArg, args) => {
      const options = parseArgs(target, thisArg, args);
      const request: Request = {
        success: args[0] as PositionCallback,
        error: args[1] as PositionErrorCallback | null | undefined,
      };

      if (state.status !== "pending") {
        scheduleResponse(request, options, false);
        return undefined;
      }

      const id = ++requestIdCount;
      pendingRequests[id] = request;
      startTimeout(request, options.timeout, () => { delete pendingRequests[id]; });
      return undefined;
    });

    mask.replaceMethod(Geolocation.prototype, "watchPosition", (target, thisArg, args) => {
      const options = parseArgs(target, thisArg, args);
      const watchId = ++watchIdCount;
      const watcher: Request = {
        success: args[0] as PositionCallback,
        error: args[1] as PositionErrorCallback | null | undefined,
      };
      watchers[watchId] = watcher;

      if (state.status !== "pending") {
        scheduleResponse(watcher, options, true, () => watchers[watchId] === watcher);
      } else {
        // A watch keeps running after a timeout error, so only the timer is cleared.
        startTimeout(watcher, options.timeout, noop);
      }

      return watchId;
    });

    const originalClearWatch = mask.replaceMethod(Geolocation.prototype, "clearWatch", (target, thisArg, args) => {
      if (thisArg !== geolocation) {
        throwNative(target, thisArg, [0]);
      }
      if (args.length === 0) {
        throwNative(target, thisArg, []);
      }
      // long: ToNumber, then modulo 2^32 into the signed range.
      const watchId = _Number(args[0]) | 0;
      const watcher = watchers[watchId];
      if (watcher) {
        _clearTimeout(watcher.timer);
        delete watchers[watchId];
      }
      return undefined;
    });

    if (!originalGetCurrentPosition || !originalClearWatch) {
      return;
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
