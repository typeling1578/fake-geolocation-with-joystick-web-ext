export default defineBackground(() => {
  browser.runtime.onInstalled.addListener((details) => {
    if (details.reason == "install") {
      browser.tabs.create({
        url: "https://typeling1578.notion.site/Fake-geolocation-with-joystick-How-to-use-2de45a9a961a802b9e2adb3634023542",
      });
    }
  });
});
