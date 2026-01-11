import { useState, useEffect } from "react";
import "./App.css";
import MapComponent from "@/components/MapComponent";
import maplibregl from "maplibre-gl";
import { FaPowerOff } from "react-icons/fa6";
import { Button } from "@/components/ui/button.tsx";
// @ts-expect-error: use @wxt-dev/i18n, see: https://wxt.dev/i18n#with-wxt
import { i18n } from "#i18n";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip.tsx";

function App() {
  const [isLoaded, setIsLoaded] = useState(false);
  const [fakeDefaultLatLng, setFakeDefaultLatLng] = useState<maplibregl.LngLat | null>(null);
  const [addonEnabled, setAddonEnabled] = useState(false);

  function onLatLngChanged(coordinates: maplibregl.LngLat) {
    browser.storage.local.set({
      fakeDefaultLatLng: {
        lat: coordinates.lat,
        lng: coordinates.lng,
      },
    });
  }

  useEffect(() => {
    browser.storage.local.get("fakeDefaultLatLng")
      .then((data) => {
        const coordinates = data.fakeDefaultLatLng as maplibregl.LngLat | undefined;
        if (coordinates) {
          setFakeDefaultLatLng(coordinates);
        }
        setIsLoaded(true);
      });
  }, []);

  useEffect(() => {
    browser.storage.local.get({ enabled: false })
      .then((data) => {
        setAddonEnabled(data.enabled as boolean);
      });

    function handleChange(changes: { [key: string]: Browser.storage.StorageChange }, areaName: Browser.storage.AreaName) {
      if (areaName !== "local") {
        return;
      }
      if (!Object.keys(changes).includes("enabled")) {
        return;
      }
      setAddonEnabled(changes["enabled"].newValue as boolean);
    }

    browser.storage.onChanged.addListener(handleChange);

    return () => {
      browser.storage.onChanged.removeListener(handleChange);
    }
  }, []);

  async function toggleAddonEnabled() {
    // if (!(await browser.storage.local.get("fakeDefaultLatLng")).fakeDefaultLatLng) {
    //   return;
    // }

    await browser.storage.local.set({
      enabled: !(await browser.storage.local.get({ enabled: false })).enabled
    });
  }

  return (
    <div className="flex flex-col w-full h-full gap-4">
      <div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" className="size-30 p-0 rounded-full" onClick={toggleAddonEnabled}>
              <FaPowerOff className="size-full" color={addonEnabled ? "blue" : "gray"} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{addonEnabled ? i18n.t("popup.addonEnabledTooltip") : i18n.t("popup.addonDisabledTooltip")}</p>
          </TooltipContent>
        </Tooltip>
        <hr className="my-2" />
      </div>
      <div className="basis-full flex flex-col gap-2">
        <h2 className="text-[1.2rem] font-bold">{i18n.t("popup.setFakeGeolocationTitle")}</h2>
        <p>{i18n.t("popup.setFakeGeolocationDescription")}</p>
        <p className="text-[0.8rem]">{i18n.t("popup.setFakeGeolocationHint")}</p>
        {isLoaded ?
          <MapComponent className="basis-full" defaultLatLng={fakeDefaultLatLng} onLatLngChanged={onLatLngChanged} /> :
          <div></div>
        }
        <ul>
          <li className="inline mr-2">
            <a href="https://typeling1578.notion.site/Fake-geolocation-with-joystick-How-to-use-2de45a9a961a802b9e2adb3634023542" target="blank">
              <small>How to use</small>
            </a>
          </li>
          <li className="inline mr-2">
            <a href="https://www.patreon.com/typeling1578" target="blank">
              <small>Donate</small>
            </a>
          </li>
          <li className="inline">
            <a href="/licenses.html" target="_blank">
              <small>Licenses</small>
            </a>
          </li>
        </ul>
      </div>
    </div>
  );
}

export default App;
