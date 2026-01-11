import { useRef, useEffect, useState, CSSProperties } from "react";
import { layers, namedFlavor } from "@protomaps/basemaps";
import maplibregl from "maplibre-gl";
import { Protocol } from "pmtiles";
import "maplibre-gl/dist/maplibre-gl.css";
import { getIpLocation } from "@/lib/geolite.ts";
import {getPublicIPsWithApi, getPublicIPsWithWebRTC} from "@/lib/get-public-ip.ts";
import { Button } from "@/components/ui/button.tsx";
import { FaLocationCrosshairs } from "react-icons/fa6";
import {Tooltip, TooltipContent, TooltipTrigger} from "@/components/ui/tooltip.tsx";
import { Spinner } from "@/components/ui/spinner";
// @ts-expect-error: use @wxt-dev/i18n, see: https://wxt.dev/i18n#with-wxt
import { i18n } from "#i18n";
import protomapsServerSelector from "@/lib/protomaps-server-selector.ts";

export default function MapComponent({ style, className, defaultLatLng, onLatLngChanged }: { style?: CSSProperties, className?: string, defaultLatLng?: maplibregl.LngLatLike | null, onLatLngChanged: (coordinates: maplibregl.LngLat) => void }) {
  const theme = "light";
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const [map, setMap] = useState<maplibregl.Map | null>(null);
  const [marker, setMarker] = useState<maplibregl.Marker | null>(null);
  const [settingToCurrentLocation, setSettingToCurrentLocation] = useState(false);

  useEffect(() => {
    const protocol = new Protocol();
    maplibregl.addProtocol("pmtiles", protocol.tile);

    const map = new maplibregl.Map({
      container: mapContainer.current!,
      // style: {
      //   version: 8,
      //   glyphs: "https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf",
      //   sprite: "https://protomaps.github.io/basemaps-assets/sprites/v3/" + theme,
      //   sources: {
      //     protomaps: {
      //       type: "vector",
      //       url: "pmtiles://https://protomaps.typeling1578.dev/pmtiles/download.php",
      //       attribution: '<a href="https://protomaps.com">Protomaps</a> © <a href="https://openstreetmap.org">OpenStreetMap</a>',
      //     },
      //   },
      //   layers: layers("protomaps", namedFlavor(theme), { lang: "en" }),
      // },
      center: defaultLatLng ?? undefined,
      zoom: defaultLatLng ? 10 : 0,
    });

    let marker = new maplibregl.Marker();

    if (defaultLatLng) {
      marker.setLngLat(defaultLatLng).addTo(map);
    }

    map.on("click", (e) => {
      const coordinates = e.lngLat;
      marker.setLngLat(coordinates).addTo(map);
      onLatLngChanged(coordinates);
    });

    setMap(map);
    setMarker(marker);

    (async () => {
      const protomapsServer = await protomapsServerSelector();

      map.setStyle({
        version: 8,
        glyphs: "https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf",
        sprite: "https://protomaps.github.io/basemaps-assets/sprites/v3/" + theme,
        sources: {
          protomaps: {
            type: "vector",
            url: `pmtiles://${protomapsServer}`,
            attribution: '<a href="https://protomaps.com">Protomaps</a> © <a href="https://openstreetmap.org">OpenStreetMap</a>',
          },
        },
        layers: layers("protomaps", namedFlavor(theme), { lang: "en" }),
      });
    })();

    return () => {
      map.remove();
      maplibregl.removeProtocol("pmtiles");
    }
  }, []);

  async function setToCurrentLocation(useGeoLite = false) {
    if (!marker || !map) {
      return;
    }

    let coordinates: maplibregl.LngLat;
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
      coordinates = new maplibregl.LngLat(
        position.coords.longitude,
        position.coords.latitude,
      );
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

    map.setZoom(10);
    map.setCenter(coordinates);
    marker.setLngLat(coordinates).addTo(map);
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
        <div className="w-full h-full" ref={mapContainer} />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button className="absolute bottom-[60px] right-[10px] rounded-full" disabled={settingToCurrentLocation} onClick={handleSetToCurrentLocationClick}>
              {settingToCurrentLocation ? <Spinner /> : <FaLocationCrosshairs />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{i18n.t("mapComponent.setToCurrentLocationTooltip")}</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}