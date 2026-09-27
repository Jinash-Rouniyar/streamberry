"use client";

import { useCallback, useEffect, useState } from "react";
import type { MediaType, StreamResponse, StreamServerOption } from "@/lib/types";
import { apiUrl } from "@/lib/config";
import { CustomPlayer } from "./CustomPlayer";
import { IframeFallback } from "./IframeFallback";

type Phase = "loading" | "custom" | "iframe";

async function fetchStream(
  mediaType: MediaType,
  tmdbId: number,
  season: number,
  episode: number,
  server?: string
): Promise<StreamResponse> {
  const params = new URLSearchParams({
    type: mediaType,
    id: String(tmdbId),
    season: String(season),
    episode: String(episode),
  });
  if (server) params.set("server", server);
  const res = await fetch(apiUrl(`/api/stream?${params.toString()}`));
  if (!res.ok) throw new Error(`status ${res.status}`);
  return (await res.json()) as StreamResponse;
}

/**
 * Cinejoy-style playback: discover named servers, try each (4K first), then
 * fall back to iframe only if every backend fails.
 */
export function PlayerShell({
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
  const [phase, setPhase] = useState<Phase>("loading");
  const [stream, setStream] = useState<StreamResponse | null>(null);
  const [providerNote, setProviderNote] = useState<string>("");
  const [servers, setServers] = useState<StreamServerOption[]>([]);
  const [activeServer, setActiveServer] = useState<string | null>(null);

  const goIframe = useCallback(() => {
    setStream(null);
    setPhase("iframe");
  }, []);

  const tryPlayback = useCallback(
    async (serverList: StreamServerOption[]) => {
      const ordered = [...serverList].sort(
        (a, b) => Number(b.fourK) - Number(a.fourK)
      );

      for (const srv of ordered) {
        setActiveServer(srv.name);
        try {
          const data = await fetchStream(
            mediaType,
            tmdbId,
            season,
            episode,
            srv.name === "auto" ? undefined : srv.name
          );
          if (!data.sources?.length) continue;
          setStream(data);
          setProviderNote(data.provider);
          setPhase("custom");
          return;
        } catch {
          /* next server */
        }
      }
      goIframe();
    },
    [mediaType, tmdbId, season, episode, goIframe]
  );

  useEffect(() => {
    let cancelled = false;
    setPhase("loading");
    setStream(null);
    setProviderNote("");
    setActiveServer(null);

    fetch(apiUrl("/api/servers"))
      .then((r) => r.json())
      .then((data: { servers?: StreamServerOption[] }) => {
        if (cancelled) return;
        const list = data.servers?.length ? data.servers : [{ name: "auto" }];
        setServers(list);
        return tryPlayback(list);
      })
      .catch(() => {
        if (!cancelled) goIframe();
      });

    return () => {
      cancelled = true;
    };
  }, [mediaType, tmdbId, season, episode, tryPlayback, goIframe]);

  const retryServer = (name: string) => {
    setPhase("loading");
    tryPlayback([{ name }]).catch(goIframe);
  };

  return (
    <div className="space-y-2">
      {phase === "loading" && (
        <div className="flex aspect-video w-full items-center justify-center rounded-lg bg-neutral-900">
          <div className="flex flex-col items-center gap-3 text-neutral-400">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-600 border-t-brand" />
            <span className="text-sm">
              {activeServer
                ? `Trying ${activeServer}…`
                : "Finding the best source..."}
            </span>
          </div>
        </div>
      )}

      {phase === "custom" && stream && (
        <CustomPlayer stream={stream} onFatal={goIframe} />
      )}

      {phase === "iframe" && (
        <IframeFallback
          mediaType={mediaType}
          tmdbId={tmdbId}
          season={season}
          episode={episode}
        />
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-500">
        <span>
          {phase === "custom" && providerNote
            ? `Streaming via ${providerNote} (ad-free player)`
            : phase === "iframe"
              ? "All servers failed — fallback embed"
              : ""}
        </span>
        {servers.length > 1 && phase !== "loading" && (
          <div className="flex flex-wrap gap-1">
            {servers.map((s) => (
              <button
                key={s.name}
                type="button"
                onClick={() => retryServer(s.name)}
                className={`rounded border px-2 py-1 hover:border-neutral-500 ${
                  activeServer === s.name
                    ? "border-brand text-brand"
                    : "border-neutral-700"
                }`}
              >
                {s.name}
                {s.fourK ? " 4K" : ""}
              </button>
            ))}
          </div>
        )}
        {phase === "custom" && (
          <button
            type="button"
            onClick={goIframe}
            className="rounded border border-neutral-700 px-2 py-1 hover:border-neutral-500"
          >
            Use embed
          </button>
        )}
      </div>
    </div>
  );
}
