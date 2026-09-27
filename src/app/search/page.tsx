import { searchMulti } from "@/lib/tmdb";
import { MediaCard } from "@/components/MediaCard";

export const dynamic = "force-dynamic";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const query = searchParams.q ?? "";
  const results = query ? await searchMulti(query) : [];

  return (
    <div className="px-4 py-8 md:px-8">
      <h1 className="mb-6 text-2xl font-semibold">
        {query ? `Results for "${query}"` : "Search"}
      </h1>

      {query && results.length === 0 ? (
        <p className="text-neutral-400">No results found.</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {results.map((item) => (
            <div key={`${item.mediaType}-${item.id}`} className="flex justify-center">
              <MediaCard media={item} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
