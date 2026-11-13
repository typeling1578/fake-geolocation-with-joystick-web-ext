/**
 * Make `navigator.permissions.query({ name: "geolocation" })` report
 * "granted", matching the fake Geolocation API, which always answers without
 * asking. Otherwise pages could see "prompt" or "denied" and refuse to use a
 * location that the fake API happily provides.
 *
 * The genuine PermissionStatus object is returned (so `instanceof`, events and
 * `name` stay native); only its `state` getter is changed for it. The
 * replacements are Proxies around the native functions, so their `name` and
 * `length` stay native.
 *
 * Must be called at document_start, before any page script runs.
 */
export function patchGeolocationPermission() {
  if (typeof Permissions === "undefined" || typeof PermissionStatus === "undefined") {
    return;
  }

  const apply = Reflect.apply;
  const defineProperty = Reflect.defineProperty;
  const getOwnPropertyDescriptor = Reflect.getOwnPropertyDescriptor;
  const _WeakSet = WeakSet;
  const weakSetAdd = WeakSet.prototype.add;
  const weakSetHas = WeakSet.prototype.has;
  const promiseThen = Promise.prototype.then;

  const queryDescriptor = getOwnPropertyDescriptor(Permissions.prototype, "query");
  const stateDescriptor = getOwnPropertyDescriptor(PermissionStatus.prototype, "state");
  const statusName = getOwnPropertyDescriptor(PermissionStatus.prototype, "name")?.get;
  if (typeof queryDescriptor?.value !== "function" || typeof stateDescriptor?.get !== "function") {
    return;
  }

  /** PermissionStatus objects for "geolocation" returned to the page. */
  const geolocationStatuses = new _WeakSet<object>();

  const query = new Proxy(queryDescriptor.value as Function, {
    apply(target, thisArg, args) {
      const result = apply(target, thisArg, args) as Promise<PermissionStatus>;
      return apply(promiseThen, result, [(status: PermissionStatus) => {
        // Use the status' own name where available, so the page's descriptor
        // object is not read a second time.
        const name = statusName
          ? apply(statusName, status, [])
          : (args[0] as PermissionDescriptor | undefined)?.name;
        if (name === "geolocation") {
          apply(weakSetAdd, geolocationStatuses, [status]);
        }
        return status;
      }]);
    },
  });

  const getState = new Proxy(stateDescriptor.get, {
    apply(target, thisArg, args) {
      if (typeof thisArg === "object" && thisArg !== null && apply(weakSetHas, geolocationStatuses, [thisArg])) {
        return "granted";
      }
      return apply(target, thisArg, args);
    },
  });

  defineProperty(Permissions.prototype, "query", { ...queryDescriptor, value: query });
  defineProperty(PermissionStatus.prototype, "state", { ...stateDescriptor, get: getState });
}
