import Link from "next/link";
import Image from "next/image";
import type { TmdbMediaSummary } from "@/lib/types";
import { posterUrl } from "@/lib/tmdb";

export function MediaCard({ media }: { media: TmdbMediaSummary }) {
  const poster = posterUrl(media.posterPath, "w342");
  const year = media.releaseDate?.slice(0, 4) ?? "";

  return (
    <Link
      href={`/watch/${media.mediaType}/${media.id}`}
      className="group relative block w-36 shrink-0 md:w-44"
    >
      <div className="relative aspect-[2/3] overflow-hidden rounded-md bg-neutral-800">
        {poster ? (
          <Image
            src={poster}
            alt={media.title}
            fill
            sizes="(max-width: 768px) 144px, 176px"
            className="object-cover transition-transform duration-200 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center p-2 text-center text-xs text-neutral-400">
            {media.title}
          </div>
        )}
        <span className="absolute right-1 top-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-yellow-400">
          {media.voteAverage.toFixed(1)}
        </span>
      </div>
      <div className="mt-1.5">
        <p className="truncate text-sm font-medium text-neutral-100">
          {media.title}
        </p>
        <p className="text-xs text-neutral-500">
          {year} · {media.mediaType === "tv" ? "TV" : "Movie"}
        </p>
      </div>
    </Link>
  );
}
