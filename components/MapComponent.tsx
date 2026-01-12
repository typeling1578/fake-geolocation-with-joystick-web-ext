import { useEffect, useState, useRef, CSSProperties } from "react";
import L from "leaflet";
import { leafletLayer } from "protomaps-leaflet";
import { PMTiles } from "pmtiles";
import "leaflet/dist/leaflet.css";
import { getIpLocation } from "@/lib/geolite.ts";
import {getPublicIPsWithApi, getPublicIPsWithWebRTC} from "@/lib/get-public-ip.ts";
import { Button } from "@/components/ui/button.tsx";
import { FaLocationCrosshairs } from "react-icons/fa6";
import {Tooltip, TooltipContent, TooltipTrigger} from "@/components/ui/tooltip.tsx";
import { Spinner } from "@/components/ui/spinner";
// @ts-expect-error: use @wxt-dev/i18n, see: https://wxt.dev/i18n#with-wxt
import { i18n } from "#i18n";
import protomapsServerSelector from "@/lib/protomaps-server-selector.ts";

type LatLng = { lat: number, lng: number };

export default function MapComponent({ style, className, defaultLatLng, onLatLngChanged }: { style?: CSSProperties, className?: string, defaultLatLng?: LatLng | null, onLatLngChanged: (coordinates: LatLng) => void }) {
  const theme = "light";
  const [map, setMap] = useState<L.Map | null>(null);
  const marker = useRef<L.LayerGroup<any> | null>(null);
  const [settingToCurrentLocation, setSettingToCurrentLocation] = useState(false);

  // ---------------------------------------------------------
  // Helper function to create markers that display even when crossing boundaries
  // ---------------------------------------------------------
  function addWrappedMarker([lat, lng]: [number, number], options = {}) {
    // Prepare three coordinates (center, left world, right world)
    const positions = [
      [lat, lng],
      [lat, lng - 360],
      [lat, lng + 360]
    ];

    const group = L.layerGroup();

    positions.forEach(function(pos) {
      const marker = L.marker(pos as [number, number], options);
      group.addLayer(marker);
    });

    return group;
  }

  useEffect(() => {
    const map = L.map("map", {
      center: [0, 0],
      zoom: 0,
      maxBounds: L.latLngBounds([-90, -Infinity], [90, Infinity]),
      maxBoundsViscosity: 1.0,
      worldCopyJump: true,
    });
    if (defaultLatLng) {
      map.setView([defaultLatLng.lat, defaultLatLng.lng], 10);
      marker.current = addWrappedMarker([defaultLatLng.lat, defaultLatLng.lng]).addTo(map);
    }

    (async () => {
      const protomapsServer = await protomapsServerSelector();

      const layer = leafletLayer({
        // @ts-expect-error: https://github.com/protomaps/protomaps-leaflet/blob/7aeddd926cbfef084fb72c1be45b3bab7532fe45/src/view.ts#L250
        url: new PMTiles(protomapsServer),
        flavor: theme,
        attribution: '<a href="https://protomaps.com">Protomaps</a> © <a href="https://openstreetmap.org">OpenStreetMap</a>'
      });
      layer.addTo(map);
    })();

    map.on("click", (e: any) => {
      const {lat, lng} = e.latlng.wrap();
      if (marker.current) {
        marker.current.remove();
      }
      marker.current = addWrappedMarker([lat, lng]).addTo(map);
      onLatLngChanged({ lat, lng });
    });

    setMap(map);

    return () => {
      map.remove();
    };
  }, []);

  async function setToCurrentLocation(useGeoLite = false) {
    if (!map) {
      return;
    }

    let coordinates: LatLng;
    if (navigator.geolocation && !useGeoLite) {
      let position: GeolocationPosition;
      try {
        position = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            maximumAge: 0,
            timeout: 1000 * 10,
          });
        });
      } catch (error) {
        console.error(error);
        return setToCurrentLocation(true);
      }
      coordinates = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      };
    } else {
      let ips = await getPublicIPsWithApi();
      if (!ips.ipv4 && !ips.ipv6) {
        ips = await getPublicIPsWithWebRTC();
        if (!ips.ipv4 && !ips.ipv6) {
          throw new Error("No IP address found!");
        }
      }

      const result = await getIpLocation(ips.ipv4 ? ips.ipv4! : ips.ipv6!);
      if (!result) {
        throw new Error("No IP address location found!");
      }

      coordinates = result;
    }

    map.setView([coordinates.lat, coordinates.lng], 10);
    if (marker.current) {
      marker.current.remove();
    }
    marker.current = addWrappedMarker([coordinates.lat, coordinates.lng]).addTo(map);
    onLatLngChanged(coordinates);
  }

  async function handleSetToCurrentLocationClick() {
    setSettingToCurrentLocation(true);
    try {
      await setToCurrentLocation();
    } catch (e) {
      console.error(e);
    }
    setSettingToCurrentLocation(false);
  }

  return (
    <div style={style} className={className}>
      <div className="relative w-full h-full">
        <div className="w-full h-full" id="map" />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button className="absolute bottom-[60px] right-[10px] rounded-full z-[9999]" disabled={settingToCurrentLocation} onClick={handleSetToCurrentLocationClick}>
              {settingToCurrentLocation ? <Spinner /> : <FaLocationCrosshairs />}
            </Button>
          </TooltipTrigger>
          <TooltipContent className="z-[9999]">
            <p>{i18n.t("mapComponent.setToCurrentLocationTooltip")}</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}