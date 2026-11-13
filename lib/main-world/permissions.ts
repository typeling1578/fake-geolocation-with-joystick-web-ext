import type { NativeMask } from "@/lib/main-world/native-mask.ts";

/**
 * Make `navigator.permissions.query({ name: "geolocation" })` report
 * "granted", matching the fake Geolocation API, which always answers without
 * asking. Otherwise pages could see "prompt" or "denied" and refuse to use a
 * location that the fake API happily provides.
 *
 * The genuine PermissionStatus object is returned (so `instanceof`, events and
 * `name` stay native); only its `state` getter is changed for it.
 *
 * Must be called at document_start, before any page script runs.
 */
export function patchGeolocationPermission(mask: NativeMask) {
  if (typeof Permissions === "undefined" || typeof PermissionStatus === "undefined") {
    return;
  }

  const apply = Reflect.apply;
  const getOwnPropertyDescriptor = Reflect.getOwnPropertyDescriptor;
  const _WeakSet = WeakSet;
  const weakSetAdd = WeakSet.prototype.add;
  const weakSetHas = WeakSet.prototype.has;
  const promiseThen = Promise.prototype.then;
  const statusName = getOwnPropertyDescriptor(PermissionStatus.prototype, "name")?.get;

  /** PermissionStatus objects for "geolocation" returned to the page. */
  const geolocationStatuses = new _WeakSet<object>();

  mask.replaceMethod(Permissions.prototype, "query", (target, thisArg, args) => {
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
  });

  mask.replaceGetter(PermissionStatus.prototype, "state", (target, thisArg, args) => {
    if (typeof thisArg === "object" && thisArg !== null && apply(weakSetHas, geolocationStatuses, [thisArg])) {
      return "granted";
    }
    return apply(target, thisArg, args);
  });
}
