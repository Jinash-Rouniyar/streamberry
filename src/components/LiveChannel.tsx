"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ShowStatus } from "@/lib/wrestling";
import { SmartLivePlayer } from "./SmartLivePlayer";

/**
 * Wraps a single wrestling channel: shows a live countdown when off air and
 * seamlessly hands off to the SmartLivePlayer the moment the show goes live —
 * without a full page reload. It re-fetches the server status when the
 * countdown elapses (and periodically while live) so providers stay fresh.
 */
export function LiveChannel({ initialStatus }: { initialStatus: ShowStatus }) {
  const [status, setStatus] = useState<ShowStatus>(initialStatus);
  const [now, setNow] = useState(() => Date.now());
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/wrestling/${initialStatus.show.id}`, {
        cache: "no-store",
      });
      if (res.ok) setStatus((await res.json()) as ShowStatus);
    } catch {
      /* keep last-known status */
    }
  }, [initialStatus.show.id]);

  // Tick the countdown once per second.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // When the countdown crosses zero, pull fresh status to flip into live mode.
  const airMs = new Date(status.airDateIso).getTime();
  const reachedAir = now >= airMs;
  useEffect(() => {
    if (reachedAir && !status.isLive) {
      refresh();
    }
  }, [reachedAir, status.isLive, refresh]);

  // While live, refresh providers every few minutes as a safety net.
  useEffect(() => {
    if (status.isLive) {
      pollRef.current = setInterval(refresh, 5 * 60 * 1000);
      return () => {
        if (pollRef.current) clearInterval(pollRef.current);
      };
    }
  }, [status.isLive, refresh]);

  if (status.isLive || status.phase === "preflight") {
    if (status.providers.length > 0) {
      return (
        <SmartLivePlayer
          providers={status.providers}
          eventTitle={status.show.name}
        />
      );
    }
  }

  return <Countdown status={status} now={now} onManualRefresh={refresh} />;
}

function Countdown({
  status,
  now,
  onManualRefresh,
}: {
  status: ShowStatus;
  now: number;
  onManualRefresh: () => void;
}) {
  const { show } = status;
  const remaining = Math.max(0, new Date(status.airDateIso).getTime() - now);

  const totalSec = Math.floor(remaining / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;

  const airDate = new Date(status.airDateIso);
  const airLabel = airDate.toLocaleString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });

  const units = [
    { label: "Days", value: days },
    { label: "Hours", value: hours },
    { label: "Minutes", value: minutes },
    { label: "Seconds", value: seconds },
  ];

  return (
    <div
      className={`relative flex aspect-video w-full flex-col items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br ${show.accent.gradient} via-black to-black`}
    >
      <span className="mb-2 rounded-full border border-white/20 px-3 py-0.5 text-xs font-semibold uppercase tracking-wide text-neutral-300">
        Next Live Broadcast
      </span>
      <h2 className={`text-2xl font-extrabold md:text-4xl ${show.accent.text}`}>
        {show.name}
      </h2>
      <p className="mt-1 text-sm text-neutral-400">{airLabel}</p>

      <div className="mt-6 flex gap-3 md:gap-5">
        {units.map((u) => (
          <div
            key={u.label}
            className="flex min-w-[64px] flex-col items-center rounded-lg bg-black/50 px-3 py-2 md:min-w-[80px]"
          >
            <span className="text-2xl font-bold tabular-nums text-white md:text-4xl">
              {String(u.value).padStart(2, "0")}
            </span>
            <span className="text-[10px] uppercase tracking-wide text-neutral-400 md:text-xs">
              {u.label}
            </span>
          </div>
        ))}
      </div>

      <p className="mt-6 max-w-md px-6 text-center text-xs text-neutral-500">
        The live player loads automatically when the show starts. {show.tagline}
      </p>

      {remaining === 0 && (
        <button
          onClick={onManualRefresh}
          className={`mt-4 rounded-lg ${show.accent.bg} px-4 py-2 text-xs font-semibold text-white`}
        >
          Load Live Stream
        </button>
      )}
    </div>
  );
}
