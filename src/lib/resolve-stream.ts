import { extractSources } from "./extractor";
import { resolveFromConsumetHttp } from "./backends/consumet-http";
import { resolveFromTmdbEmbedApi } from "./backends/tmdb-embed";
import { resolveFromWingApi } from "./backends/wing";
import { resolveFromWingSealed } from "./backends/wing-seal";
import { fetchWingSubtitles } from "./backends/wing-subs";
import type { MediaType, StreamResponse } from "./types";

export interface ResolveStreamParams {
  tmdbId: number;
  title: string;
  year: string | null;
  mediaType: MediaType;
  season: number;
  episode: number;
  /** Named backend server (Wing: Lisbon; Consumet: vidcloud). */
  server?: string;
}

/**
 * Resolution order (first success wins):
 * 1. Wing sealed /g  (Cinejoy protocol — crush.wasm + POST /g)
 * 2. TMDB_EMBED_API_URL
 * 3. WING_STREAM_URL_TEMPLATE (legacy plaintext, usually unused)
 * 4. CONSUMET_API_URL
 * 5. Embedded @consumet/extensions
 */
export async function resolveStream(
  params: ResolveStreamParams
): Promise<StreamResponse | null> {
  const wingBase =
    process.env.WING_API_BASE?.trim() || "https://api.wing.st";

  let result: StreamResponse | null = await resolveFromWingSealed({
    baseUrl: wingBase,
    tmdbId: params.tmdbId,
    mediaType: params.mediaType,
    season: params.season,
    episode: params.episode,
    server: params.server,
  });

  if (!result) {
    const embedBase = process.env.TMDB_EMBED_API_URL?.trim();
    if (embedBase) {
      result = await resolveFromTmdbEmbedApi({
        baseUrl: embedBase,
        tmdbId: params.tmdbId,
        mediaType: params.mediaType,
        season: params.season,
        episode: params.episode,
      });
    }
  }

  if (!result && process.env.WING_STREAM_URL_TEMPLATE?.trim()) {
    result = await resolveFromWingApi({
      baseUrl: wingBase,
      tmdbId: params.tmdbId,
      mediaType: params.mediaType,
      season: params.season,
      episode: params.episode,
      server: params.server,
    });
  }

  if (!result) {
    const consumetBase = process.env.CONSUMET_API_URL?.trim();
    const consumetLooksReal =
      consumetBase &&
      !consumetBase.includes("your-consumet-instance") &&
      !consumetBase.includes("example.com");
    if (consumetLooksReal) {
      result = await resolveFromConsumetHttp({
        baseUrl: consumetBase,
        title: params.title,
        year: params.year,
        mediaType: params.mediaType,
        season: params.season,
        episode: params.episode,
        server: params.server,
      });
    }
  }

  if (!result) {
    result = await extractSources({
      title: params.title,
      year: params.year,
      mediaType: params.mediaType,
      season: params.season,
      episode: params.episode,
      server: params.server,
    });
  }

  if (result && !result.subtitles.length) {
    try {
      const subs = await fetchWingSubtitles({
        mediaType: params.mediaType,
        tmdbId: params.tmdbId,
        season: params.season,
        episode: params.episode,
      });
      if (subs.length) result = { ...result, subtitles: subs };
    } catch {
      /* captions are optional */
    }
  }

  return result;
}
