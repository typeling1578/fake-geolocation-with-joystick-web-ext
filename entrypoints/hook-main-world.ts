export default defineUnlistedScript(() => {
  const script = document.currentScript;

  if (!script) {
    return;
  }

  if (!script?.dataset["default_position"]) {
    return;
  }
  const current_position: [number, number] = JSON.parse(script.dataset["default_position"]);

  // const orig_watchPosition = navigator.geolocation.watchPosition;
  // const orig_clearWatch = navigator.geolocation.clearWatch;
  // const orig_getCurrentPosition = navigator.geolocation.getCurrentPosition;

  function createPositionData() {
    const position = {
      coords: {
        latitude: current_position[0],
        longitude: current_position[1],
        altitude: null,
        accuracy: 0,
        altitudeAccuracy: null,
        heading: null,
        speed: null,
        toJSON: function () {
          return JSON.parse(JSON.stringify(this));
        }
      },
      timestamp: Date.now(),
      toJSON: function () {
        return JSON.parse(JSON.stringify(this));
      }
    };

    return position;
  }

  let watchIdCount = 0;
  const watchPositionListeners = new Map<number, PositionCallback>();

  navigator.geolocation.watchPosition = function (successCallback: PositionCallback, errorCallback?: PositionErrorCallback | null, options?: PositionOptions): number {
    const watchId = ++watchIdCount;
    watchPositionListeners.set(watchId, successCallback)

    setTimeout(() => {
      successCallback(createPositionData());
    }, 100);

    return watchId;
  }

  navigator.geolocation.clearWatch = function (watchId: number) {
    watchPositionListeners.delete(watchId);
  }

  navigator.geolocation.getCurrentPosition = function (successCallback: PositionCallback, errorCallback?: PositionErrorCallback | null, options?: PositionOptions) {
    setTimeout(() => {
      successCallback(createPositionData());
    }, 100);
  }

  let joystickX = 0;
  let joystickY = 0;

  script.addEventListener("default-position-changed", function (event) {
    if (event instanceof CustomEvent) {
      current_position[0] = event.detail.lat;
      current_position[1] = event.detail.lng;
    }
  });

  script.addEventListener("joystick-onmove", function (event) {
    if (event instanceof CustomEvent) {
      joystickX = event.detail.x;
      joystickY = event.detail.y;
    }
  });

  let oldLat = current_position[0];
  let oldLng = current_position[1];
  setInterval(() => {
    current_position[0] += 0.0005 * joystickY;
    current_position[1] += 0.0005 * joystickX;

    if (oldLat !== current_position[0] || oldLng !== current_position[1]) {
      oldLat = current_position[0];
      oldLng = current_position[1];

      for (const [, callback] of watchPositionListeners) {
        try {
          callback(createPositionData());
        } catch (e) {
          console.error(e);
        }
      }
    }
  }, 1000);
});