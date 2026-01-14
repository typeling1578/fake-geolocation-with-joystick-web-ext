import { Buffer } from "buffer/";
import * as mmdb from "mmdb-lib";
import { CityResponse } from "mmdb-lib";
import { TarReader } from "@gera2ld/tarjs";
import fetchCore from "@/lib/fetch-core.ts";

const DOWNLOAD_BASE_URL = "https://raw.githubusercontent.com/GitSquared/node-geolite2-redist/refs/heads/master/redist/";

const INDEXED_DB_NAME = "geolite";
const INDEXED_DB_STORE_NAME = "mmdb";
const INDEXED_DB_MMDB_AGE = 1000 * 60 * 60 * 24; // 1 day

type MaxMindDBTypes = "ASN" | "City" | "Country";
type MmdbIDB = { type: MaxMindDBTypes, blob: Blob, timestamp: Date };

function openIndexedDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(INDEXED_DB_NAME, 1);

    request.onupgradeneeded = (e) => {
      // @ts-ignore
      const db = e.target.result as IDBDatabase;
      if (!db.objectStoreNames.contains(INDEXED_DB_STORE_NAME)) {
        db.createObjectStore(INDEXED_DB_STORE_NAME, { keyPath: "type" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function putMaxMindDBToIndexedDB(type: MaxMindDBTypes, blob: Blob): Promise<IDBValidKey> {
  const db = await openIndexedDB();
  const tx = db.transaction(INDEXED_DB_STORE_NAME, "readwrite");
  const store = tx.objectStore(INDEXED_DB_STORE_NAME);

  return new Promise((resolve, reject) => {
    const request = store.put({ type, blob, timestamp: new Date() });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getMaxMindDBFromIndexedDB(type: MaxMindDBTypes): Promise<MmdbIDB | undefined> {
  const db = await openIndexedDB();
  const tx = db.transaction(INDEXED_DB_STORE_NAME, "readonly");
  const store = tx.objectStore(INDEXED_DB_STORE_NAME);

  return new Promise((resolve, reject) => {
    const request = store.get(type);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function deleteMaxMindDBFromIndexedDB(type: MaxMindDBTypes): Promise<void> {
  const db = await openIndexedDB();
  const tx = db.transaction(INDEXED_DB_STORE_NAME, "readwrite");
  const store = tx.objectStore(INDEXED_DB_STORE_NAME);

  return new Promise((resolve, reject) => {
    const request = store.delete(type);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function downloadMaxMindDB(type: MaxMindDBTypes) {
  const result = await fetchCore(`${DOWNLOAD_BASE_URL}/GeoLite2-${type}.tar.gz`);

  const compressed = await result.blob();
  const decompressedArrayBuffer = await new Response(
    compressed.stream().pipeThrough(new DecompressionStream("gzip"))
  ).arrayBuffer();

  const tarReader = await TarReader.load(decompressedArrayBuffer)
  return tarReader.getFileBlob(
    tarReader.fileInfos.find(fileInfo =>
      fileInfo.name.endsWith(".mmdb"))!.name
  );
}

async function getMaxMindDB(type: MaxMindDBTypes) {
  let mmdbData;
  try {
    // const mmdbIdb = await getMaxMindDBFromIndexedDB("City");
    const mmdbIdb = undefined as MmdbIDB | undefined;
    if (mmdbIdb) {
      if (Date.now() - mmdbIdb.timestamp.getTime() > INDEXED_DB_MMDB_AGE) {
        // await deleteMaxMindDBFromIndexedDB(type);
      } else {
        mmdbData = mmdbIdb.blob;
      }
    }
  } catch (e) {
    console.error(e);
  }
  if (!mmdbData) {
    mmdbData = await downloadMaxMindDB(type);
    // await putMaxMindDBToIndexedDB(type, mmdbData);
  }

  return Buffer.from(await mmdbData.arrayBuffer());
}

export async function getIpLocation(ip: string) {
  const mmdbData = await getMaxMindDB("City");

  // @ts-ignore
  const { latitude, longitude } = new mmdb.Reader<CityResponse>(mmdbData)
    .get(ip)?.location ||
    { latitude: null, longitude: null };

  return (Number.isFinite(longitude) && Number.isFinite(latitude)) ?
    { lat: latitude!, lng: longitude! } :
    null;
}

export async function cleanupMaxMindDB() {
  const db = await openIndexedDB();
  const tx = db.transaction(INDEXED_DB_STORE_NAME, "readwrite");
  const store = tx.objectStore(INDEXED_DB_STORE_NAME);

  const mmdbIdbs: MmdbIDB[] = await new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  for (const mmdbIdb of mmdbIdbs) {
    if (Date.now() - mmdbIdb.timestamp.getTime() > INDEXED_DB_MMDB_AGE) {
      await deleteMaxMindDBFromIndexedDB(mmdbIdb.type);
    }
  }
}