import fetchCore from "@/lib/fetch-core.ts";

const SERVERS = [
  "https://protomaps.typeling1578.dev/pmtiles/download.php",
  "https://archive.org/download/protomaps-basemap-full-planet-file/20260104.pmtiles",
];

export default async function protomapsServerSelector() {
  for (const server of SERVERS) {
    try {
      const result = await fetchCore(server, {
        timeout: 2000,
        headers: {
          "range": "bytes=0-6",
        },
      });

      if (await result.text() === "PMTiles") {
        return server;
      }
    } catch (error) {
      console.error(error);
    }
  }

  return SERVERS[0];
}