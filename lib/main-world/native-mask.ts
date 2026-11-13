/**
 * Helpers for replacing built-in functions in the page's MAIN world so that
 * the replacements are hard to tell apart from the native ones.
 *
 * - Replacements are Proxies around the original functions, so `name`,
 *   `length`, the missing `prototype` and the (non-)constructability are
 *   those of the original.
 * - `Function.prototype.toString` is wrapped so that it returns the original
 *   source text ("function getCurrentPosition() { [native code] }") for the
 *   replacements, including for itself.
 *
 * Must be called before any page script runs (document_start), so that the
 * built-ins captured here are the genuine ones.
 */

export type ApplyHandler = (target: Function, thisArg: unknown, args: unknown[]) => unknown;

export type NativeMask = ReturnType<typeof createNativeMask>;

export function createNativeMask() {
  const apply = Reflect.apply;
  const defineProperty = Reflect.defineProperty;
  const getOwnPropertyDescriptor = Reflect.getOwnPropertyDescriptor;
  const _Proxy = Proxy;
  const _WeakMap = WeakMap;
  const weakMapGet = WeakMap.prototype.get;
  const weakMapSet = WeakMap.prototype.set;

  /** Replacement function → original function, for toString(). */
  const originals = new _WeakMap<Function, Function>();

  function wrap<T extends Function>(original: T, handler: ApplyHandler): T {
    const proxy = new _Proxy(original, {
      apply(target, thisArg, args) {
        return handler(target, thisArg, args);
      },
    });
    apply(weakMapSet, originals, [proxy, original]);
    return proxy;
  }

  /**
   * Replace a method on `proto`, keeping its property attributes.
   * Returns the original method, or `undefined` if there is no such method.
   */
  function replaceMethod(proto: object, key: PropertyKey, handler: ApplyHandler): Function | undefined {
    const descriptor = getOwnPropertyDescriptor(proto, key);
    if (!descriptor || typeof descriptor.value !== "function") {
      return undefined;
    }
    const original = descriptor.value as Function;
    defineProperty(proto, key, { ...descriptor, value: wrap(original, handler) });
    return original;
  }

  /**
   * Replace an accessor's getter on `proto`, keeping its property attributes.
   * Returns the original getter, or `undefined` if there is no such getter.
   */
  function replaceGetter(proto: object, key: PropertyKey, handler: ApplyHandler): Function | undefined {
    const descriptor = getOwnPropertyDescriptor(proto, key);
    if (!descriptor || typeof descriptor.get !== "function") {
      return undefined;
    }
    const original = descriptor.get;
    defineProperty(proto, key, { ...descriptor, get: wrap(original, handler) });
    return original;
  }

  // Function.prototype.toString: report the original source for replacements.
  replaceMethod(Function.prototype, "toString", (target, thisArg, args) => {
    const original = typeof thisArg === "function" ? apply(weakMapGet, originals, [thisArg]) : undefined;
    return apply(target, original ?? thisArg, args);
  });

  return { wrap, replaceMethod, replaceGetter };
}
