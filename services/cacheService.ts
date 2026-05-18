import { LifeDestinyResult, DirectionResult, DirectionType } from "../types";

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

function normalizeText(s: string): string {
  return s
    .replace(/[\s\u3000]+/g, "")
    .replace(/[：:]/g, ":")
    .trim();
}

function extractField(text: string, pattern: RegExp): string {
  const m = text.match(pattern);
  if (!m) return "";
  return m[1]
    .replace(/[，,、\s\u3000]+/g, ",")
    .replace(/[岁年]/g, "")
    .replace(/^,+|,+$/g, "")
    .trim();
}

function extractBaziCore(rawText: string): string {
  const normalized = normalizeText(rawText);

  const fields = [
    extractField(normalized, /年柱:(.+?)(?=日柱:|月柱:|时柱:|起运|大运|出生|$)/),
    extractField(normalized, /月柱:(.+?)(?=日柱:|时柱:|年柱:|起运|大运|出生|$)/),
    extractField(normalized, /日柱:(.+?)(?=时柱:|月柱:|年柱:|起运|大运|出生|$)/),
    extractField(normalized, /时柱:(.+?)(?=起运|大运|出生|月柱:|日柱:|年柱:|$)/),
    extractField(normalized, /起运年龄:(.+?)(?=大运|出生|年柱:|月柱:|日柱:|时柱:|$)/),
    extractField(normalized, /大运:(.+?)(?=出生|年柱:|月柱:|日柱:|时柱:|起运|$)/),
    extractField(normalized, /出生年份:(.+?)(?=年柱:|月柱:|日柱:|时柱:|起运|大运|$)/),
  ];

  const nonEmpty = fields.filter(f => f.length > 0);
  if (nonEmpty.length >= 4) return nonEmpty.join("|");
  return normalized;
}

export async function makeCacheKey(name: string, gender: string, rawText: string): Promise<string> {
  const baziCore = extractBaziCore(rawText);
  const data = `${name}|${gender}|${baziCore}`;
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(data));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

async function fetchFromD1(key: string): Promise<LifeDestinyResult | null> {
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

export async function saveSectionsToD1(key: string, name: string, gender: string, rawText: string, sections: Record<string, string>): Promise<void> {
  if (!API_BASE) return;
  try {
    fetch(`${API_BASE}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, name, gender, rawText, sections }),
    });
  } catch {}
}

async function saveToD1(key: string, name: string, gender: string, rawText: string, result: LifeDestinyResult): Promise<void> {
  if (!API_BASE) return;
  try {
    fetch(`${API_BASE}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, name, gender, rawText, result }),
    });
  } catch {}
}

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

export async function getFromCache(name: string, gender: string, rawText: string): Promise<LifeDestinyResult | null> {
  const key = await makeCacheKey(name, gender, rawText);

  const local = await getFromIDB(key);
  if (local) return local;

  const remote = await fetchFromD1(key);
  if (remote) {
    saveToIDB(key, remote);
    return remote;
  }

  return null;
}

export async function saveToCache(name: string, gender: string, rawText: string, result: LifeDestinyResult): Promise<void> {
  const key = await makeCacheKey(name, gender, rawText);
  saveToIDB(key, result);
  saveToD1(key, name, gender, rawText, result);
}

async function makeDirectionKey(name: string, gender: string, rawText: string, direction: DirectionType, orientation?: string): Promise<string> {
  const base = await makeCacheKey(name, gender, rawText);
  const suffix = orientation ? `:${orientation}` : '';
  return `${base}:${direction}${suffix}`;
}

export async function getDirectionCache(name: string, gender: string, rawText: string, direction: DirectionType, orientation?: string): Promise<DirectionResult | null> {
  const key = await makeDirectionKey(name, gender, rawText, direction, orientation);
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

export async function saveDirectionCache(name: string, gender: string, rawText: string, direction: DirectionType, result: DirectionResult, orientation?: string): Promise<void> {
  const key = await makeDirectionKey(name, gender, rawText, direction, orientation);
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
