import type {
  MediaType,
  TmdbEpisode,
  TmdbMediaDetail,
  TmdbMediaSummary,
} from "./types";

const TMDB_BASE = "https://api.themoviedb.org/3";
export const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";

function authHeaders(): HeadersInit {
  const token = process.env.TMDB_ACCESS_TOKEN;
  if (!token) {
    throw new Error(
      "TMDB_ACCESS_TOKEN is not set. Copy .env.example to .env and add your token."
    );
  }
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };
}

/**
 * Thin wrapper around fetch for TMDB. Results are cached by Next.js on the
 * server for an hour to stay well under TMDB rate limits.
 */
async function tmdbFetch<T>(
  path: string,
  params: Record<string, string> = {}
): Promise<T> {
  const url = new URL(`${TMDB_BASE}${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const res = await fetch(url.toString(), {
    headers: authHeaders(),
    next: { revalidate: 60 * 60 },
  });

  if (!res.ok) {
    throw new Error(`TMDB request failed (${res.status}): ${path}`);
  }
  return (await res.json()) as T;
}

function posterUrl(path: string | null, size = "w500"): string | null {
  return path ? `${TMDB_IMAGE_BASE}/${size}${path}` : null;
}

function toSummary(raw: any, forcedType?: MediaType): TmdbMediaSummary | null {
  const mediaType: MediaType =
    forcedType ?? (raw.media_type === "tv" ? "tv" : "movie");

  // TMDB "multi" search also returns people; skip anything without a title.
  const title = raw.title ?? raw.name;
  if (!title) return null;

  return {
    id: raw.id,
    mediaType,
    title,
    overview: raw.overview ?? "",
    posterPath: raw.poster_path ?? null,
    backdropPath: raw.backdrop_path ?? null,
    releaseDate: raw.release_date ?? raw.first_air_date ?? null,
    voteAverage: raw.vote_average ?? 0,
  };
}

export async function getTrending(
  mediaType: MediaType = "movie"
): Promise<TmdbMediaSummary[]> {
  const data = await tmdbFetch<{ results: any[] }>(
    `/trending/${mediaType}/week`
  );
  return data.results
    .map((r) => toSummary(r, mediaType))
    .filter((x): x is TmdbMediaSummary => x !== null);
}

export async function getPopular(
  mediaType: MediaType
): Promise<TmdbMediaSummary[]> {
  const data = await tmdbFetch<{ results: any[] }>(`/${mediaType}/popular`);
  return data.results
    .map((r) => toSummary(r, mediaType))
    .filter((x): x is TmdbMediaSummary => x !== null);
}

export async function getTopRated(
  mediaType: MediaType
): Promise<TmdbMediaSummary[]> {
  const data = await tmdbFetch<{ results: any[] }>(`/${mediaType}/top_rated`);
  return data.results
    .map((r) => toSummary(r, mediaType))
    .filter((x): x is TmdbMediaSummary => x !== null);
}

export async function searchMulti(
  query: string
): Promise<TmdbMediaSummary[]> {
  if (!query.trim()) return [];
  const data = await tmdbFetch<{ results: any[] }>("/search/multi", {
    query,
    include_adult: "false",
  });
  return data.results
    .filter((r) => r.media_type === "movie" || r.media_type === "tv")
    .map((r) => toSummary(r))
    .filter((x): x is TmdbMediaSummary => x !== null);
}

export async function getDetail(
  mediaType: MediaType,
  id: number
): Promise<TmdbMediaDetail> {
  const appends = mediaType === "movie" ? "external_ids" : "external_ids";
  const raw = await tmdbFetch<any>(`/${mediaType}/${id}`, {
    append_to_response: appends,
  });

  const base = toSummary(raw, mediaType)!;

  return {
    ...base,
    runtime: raw.runtime ?? raw.episode_run_time?.[0] ?? null,
    genres: (raw.genres ?? []).map((g: any) => g.name),
    imdbId: raw.imdb_id ?? raw.external_ids?.imdb_id ?? null,
    seasons: (raw.seasons ?? [])
      .filter((s: any) => s.season_number > 0)
      .map((s: any) => ({
        seasonNumber: s.season_number,
        name: s.name,
        episodeCount: s.episode_count,
      })),
  };
}

export async function getSeasonEpisodes(
  tvId: number,
  seasonNumber: number
): Promise<TmdbEpisode[]> {
  const data = await tmdbFetch<{ episodes: any[] }>(
    `/tv/${tvId}/season/${seasonNumber}`
  );
  return (data.episodes ?? []).map((e) => ({
    episodeNumber: e.episode_number,
    seasonNumber,
    name: e.name,
    overview: e.overview ?? "",
    stillPath: e.still_path ?? null,
  }));
}

export { posterUrl };
