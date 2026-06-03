import { LifeDestinyResult, DirectionResult, DirectionType, BaziPillars } from "../types";

const DB_NAME = "lifepath-kline-cache";
const DB_VERSION = 3;
const STORE_NAME = "results";
const DIRECTION_STORE = "directions";

const API_BASE = import.meta.env.PROD ? "/api/results" : "";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
      if (!db.objectStoreNames.contains(DIRECTION_STORE)) {
        db.createObjectStore(DIRECTION_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

export async function makeCacheKey(name: string, gender: string, pillars: BaziPillars): Promise<string> {
  const core = [pillars.year || '', pillars.month || '', pillars.day || '', pillars.hour || ''].join('|');
  const data = `${name}|${gender}|${core}`;

  if (typeof crypto !== 'undefined' && crypto.subtle) {
    try {
      const encoder = new TextEncoder();
      const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(data));
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
    } catch (e) {
      console.warn('crypto.subtle 不可用，使用 fallback hash:', e);
    }
  }

  return simpleHash(data) + simpleHash(data.split('').reverse().join(''));
}

function pillarsToText(pillars: BaziPillars): string {
  return [pillars.year, pillars.month, pillars.day, pillars.hour].filter(Boolean).join(' ');
}

// ========== D1 读写 ==========

async function fetchFromD1(key: string): Promise<LifeDestinyResult | DirectionResult | null> {
  if (!API_BASE) return null;
  try {
    const res = await fetch(`${API_BASE}?key=${encodeURIComponent(key)}`);
    if (!res.ok) return null;
    const text = await res.text();
    if (!text || text === "null") return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function saveToD1(key: string, name: string, gender: string, pillars: BaziPillars, result: LifeDestinyResult | DirectionResult): Promise<void> {
  if (!API_BASE) return;
  try {
    await fetch(`${API_BASE}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, name, gender, rawText: pillarsToText(pillars), result }),
    }).catch(() => {});
  } catch {}
}

export async function saveSectionsToD1(key: string, name: string, gender: string, pillars: BaziPillars, sections: Record<string, string>): Promise<void> {
  if (!API_BASE) return;
  try {
    await fetch(`${API_BASE}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, name, gender, rawText: pillarsToText(pillars), sections }),
    }).catch(() => {});
  } catch {}
}

// ========== IndexedDB 读写 ==========

async function getFromIDB(key: string): Promise<LifeDestinyResult | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => { db.close(); resolve(req.result ?? null); };
      req.onerror = () => { db.close(); reject(req.error); };
    });
  } catch {
    return null;
  }
}

async function getDirectionFromIDB(key: string): Promise<DirectionResult | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DIRECTION_STORE, "readonly");
      const store = tx.objectStore(DIRECTION_STORE);
      const req = store.get(key);
      req.onsuccess = () => { db.close(); resolve(req.result ?? null); };
      req.onerror = () => { db.close(); reject(req.error); };
    });
  } catch {
    return null;
  }
}

async function saveToIDB(key: string, result: LifeDestinyResult): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.put(result, key);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
      tx.onabort = () => { db.close(); reject(tx.error); };
    });
  } catch {}
}

async function saveDirectionToIDB(key: string, result: DirectionResult): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DIRECTION_STORE, "readwrite");
      const store = tx.objectStore(DIRECTION_STORE);
      store.put(result, key);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  } catch {}
}

// ========== K线主缓存 ==========

export async function getFromCache(name: string, gender: string, pillars: BaziPillars): Promise<LifeDestinyResult | null> {
  const key = await makeCacheKey(name, gender, pillars);

  const local = await getFromIDB(key);
  if (local) return local;

  const remote = await fetchFromD1(key) as LifeDestinyResult | null;
  if (remote) {
    saveToIDB(key, remote);
    return remote;
  }

  return null;
}

export async function saveToCache(name: string, gender: string, pillars: BaziPillars, result: LifeDestinyResult): Promise<void> {
  const key = await makeCacheKey(name, gender, pillars);
  saveToIDB(key, result);
  saveToD1(key, name, gender, pillars, result);
}

// ========== 方向分析缓存 (IndexedDB + D1) ==========

async function makeDirectionKey(name: string, gender: string, pillars: BaziPillars, direction: DirectionType, orientation?: string): Promise<string> {
  const base = await makeCacheKey(name, gender, pillars);
  const suffix = orientation ? `:${orientation}` : '';
  return `${base}:${direction}${suffix}`;
}

export async function getDirectionCache(name: string, gender: string, pillars: BaziPillars, direction: DirectionType, orientation?: string): Promise<DirectionResult | null> {
  const key = await makeDirectionKey(name, gender, pillars, direction, orientation);

  const local = await getDirectionFromIDB(key);
  if (local) return local;

  const remote = await fetchFromD1(key) as DirectionResult | null;
  if (remote) {
    saveDirectionToIDB(key, remote);
    return remote;
  }

  return null;
}

export async function saveDirectionCache(name: string, gender: string, pillars: BaziPillars, direction: DirectionType, result: DirectionResult, orientation?: string): Promise<void> {
  const key = await makeDirectionKey(name, gender, pillars, direction, orientation);
  saveDirectionToIDB(key, result);
  saveToD1(key, name, gender, pillars, result);
}

// ========== 清理 ==========

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
