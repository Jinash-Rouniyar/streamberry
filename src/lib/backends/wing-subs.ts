import type { MediaType, StreamSubtitle } from "../types";

const SUBS_BASE = process.env.WING_SUBS_BASE ?? "https://subs.wing.st";

export async function fetchWingSubtitles(params: {
  mediaType: MediaType;
  tmdbId: number;
  season: number;
  episode: number;
}): Promise<StreamSubtitle[]> {
  const url = new URL(`${SUBS_BASE.replace(/\/$/, "")}/subtitles`);
  url.searchParams.set("type", params.mediaType);
  url.searchParams.set("tmdb", String(params.tmdbId));
  if (params.mediaType === "tv") {
    url.searchParams.set("season", String(params.season));
    url.searchParams.set("episode", String(params.episode));
  }

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    subtitles?: Array<{ url?: string; language?: string; lang?: string; display?: string }>;
  };
  return (data.subtitles ?? [])
    .filter((s) => s.url)
    .slice(0, 12)
    .map((s) => ({
      url: s.url as string,
      lang: s.language ?? s.lang ?? s.display ?? "Unknown",
    }));
}
