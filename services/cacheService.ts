import { LifeDestinyResult } from "../types";

const DB_NAME = "lifepath-kline-cache";
const DB_VERSION = 1;
const STORE_NAME = "results";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function normalizeText(s: string): string {
  return s.replace(/[\s\u3000]+/g, "").trim();
}

function extractBaziCore(rawText: string): string {
  const normalized = normalizeText(rawText);
  const fields: string[] = [];

  const patterns = [
    /年柱[：:](.+?)(?=日柱|月柱|时柱|起运|大运|出生|$)/,
    /月柱[：:](.+?)(?=日柱|时柱|年柱|起运|大运|出生|$)/,
    /日柱[：:](.+?)(?=时柱|月柱|年柱|起运|大运|出生|$)/,
    /时柱[：:](.+?)(?=起运|大运|出生|年柱|月柱|日柱|$)/,
    /起运年龄[：:](.+?)(?=大运|出生|年柱|月柱|日柱|时柱|$)/,
    /大运[：:](.+?)(?=出生|年柱|月柱|日柱|时柱|起运|$)/,
    /出生年份[：:](.+?)(?=年柱|月柱|日柱|时柱|起运|大运|$)/,
  ];

  for (const pattern of patterns) {
    const m = normalized.match(pattern);
    if (m) {
      fields.push(m[1].replace(/[，,、\s\u3000]+/g, ""));
    }
  }

  return fields.length > 0 ? fields.join("|") : normalized;
}

async function makeCacheKey(name: string, gender: string, rawText: string): Promise<string> {
  const baziCore = extractBaziCore(rawText);
  const data = `${name}|${gender}|${baziCore}`;
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(data));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function getFromCache(name: string, gender: string, rawText: string): Promise<LifeDestinyResult | null> {
  try {
    const key = await makeCacheKey(name, gender, rawText);
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(key);
      request.onsuccess = () => {
        const val = request.result;
        db.close();
        resolve(val ?? null);
      };
      request.onerror = () => {
        db.close();
        reject(request.error);
      };
    });
  } catch {
    return null;
  }
}

export async function saveToCache(name: string, gender: string, rawText: string, result: LifeDestinyResult): Promise<void> {
  try {
    const key = await makeCacheKey(name, gender, rawText);
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = store.put(result, key);
      request.onsuccess = () => {};
      request.onerror = () => {};
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  } catch {
    // 存缓存失败不阻断主流程
  }
}

export async function clearCache(): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.clear();
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  } catch {
    // ignore
  }
}
