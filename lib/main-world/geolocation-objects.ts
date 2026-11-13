import type { NativeMask } from "@/lib/main-world/native-mask.ts";

export type CoordinatesData = {
  latitude: number;
  longitude: number;
  altitude: number | null;
  accuracy: number;
  altitudeAccuracy: number | null;
  heading: number | null;
  speed: number | null;
};

/**
 * Creates fake GeolocationPosition / GeolocationCoordinates /
 * GeolocationPositionError objects that behave like native ones:
 *
 * - They are created from the real prototypes, so `instanceof`,
 *   `Object.prototype.toString` and `for...in` give the native results.
 * - They have no own properties. The data lives in WeakMaps, and the native
 *   getters (and `toJSON`) on the prototypes are wrapped to read it for fake
 *   objects. For any other object the original getter runs, so genuine
 *   objects and invalid receivers ("Illegal invocation") behave as before.
 *
 * Must be called at document_start, before any page script runs.
 */
export function createGeolocationObjects(mask: NativeMask) {
  const apply = Reflect.apply;
  const objectCreate = Object.create;
  const _WeakMap = WeakMap;
  const weakMapGet = WeakMap.prototype.get;
  const weakMapSet = WeakMap.prototype.set;
  const weakMapHas = WeakMap.prototype.has;

  type PositionData = { coords: GeolocationCoordinates; timestamp: number };
  type ErrorData = { code: number; message: string };

  const positions = new _WeakMap<object, PositionData>();
  const coordinates = new _WeakMap<object, CoordinatesData>();
  const errors = new _WeakMap<object, ErrorData>();

  function patchGetters<T extends object>(proto: object, store: WeakMap<object, T>, keys: readonly (keyof T & string)[]) {
    for (const key of keys) {
      mask.replaceGetter(proto, key, (target, thisArg, args) => {
        if (typeof thisArg === "object" && thisArg !== null && apply(weakMapHas, store, [thisArg])) {
          return (apply(weakMapGet, store, [thisArg]) as T)[key];
        }
        return apply(target, thisArg, args);
      });
    }
  }

  function patchToJSON<T extends object>(proto: object, store: WeakMap<object, T>, toJSON: (data: T) => object) {
    mask.replaceMethod(proto, "toJSON", (target, thisArg, args) => {
      if (typeof thisArg === "object" && thisArg !== null && apply(weakMapHas, store, [thisArg])) {
        return toJSON(apply(weakMapGet, store, [thisArg]) as T);
      }
      return apply(target, thisArg, args);
    });
  }

  // toJSON() mirrors the native [Default] toJSON of each browser: the key
  // order follows the attribute order in that browser's WebIDL, and Firefox
  // returns the GeolocationCoordinates object itself as `coords` (it is then
  // serialized through its own toJSON).
  const isFirefox = import.meta.env.FIREFOX;

  function coordinatesToJSON(data: CoordinatesData) {
    if (isFirefox) {
      return {
        latitude: data.latitude,
        longitude: data.longitude,
        altitude: data.altitude,
        accuracy: data.accuracy,
        altitudeAccuracy: data.altitudeAccuracy,
        heading: data.heading,
        speed: data.speed,
      };
    }
    return {
      accuracy: data.accuracy,
      latitude: data.latitude,
      longitude: data.longitude,
      altitude: data.altitude,
      altitudeAccuracy: data.altitudeAccuracy,
      heading: data.heading,
      speed: data.speed,
    };
  }

  patchGetters(GeolocationCoordinates.prototype, coordinates, [
    "latitude", "longitude", "altitude", "accuracy", "altitudeAccuracy", "heading", "speed",
  ]);
  patchToJSON(GeolocationCoordinates.prototype, coordinates, coordinatesToJSON);

  patchGetters(GeolocationPosition.prototype, positions, ["coords", "timestamp"]);
  patchToJSON(GeolocationPosition.prototype, positions, (data) => isFirefox
    ? { coords: data.coords, timestamp: data.timestamp }
    : {
      timestamp: data.timestamp,
      coords: coordinatesToJSON(apply(weakMapGet, coordinates, [data.coords]) as CoordinatesData),
    });

  patchGetters(GeolocationPositionError.prototype, errors, ["code", "message"]);

  const coordinatesProto = GeolocationCoordinates.prototype;
  const positionProto = GeolocationPosition.prototype;
  const errorProto = GeolocationPositionError.prototype;

  return {
    createPosition(data: CoordinatesData, timestamp: number): GeolocationPosition {
      const coords = objectCreate(coordinatesProto) as GeolocationCoordinates;
      apply(weakMapSet, coordinates, [coords, { ...data }]);
      const position = objectCreate(positionProto) as GeolocationPosition;
      apply(weakMapSet, positions, [position, { coords, timestamp }]);
      return position;
    },

    createError(code: 1 | 2 | 3, message: string): GeolocationPositionError {
      const error = objectCreate(errorProto) as GeolocationPositionError;
      apply(weakMapSet, errors, [error, { code, message }]);
      return error;
    },
  };
}
