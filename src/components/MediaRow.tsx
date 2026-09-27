import type { TmdbMediaSummary } from "@/lib/types";
import { MediaCard } from "./MediaCard";

export function MediaRow({
  title,
  items,
}: {
  title: string;
  items: TmdbMediaSummary[];
}) {
  if (!items.length) return null;

  return (
    <section className="mt-8">
      <h2 className="mb-3 px-4 text-lg font-semibold text-neutral-100 md:px-8">
        {title}
      </h2>
      <div className="no-scrollbar flex gap-3 overflow-x-auto px-4 pb-2 md:px-8">
        {items.map((item) => (
          <MediaCard key={`${item.mediaType}-${item.id}`} media={item} />
        ))}
      </div>
    </section>
  );
}
