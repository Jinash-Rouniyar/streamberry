import { MOVIES, StreamingServers } from "@consumet/extensions";
import type { MediaType, StreamResponse } from "./types";

/**
 * Extractor layer.
 *
 * NOTE: The original plan called for cloning consumet/api.consumet.org and
 * deploying it separately to Vercel. That repository was removed from GitHub
 * via a DMCA takedown (2026-03), so instead we run the still-published
 * `@consumet/extensions` library directly inside this Next.js app. This keeps
 * the extractor self-hosted on the same Vercel deployment and removes a moving
 * part. The provider list below is our failover order.
 */

/**
 * Provider factories. Each may override its scraper base URL from an env var,
 * because these piracy sources rotate domains constantly and the library ships
 * stale defaults (e.g. flixhq.to currently returns Cloudflare 522). When you
 * find a *true structural* mirror (same HTML the parser expects), set the
 * corresponding *_BASE_URL env var — no code change needed.
 */
const PROVIDERS: Array<() => any> = [
  () => applyBase(new MOVIES.FlixHQ(), process.env.FLIXHQ_BASE_URL),
  () => applyBase(new MOVIES.SFlix(), process.env.SFLIX_BASE_URL),
  () => applyBase(new MOVIES.Goku(), process.env.GOKU_BASE_URL),
  () => applyBase(new MOVIES.HiMovies(), process.env.HIMOVIES_BASE_URL),
];

function applyBase(provider: any, base?: string) {
  if (base) provider.baseUrl = base.replace(/\/$/, "");
  return provider;
}

// Per-provider hard timeout. Scraper targets that are down otherwise hang ~20s
// each; this makes the whole extractor fail fast so the UI can fall back to the
// iframe quickly instead of stalling for a minute.
const PROVIDER_TIMEOUT_MS = Number(process.env.EXTRACTOR_TIMEOUT_MS ?? "8000");

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("provider timeout")), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

/**
 * Resolve with the first promise that yields a truthy value. Individual
 * rejections are ignored; resolves null only if every promise fails/empties.
 */
function firstSuccess<T>(promises: Array<Promise<T | null>>): Promise<T | null> {
  return new Promise((resolve) => {
    let remaining = promises.length;
    let done = false;
    if (!remaining) return resolve(null);
    for (const p of promises) {
      p.then((v) => {
        if (v && !done) {
          done = true;
          resolve(v);
        }
      })
        .catch(() => {})
        .finally(() => {
          remaining -= 1;
          if (remaining === 0 && !done) resolve(null);
        });
    }
  });
}

// Server preference within a provider (m3u8-friendly hosts first).
const SERVER_PREFERENCE = [
  StreamingServers.UpCloud,
  StreamingServers.VidCloud,
  StreamingServers.MixDrop,
];

function normalizeTitle(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Pick the best search result for the requested TMDB title/year/type.
 * We match on normalized title and, when available, release year.
 */
function pickBestMatch(
  results: any[],
  title: string,
  year: string | null,
  mediaType: MediaType
): any | null {
  if (!results?.length) return null;

  const wantTitle = normalizeTitle(title);
  const wantType = mediaType === "tv" ? "tv series" : "movie";

  const scored = results
    .map((r) => {
      const rTitle = normalizeTitle(r.title ?? "");
      const rType = (r.type ?? "").toLowerCase();
      const rYear = (r.releaseDate ?? "").toString().slice(0, 4);

      let score = 0;
      if (rTitle === wantTitle) score += 5;
      else if (rTitle.includes(wantTitle) || wantTitle.includes(rTitle)) score += 2;

      if (rType.includes(wantType.split(" ")[0])) score += 2;
      if (year && rYear && rYear === year) score += 3;

      return { r, score };
    })
    .sort((a, b) => b.score - a.score);

  return scored[0]?.score > 0 ? scored[0].r : results[0];
}

/**
 * For a matched media entry, resolve the specific episode id we need to
 * fetch sources for.
 * - Movies: the single episode entry.
 * - TV: the entry matching season + episode number.
 */
function resolveEpisodeId(
  info: any,
  mediaType: MediaType,
  season: number,
  episode: number
): string | null {
  const episodes: any[] = info?.episodes ?? [];
  if (!episodes.length) return null;

  if (mediaType === "movie") {
    return episodes[0].id;
  }

  const match = episodes.find(
    (e) =>
      Number(e.season ?? e.seasonNumber) === season &&
      Number(e.number ?? e.episodeNumber) === episode
  );
  return (match ?? episodes[0]).id;
}

async function tryProvider(
  provider: any,
  title: string,
  year: string | null,
  mediaType: MediaType,
  season: number,
  episode: number,
  preferredServer?: string
): Promise<StreamResponse | null> {
  const search = await provider.search(title);
  const best = pickBestMatch(search?.results ?? [], title, year, mediaType);
  if (!best) return null;

  const info = await provider.fetchMediaInfo(best.id);
  const episodeId = resolveEpisodeId(info, mediaType, season, episode);
  if (!episodeId) return null;

  let serversToTry: string[] = [];
  if (preferredServer) {
    serversToTry = [preferredServer];
  } else {
    try {
      const listed = await provider.fetchEpisodeServers(episodeId, best.id);
      serversToTry = (listed ?? []).map((s: { name: string }) => s.name);
    } catch {
      serversToTry = [];
    }
    if (!serversToTry.length) {
      serversToTry = SERVER_PREFERENCE.map(String);
    }
  }

  for (const server of serversToTry) {
    try {
      const data = await provider.fetchEpisodeSources(
        episodeId,
        best.id,
        server as never
      );
      const sources = (data?.sources ?? []).map((s: any) => ({
        url: s.url,
        quality: s.quality ?? "auto",
        isM3U8: Boolean(s.isM3U8),
      }));
      if (!sources.length) continue;

      return {
        sources,
        subtitles: (data?.subtitles ?? []).map((s: any) => ({
          url: s.url,
          lang: s.lang ?? "Unknown",
        })),
        referer: data?.headers?.Referer ?? data?.headers?.referer ?? null,
        provider: provider.name,
      };
    } catch {
      // Try the next server.
    }
  }
  return null;
}

/**
 * Attempt every provider in order and return the first successful extraction.
 * Throws only if all providers fail (caller decides fallback behavior).
 */
export async function extractSources(params: {
  title: string;
  year: string | null;
  mediaType: MediaType;
  season?: number;
  episode?: number;
  server?: string;
}): Promise<StreamResponse | null> {
  const { title, year, mediaType, server } = params;
  const season = params.season ?? 1;
  const episode = params.episode ?? 1;

  // Race all providers concurrently, each bounded by PROVIDER_TIMEOUT_MS.
  // First one to return real sources wins; if all fail we return null and the
  // client falls back to the iframe embed.
  const attempts = PROVIDERS.map((make) =>
    withTimeout(
      (async () => {
        const provider = make();
        return tryProvider(
          provider,
          title,
          year,
          mediaType,
          season,
          episode,
          server
        );
      })(),
      PROVIDER_TIMEOUT_MS
    ).catch(() => null)
  );

  return firstSuccess(attempts);
}
