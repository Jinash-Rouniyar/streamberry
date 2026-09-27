import { notFound } from "next/navigation";
import { getDetail, posterUrl } from "@/lib/tmdb";
import { WatchClient } from "@/components/WatchClient";
import type { MediaType } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function WatchPage({
  params,
}: {
  params: { type: string; id: string };
}) {
  const type = (params.type === "tv" ? "tv" : "movie") as MediaType;
  const id = Number(params.id);
  if (!id || Number.isNaN(id)) notFound();

  let detail;
  try {
    detail = await getDetail(type, id);
  } catch {
    notFound();
  }

  const poster = posterUrl(detail.posterPath, "w342");
  const year = detail.releaseDate?.slice(0, 4) ?? "";

  return (
    <div className="px-4 py-6 md:px-8">
      <div className="mb-6 flex gap-4">
        {poster && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={poster}
            alt={detail.title}
            className="hidden h-40 rounded md:block"
          />
        )}
        <div>
          <h1 className="text-2xl font-bold md:text-3xl">{detail.title}</h1>
          <p className="mt-1 text-sm text-neutral-400">
            {year}
            {detail.runtime ? ` · ${detail.runtime} min` : ""}
            {detail.genres.length ? ` · ${detail.genres.join(", ")}` : ""}
          </p>
          <p className="mt-3 max-w-2xl text-sm text-neutral-300">
            {detail.overview}
          </p>
        </div>
      </div>

      <WatchClient detail={detail} />
    </div>
  );
}
