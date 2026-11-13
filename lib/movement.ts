/** Mean Earth radius in meters (IUGG). */
const EARTH_RADIUS_M = 6_371_008.8;

/** Latitude is kept inside this range so that cos(lat) never reaches 0. */
const MAX_LATITUDE = 89.9999;

/** Movement speed presets, in meters per second at full joystick tilt. */
export const SPEED_PRESETS = {
  walk: 5 / 3.6, // 5 km/h
  run: 10 / 3.6, // 10 km/h
  bicycle: 20 / 3.6, // 20 km/h
  car: 60 / 3.6, // 60 km/h
} as const;

export type SpeedPreset = keyof typeof SPEED_PRESETS;

export const DEFAULT_SPEED_MPS: number = SPEED_PRESETS.walk;

/** Upper bound accepted for a custom speed (≈ 1000 km/h). */
export const MAX_SPEED_MPS = 280;

export function isValidSpeed(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= MAX_SPEED_MPS;
}

export type Motion = {
  /** Ground speed in meters per second. */
  speed: number;
  /**
   * Direction of travel in degrees clockwise from true north, in [0, 360).
   * NaN while not moving, as required by the Geolocation API.
   */
  heading: number;
};

/**
 * Convert joystick input into speed and heading.
 *
 * @param x Joystick X axis in [-1, 1] (positive = east)
 * @param y Joystick Y axis in [-1, 1] (positive = north)
 * @param maxSpeed Speed at full tilt, in meters per second
 */
export function joystickToMotion(x: number, y: number, maxSpeed: number): Motion {
  const magnitude = Math.min(1, Math.hypot(x, y));
  if (magnitude === 0) {
    return { speed: 0, heading: NaN };
  }
  const heading = (Math.atan2(x, y) * 180 / Math.PI + 360) % 360;
  return { speed: magnitude * maxSpeed, heading };
}

/** Wrap a longitude into [-180, 180). */
export function wrapLongitude(lng: number): number {
  return ((lng + 180) % 360 + 360) % 360 - 180;
}

/**
 * Move a point by a distance along a heading.
 *
 * Uses a local flat-earth approximation, which is accurate for the short
 * distances covered in one update. The east-west step is divided by
 * cos(latitude), so the ground speed is the same at every latitude.
 */
export function movePosition(
  [lat, lng]: readonly [number, number],
  motion: Motion,
  seconds: number,
): [number, number] {
  if (motion.speed === 0 || seconds <= 0) {
    return [lat, lng];
  }
  const distance = motion.speed * seconds;
  const headingRad = motion.heading * Math.PI / 180;
  const north = distance * Math.cos(headingRad);
  const east = distance * Math.sin(headingRad);

  const dLat = (north / EARTH_RADIUS_M) * 180 / Math.PI;
  const dLng = (east / (EARTH_RADIUS_M * Math.cos(lat * Math.PI / 180))) * 180 / Math.PI;

  const newLat = Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, lat + dLat));
  return [newLat, wrapLongitude(lng + dLng)];
}
