/**
 * Cinejoy/Wing "lumen-gate-v2" client.
 *
 * Browser flow from cinejoy.pk (DHJgaGwg.js):
 *   1. GET /servers
 *   2. Load /crush.wasm, seal_request({ path: "/{server}/movie|series", payload })
 *   3. POST sealed body to /g as text/plain
 *   4. AES-GCM decrypt the response (AD = "lumen-gate-v2" + [0,2,keyId] + eph pub)
 *
 * HLS then lives on hosts like ok.solarpanelcleaning.cc (tokenized playlists).
 */
import type { MediaType, StreamResponse, StreamSource } from "../types";
import { sortSourcesByQuality } from "../stream-utils";

const DEFAULT_BASE = "https://api.wing.st";
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

const RANDOM_LEN = 44;
const RESPONSE_KEY_LEN = 32;
const KEY_ID_LEN = 1;
const EPHEMERAL_PUB_LEN = 65;
const HEADER_LEN = RESPONSE_KEY_LEN + KEY_ID_LEN + EPHEMERAL_PUB_LEN; // 98
const GCM_IV_LEN = 12;
const GCM_TAG_LEN = 16;
const AD_PREFIX = new TextEncoder().encode("lumen-gate-v2");

type WasmExports = {
  memory: WebAssembly.Memory;
  alloc: (n: number) => number;
  dealloc: (ptr: number, n: number) => void;
  seal_request: (
    jsonPtr: number,
    jsonLen: number,
    randPtr: number,
    randLen: number,
    outPtr: number,
    outCap: number
  ) => number;
};

let wasmPromise: Promise<WasmExports> | null = null;

function wingHeaders(): HeadersInit {
  return {
    "User-Agent": BROWSER_UA,
    Accept: "*/*",
    Origin: "https://cinejoy.pk",
    Referer: "https://cinejoy.pk/",
  };
}

async function loadWasm(base: string): Promise<WasmExports> {
  if (!wasmPromise) {
    wasmPromise = (async () => {
      const res = await fetch(`${base.replace(/\/$/, "")}/crush.wasm`, {
        cache: "force-cache",
        headers: wingHeaders(),
      });
      if (!res.ok) throw new Error(`crush.wasm http ${res.status}`);
      const { instance } = await WebAssembly.instantiate(
        await res.arrayBuffer(),
        {}
      );
      return instance.exports as unknown as WasmExports;
    })();
  }
  return wasmPromise;
}

function writeBytes(mem: WebAssembly.Memory, ptr: number, data: Uint8Array) {
  new Uint8Array(mem.buffer).set(data, ptr);
}

function toArrayBuffer(u: Uint8Array): ArrayBuffer {
  return u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;
}

function seal(
  wasm: WasmExports,
  path: string,
  payload: Record<string, string>
): {
  responseKey: Uint8Array;
  keyId: number;
  ephemeralPublic: Uint8Array;
  body: Uint8Array;
} {
  const json = new TextEncoder().encode(JSON.stringify({ path, payload }));
  const rand = new Uint8Array(RANDOM_LEN);
  crypto.getRandomValues(rand);

  const outCap = json.length + 4096;
  const jsonPtr = wasm.alloc(json.length);
  const randPtr = wasm.alloc(rand.length);
  const outPtr = wasm.alloc(outCap);
  if (!jsonPtr || !randPtr || !outPtr) {
    if (jsonPtr) wasm.dealloc(jsonPtr, json.length);
    if (randPtr) wasm.dealloc(randPtr, rand.length);
    if (outPtr) wasm.dealloc(outPtr, outCap);
    throw new Error("wasm alloc failed");
  }

  try {
    writeBytes(wasm.memory, jsonPtr, json);
    writeBytes(wasm.memory, randPtr, rand);
    const outLen = wasm.seal_request(
      jsonPtr,
      json.length,
      randPtr,
      rand.length,
      outPtr,
      outCap
    );
    if (outLen <= HEADER_LEN || outLen > outCap) {
      throw new Error(`seal_request bad length ${outLen}`);
    }
    const packed = new Uint8Array(wasm.memory.buffer).slice(
      outPtr,
      outPtr + outLen
    );
    return {
      responseKey: packed.slice(0, RESPONSE_KEY_LEN),
      keyId: packed[RESPONSE_KEY_LEN],
      ephemeralPublic: packed.slice(RESPONSE_KEY_LEN + KEY_ID_LEN, HEADER_LEN),
      body: packed.slice(HEADER_LEN),
    };
  } finally {
    wasm.dealloc(jsonPtr, json.length);
    wasm.dealloc(randPtr, rand.length);
    wasm.dealloc(outPtr, outCap);
  }
}

function additionalData(keyId: number, ephemeralPublic: Uint8Array): Uint8Array {
  const ad = new Uint8Array(AD_PREFIX.length + 3 + ephemeralPublic.length);
  ad.set(AD_PREFIX, 0);
  ad.set([0, 2, keyId], AD_PREFIX.length);
  ad.set(ephemeralPublic, AD_PREFIX.length + 3);
  return ad;
}

