"use client";

import { useEffect, useState } from "react";
import type { TmdbEpisode, TmdbMediaDetail } from "@/lib/types";
import { apiUrl } from "@/lib/config";
import { PlayerShell } from "./PlayerShell";

/**
 * Client controller for the watch page. Owns the selected season/episode and
 * drives the hybrid PlayerShell. For movies it renders the player directly.
 */
export function WatchClient({ detail }: { detail: TmdbMediaDetail }) {
  const isTv = detail.mediaType === "tv";
  const [season, setSeason] = useState<number>(
    detail.seasons[0]?.seasonNumber ?? 1
  );
  const [episode, setEpisode] = useState<number>(1);
  const [episodes, setEpisodes] = useState<TmdbEpisode[]>([]);
  const [loadingEps, setLoadingEps] = useState(false);

  // Load episodes when the season changes (TV only).
  useEffect(() => {
    if (!isTv) return;
    let cancelled = false;
    setLoadingEps(true);
    fetch(apiUrl(`/api/episodes?tvId=${detail.id}&season=${season}`))
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setEpisodes(data.episodes ?? []);
        setEpisode(1);
      })
      .catch(() => !cancelled && setEpisodes([]))
      .finally(() => !cancelled && setLoadingEps(false));
    return () => {
      cancelled = true;
    };
  }, [isTv, detail.id, season]);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div>
        <PlayerShell
          mediaType={detail.mediaType}
          tmdbId={detail.id}
          season={season}
          episode={episode}
        />
      </div>

      {isTv && (
        <div className="rounded-lg bg-neutral-900/60 p-3">
          <div className="mb-3 flex items-center gap-2">
            <label className="text-sm text-neutral-400">Season</label>
            <select
              value={season}
              onChange={(e) => setSeason(Number(e.target.value))}
              className="rounded border border-neutral-700 bg-black px-2 py-1 text-sm"
            >
              {detail.seasons.map((s) => (
                <option key={s.seasonNumber} value={s.seasonNumber}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div className="max-h-[60vh] space-y-1 overflow-y-auto pr-1">
            {loadingEps && (
              <p className="p-2 text-sm text-neutral-500">Loading episodes...</p>
            )}
            {!loadingEps &&
              episodes.map((ep) => {
                const active = ep.episodeNumber === episode;
                return (
                  <button
                    key={ep.episodeNumber}
                    onClick={() => setEpisode(ep.episodeNumber)}
                    className={`block w-full rounded px-3 py-2 text-left text-sm transition-colors ${
                      active
                        ? "bg-brand text-white"
                        : "bg-neutral-800/60 text-neutral-300 hover:bg-neutral-700"
                    }`}
                  >
                    <span className="font-semibold">E{ep.episodeNumber}</span>{" "}
                    {ep.name}
                  </button>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}
