// import { cleanupMaxMindDB } from "@/lib/geolite.ts";

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener((details) => {
    if (details.reason == "install") {
      browser.tabs.create({
        url: "https://typeling1578.notion.site/Fake-geolocation-with-joystick-How-to-use-2de45a9a961a802b9e2adb3634023542",
      });
    }
  });

  // (async () => {
  //   const alarm = await browser.alarms.get("cleanup-maxminddb");
  //   if (!alarm) {
  //     await browser.alarms.create("cleanup-maxminddb", { periodInMinutes: 1 });
  //   }
  //
  //   browser.alarms.onAlarm.addListener((alarm) => {
  //     switch (alarm.name) {
  //       case "cleanup-maxminddb":
  //         // console.log("Cleanup maxminddb");
  //         cleanupMaxMindDB();
  //         break;
  //       default:
  //         break;
  //     }
  //   });
  // })();
});
