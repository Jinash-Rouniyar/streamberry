import type { MediaType } from "../types";
import { applyStreamUrlTemplate, normalizeProviderPayload } from "../stream-utils";

export interface WingServer {
  name: string;
  status: string;
  fourK: boolean;
}

/**
 * Cinejoy exposes GET https://api.wing.st/servers (Lisbon, Nebula, …).
 * Stream URLs are NOT public — you must copy the path from DevTools once and set
 * WING_STREAM_URL_TEMPLATE (see .env.example).
 */
export async function listWingServers(baseUrl: string): Promise<WingServer[]> {
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/servers`, {
    cache: "no-store",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
      Origin: "https://cinejoy.pk",
      Referer: "https://cinejoy.pk/",
    },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    servers?: Array<{ name: string; status: string; "4k"?: boolean }>;
  };
  return (data.servers ?? [])
    .filter((s) => s.status === "ok")
    .map((s) => ({
      name: s.name,
      status: s.status,
      fourK: Boolean(s["4k"]),
    }))
    .sort((a, b) => Number(b.fourK) - Number(a.fourK));
}

export async function resolveFromWingApi(params: {
  baseUrl: string;
  tmdbId: number;
  mediaType: MediaType;
  season: number;
  episode: number;
  server?: string;
}): Promise<ReturnType<typeof normalizeProviderPayload>> {
  const template = process.env.WING_STREAM_URL_TEMPLATE?.trim();
  if (!template) return null;

  const servers = await listWingServers(params.baseUrl);
  if (!servers.length) return null;

  const order = params.server
    ? servers.filter((s) => s.name === params.server)
    : servers;

  const auth = process.env.WING_API_AUTHORIZATION?.trim();
  const headers: HeadersInit = { Accept: "application/json" };
  if (auth) headers.Authorization = auth;

  const type = params.mediaType === "tv" ? "tv" : "movie";

  for (const srv of order) {
    const url = applyStreamUrlTemplate(template, {
      base: params.baseUrl.replace(/\/$/, ""),
      server: srv.name,
      type,
      tmdbId: String(params.tmdbId),
      season: String(params.season),
      episode: String(params.episode),
    });

    try {
      const res = await fetch(url, { headers, cache: "no-store" });
      if (!res.ok) continue;
      const data = await res.json();
      const normalized = normalizeProviderPayload(data, `wing/${srv.name}`);
      if (normalized) return normalized;
    } catch {
      /* try next server */
    }
  }
  return null;
}
