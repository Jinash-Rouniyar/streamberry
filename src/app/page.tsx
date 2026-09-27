import Link from "next/link";
import { getPopular, getTopRated, getTrending, posterUrl } from "@/lib/tmdb";
import { MediaRow } from "@/components/MediaRow";
import type { MediaType } from "@/lib/types";

// Render at request time so a production build does not require the TMDB
// token at build time. TMDB responses are still cached per-request (1h) in
// the fetch layer.
export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams: { type?: string };
}) {
  const type: MediaType = searchParams.type === "tv" ? "tv" : "movie";

  const [trending, popular, topRated] = await Promise.all([
    getTrending(type),
    getPopular(type),
    getTopRated(type),
  ]);

  const hero = trending[0];
  const backdrop = hero ? posterUrl(hero.backdropPath, "w1280") : null;

  return (
    <div>
      {hero && (
        <section className="relative h-[56vh] min-h-[360px] w-full overflow-hidden">
          {backdrop && (
            // Plain img so the hero backdrop is not constrained by next/image layout.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={backdrop}
              alt={hero.title}
              className="absolute inset-0 h-full w-full object-cover"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/80 to-transparent" />
          <div className="relative flex h-full max-w-2xl flex-col justify-end gap-3 px-4 pb-10 md:px-8">
            <h1 className="text-3xl font-extrabold md:text-5xl">{hero.title}</h1>
            <p className="line-clamp-3 text-sm text-neutral-300 md:text-base">
              {hero.overview}
            </p>
            <div className="flex gap-3">
              <Link
                href={`/watch/${hero.mediaType}/${hero.id}`}
                className="rounded bg-brand px-6 py-2 text-sm font-semibold text-white hover:bg-red-700"
              >
                Play
              </Link>
            </div>
          </div>
        </section>
      )}

      <div className="-mt-4 md:-mt-8">
        <MediaRow title={`Trending ${type === "tv" ? "Shows" : "Movies"}`} items={trending} />
        <MediaRow title="Popular" items={popular} />
        <MediaRow title="Top Rated" items={topRated} />
      </div>
    </div>
  );
}
