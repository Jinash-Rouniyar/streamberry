import type { MediaType } from "../types";
import { normalizeProviderPayload } from "../stream-utils";

/**
 * Self-hosted TMDB-Embed-API (Inside4ndroid/TMDB-Embed-API style).
 * Resolves streams by TMDB id — the same model Cinejoy-style backends use,
 * unlike title-search scrapers.
 */
export async function resolveFromTmdbEmbedApi(params: {
  baseUrl: string;
  tmdbId: number;
  mediaType: MediaType;
  season: number;
  episode: number;
}): Promise<ReturnType<typeof normalizeProviderPayload>> {
  const { baseUrl, tmdbId, mediaType, season, episode } = params;
  const typePath = mediaType === "tv" ? "series" : "movie";
  const url = new URL(`${baseUrl.replace(/\/$/, "")}/api/streams/${typePath}/${tmdbId}`);
  if (mediaType === "tv") {
    url.searchParams.set("season", String(season));
    url.searchParams.set("episode", String(episode));
  }

  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const data = await res.json();
  return normalizeProviderPayload(data, "tmdb-embed-api");
}
