import type { MediaType } from "../types";
import { normalizeProviderPayload } from "../stream-utils";

const PROVIDER_SLUG = process.env.CONSUMET_PROVIDER ?? "flixhq";

/**
 * Call a running api.consumet.org instance (search → info → servers → watch).
 * Set FLIXHQ_BASE_URL on the *Consumet server*, not here.
 */
export async function resolveFromConsumetHttp(params: {
  baseUrl: string;
  title: string;
  year: string | null;
  mediaType: MediaType;
  season: number;
  episode: number;
  server?: string;
}): Promise<ReturnType<typeof normalizeProviderPayload>> {
  const base = params.baseUrl.replace(/\/$/, "");
  const prefix = `${base}/movies/${PROVIDER_SLUG}`;

  const searchUrl = `${prefix}/${encodeURIComponent(params.title)}`;
  const searchRes = await fetch(searchUrl, { cache: "no-store" });
  if (!searchRes.ok) return null;
  const search = (await searchRes.json()) as { results?: any[] };
  const best = pickMatch(search.results ?? [], params.title, params.year, params.mediaType);
  if (!best?.id) return null;

  const infoUrl = `${prefix}/info?id=${encodeURIComponent(best.id)}`;
  const infoRes = await fetch(infoUrl, { cache: "no-store" });
  if (!infoRes.ok) return null;
  const info = await infoRes.json();
  const episodeId = resolveEpisodeId(info, params.mediaType, params.season, params.episode);
  if (!episodeId) return null;

  const serversUrl = `${prefix}/servers?episodeId=${encodeURIComponent(episodeId)}&mediaId=${encodeURIComponent(best.id)}`;
  const serversRes = await fetch(serversUrl, { cache: "no-store" });
  const serversList: { name: string }[] = serversRes.ok
    ? ((await serversRes.json()) as { name: string }[])
    : [];

  const serverNames = params.server
    ? [params.server]
    : serversList.length
      ? serversList.map((s) => s.name)
      : ["vidcloud", "upcloud", "mixdrop"];

  for (const server of serverNames) {
    const watchUrl = `${prefix}/watch?episodeId=${encodeURIComponent(episodeId)}&mediaId=${encodeURIComponent(best.id)}&server=${encodeURIComponent(server)}`;
    try {
      const watchRes = await fetch(watchUrl, { cache: "no-store" });
      if (!watchRes.ok) continue;
      const data = await watchRes.json();
      const normalized = normalizeProviderPayload(data, `consumet/${PROVIDER_SLUG}/${server}`);
      if (normalized) return normalized;
    } catch {
      /* next server */
    }
  }
  return null;
}

function pickMatch(
  results: any[],
  title: string,
  year: string | null,
  mediaType: MediaType
): any | null {
  if (!results.length) return null;
  const want = title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const scored = results.map((r) => {
    const rTitle = String(r.title ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const rYear = String(r.releaseDate ?? "").slice(0, 4);
    let score = 0;
    if (rTitle === want) score += 5;
    else if (rTitle.includes(want) || want.includes(rTitle)) score += 2;
    if (year && rYear === year) score += 3;
    if (mediaType === "tv" && String(r.type ?? "").toLowerCase().includes("tv")) score += 2;
    if (mediaType === "movie" && String(r.type ?? "").toLowerCase().includes("movie")) score += 2;
    return { r, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.score > 0 ? scored[0].r : results[0];
}

function resolveEpisodeId(
  info: any,
  mediaType: MediaType,
  season: number,
  episode: number
): string | null {
  const episodes: any[] = info?.episodes ?? [];
  if (!episodes.length) return null;
  if (mediaType === "movie") return episodes[0].id;
  const match = episodes.find(
    (e) =>
      Number(e.season ?? e.seasonNumber) === season &&
      Number(e.number ?? e.episodeNumber) === episode
  );
  return (match ?? episodes[0]).id;
}