async function unseal(
  ciphertext: Uint8Array,
  sealed: { responseKey: Uint8Array; keyId: number; ephemeralPublic: Uint8Array }
): Promise<{ status: number; data?: unknown; error?: string }> {
  if (ciphertext.length < GCM_IV_LEN + GCM_TAG_LEN) {
    throw new Error("wing /g response too short");
  }
  const key = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(sealed.responseKey),
    "AES-GCM",
    false,
    ["decrypt"]
  );
  const iv = ciphertext.slice(0, GCM_IV_LEN);
  const data = ciphertext.slice(GCM_IV_LEN);
  const plain = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: toArrayBuffer(iv),
      additionalData: toArrayBuffer(
        additionalData(sealed.keyId, sealed.ephemeralPublic)
      ),
      tagLength: GCM_TAG_LEN * 8,
    },
    key,
    toArrayBuffer(data)
  );
  return JSON.parse(new TextDecoder().decode(plain));
}

async function wingCall(
  base: string,
  path: string,
  payload: Record<string, string>
): Promise<unknown> {
  const wasm = await loadWasm(base);
  const sealed = seal(wasm, path, payload);
  const res = await fetch(`${base.replace(/\/$/, "")}/g`, {
    method: "POST",
    headers: {
      ...wingHeaders(),
      "Content-Type": "text/plain;charset=UTF-8",
    },
    body: toArrayBuffer(sealed.body),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`wing /g http ${res.status}`);
  }
  const raw = new Uint8Array(await res.arrayBuffer());
  const decoded = await unseal(raw, sealed);
  if (decoded.status < 200 || decoded.status >= 300) {
    throw new Error(
      typeof decoded.error === "string"
        ? decoded.error
        : `wing status ${decoded.status}`
    );
  }
  return decoded.data;
}

function pushUrl(
  sources: StreamSource[],
  url: string | undefined,
  quality: string,
  typeHint?: string
) {
  if (!url) return;
  const hint = (typeHint ?? "").toLowerCase();
  sources.push({
    url,
    quality,
    isM3U8:
      hint.includes("hls") ||
      url.includes(".m3u8") ||
      url.includes("playlist"),
  });
}

function toStreamResponse(
  data: unknown,
  provider: string
): StreamResponse | null {
  if (!data || typeof data !== "object") return null;
  const obj = data as Record<string, unknown>;
  const sources: StreamSource[] = [];
  const captions: unknown[] = [];

  const items = Array.isArray(obj.stream)
    ? (obj.stream as unknown[])
    : Array.isArray(obj.streams)
      ? (obj.streams as unknown[])
      : [obj];

  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const typeHint = String(row.type ?? row.sourceType ?? "");

    const qualities = row.qualities as
      | Record<string, { url?: string } | string>
      | undefined;
    if (qualities && typeof qualities === "object") {
      for (const [q, v] of Object.entries(qualities)) {
        const url = typeof v === "string" ? v : v?.url;
        pushUrl(sources, url, q.includes("p") ? q : `${q}p`, typeHint);
      }
    }

    pushUrl(
      sources,
      (row.playlist as string) ?? (row.url as string),
      String(row.quality ?? "auto"),
      typeHint
    );

    const caps = (row.captions as unknown[]) ?? (row.subtitles as unknown[]);
    if (Array.isArray(caps)) captions.push(...caps);
  }

  if (!sources.length) return null;

  const subtitles = captions
    .map((s) => {
      const row = s as Record<string, unknown>;
      const u = (row.url as string) ?? "";
      if (!u) return null;
      return {
        url: u,
        lang: String(row.lang ?? row.language ?? row.label ?? "Unknown"),
      };
    })
    .filter((x): x is { url: string; lang: string } => x !== null);

  return {
    sources: sortSourcesByQuality(sources),
    subtitles,
    referer: (obj.referer as string) ?? "https://cinejoy.pk/",
    provider,
  };
}

export async function resolveFromWingSealed(params: {
  baseUrl?: string;
  tmdbId: number;
  mediaType: MediaType;
  season: number;
  episode: number;
  server?: string;
}): Promise<StreamResponse | null> {
  const base = (
    params.baseUrl ??
    process.env.WING_API_BASE ??
    DEFAULT_BASE
  ).replace(/\/$/, "");

  const serversRes = await fetch(`${base}/servers`, {
    cache: "no-store",
    headers: wingHeaders(),
  });
  if (!serversRes.ok) return null;
  const listed = (await serversRes.json()) as {
    servers?: Array<{ name: string; status: string; "4k"?: boolean }>;
  };
  let servers = (listed.servers ?? []).filter((s) => s.status === "ok");
  servers.sort((a, b) => Number(b["4k"]) - Number(a["4k"]));
  if (params.server) {
    const hit = servers.filter(
      (s) => s.name.toLowerCase() === params.server!.toLowerCase()
    );
    if (hit.length) servers = hit;
  }
  if (!servers.length) return null;

  const kind = params.mediaType === "tv" ? "series" : "movie";
  const payload: Record<string, string> = { tmdb: String(params.tmdbId) };
  if (params.mediaType === "tv") {
    payload.season = String(params.season);
    payload.episode = String(params.episode);
  }

  for (const srv of servers) {
    try {
      const body = await wingCall(base, `/${srv.name}/${kind}`, payload);
      const normalized = toStreamResponse(body, `wing/${srv.name}`);
      if (normalized) return normalized;
    } catch {
      /* next named server */
    }
  }
  return null;
}
