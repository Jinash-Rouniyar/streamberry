"use client";

import type { MediaType } from "@/lib/types";

/**
 * Last-resort playback: embed a third-party iframe provider. We hand it the
 * TMDB id and let it handle scraping + its own player. UX is not ad-free here,
 * but it maximizes the chance the user gets a working stream.
 *
 * Provider URL shapes (vidsrc.to):
 *   movie: /embed/movie/{tmdbId}
 *   tv:    /embed/tv/{tmdbId}/{season}/{episode}
 */
export function IframeFallback({
  mediaType,
  tmdbId,
  season,
  episode,
}: {
  mediaType: MediaType;
  tmdbId: number;
  season: number;
  episode: number;
}) {
  const base =
    process.env.NEXT_PUBLIC_EMBED_BASE_URL ?? "https://vidsrc.to/embed";

  const src =
    mediaType === "movie"
      ? `${base}/movie/${tmdbId}`
      : `${base}/tv/${tmdbId}/${season}/${episode}`;

  return (
    <div className="aspect-video w-full overflow-hidden rounded-lg bg-black">
      <iframe
        src={src}
        title="Player"
        allowFullScreen
        referrerPolicy="origin"
        className="h-full w-full border-0"
      />
    </div>
  );
}
