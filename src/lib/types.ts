export type MediaType = "movie" | "tv";

export interface TmdbMediaSummary {
  id: number;
  mediaType: MediaType;
  title: string;
  overview: string;
  posterPath: string | null;
  backdropPath: string | null;
  releaseDate: string | null;
  voteAverage: number;
}

export interface TmdbSeason {
  seasonNumber: number;
  name: string;
  episodeCount: number;
}

export interface TmdbEpisode {
  episodeNumber: number;
  seasonNumber: number;
  name: string;
  overview: string;
  stillPath: string | null;
}

export interface TmdbMediaDetail extends TmdbMediaSummary {
  runtime: number | null;
  genres: string[];
  seasons: TmdbSeason[];
  imdbId: string | null;
}

/** A single playable source returned by the extractor, normalized. */
export interface StreamSource {
  url: string;
  quality: string;
  isM3U8: boolean;
}

export interface StreamSubtitle {
  url: string;
  lang: string;
}

/** Normalized response from our /api/stream route. */
export interface StreamResponse {
  sources: StreamSource[];
  subtitles: StreamSubtitle[];
  /** Header (usually Referer) required by the upstream host to serve chunks. */
  referer: string | null;
  provider: string;
}

/** Playback backend entry (Wing-style or per-episode scraper server). */
export interface StreamServerOption {
  name: string;
  fourK?: boolean;
  status?: string;
}
