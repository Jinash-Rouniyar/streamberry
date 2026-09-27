"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LiveProvider } from "@/lib/wrestling";

/**
 * Live embed player for third-party wrestling streams.
 *
 * Because embeds are cross-origin we cannot read their <video> state, so we
 * lean on three mechanisms for a seamless experience:
 *   1. Double-buffered slots (A/B): the next provider loads hidden in the
 *      standby slot and we cross-fade once its iframe fires `onLoad`, so
 *      switching servers never flashes a blank frame.
 *   2. A load watchdog: if an embed doesn't fire `onLoad` within the timeout,
 *      we automatically fail over to the next provider.
 *   3. Hardened sandboxing: `allow-top-navigation` and `allow-popups` are
 *      intentionally omitted so embed ad scripts can't hijack or redirect the
 *      page.
 */

const LOAD_TIMEOUT_MS = 12_000;
const IFRAME_SANDBOX = "allow-scripts allow-same-origin allow-forms allow-presentation";
const IFRAME_ALLOW = "autoplay; encrypted-media; fullscreen; picture-in-picture";

type Slot = "A" | "B";

export function SmartLivePlayer({
  providers,
  eventTitle,
}: {
  providers: LiveProvider[];
  eventTitle: string;
}) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [activeSlot, setActiveSlot] = useState<Slot>("A");
  const [slotAProvider, setSlotAProvider] = useState<LiveProvider | null>(
    providers[0] ?? null
  );
  const [slotBProvider, setSlotBProvider] = useState<LiveProvider | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(providers.length === 0);

  // Index currently loading into the standby slot (null when idle).
  const pendingIdxRef = useRef<number | null>(providers.length ? 0 : null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearWatchdog = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const switchToProvider = useCallback(
    (nextIdx: number) => {
      if (nextIdx < 0 || nextIdx >= providers.length) {
        setHasError(true);
        setIsLoading(false);
        return;
      }

      setHasError(false);
      setIsLoading(true);
      pendingIdxRef.current = nextIdx;

      const next = providers[nextIdx];
      // Load the new provider into whichever slot is NOT currently visible.
      const standbySlot: Slot = activeSlot === "A" ? "B" : "A";
      if (standbySlot === "A") setSlotAProvider(next);
      else setSlotBProvider(next);

      clearWatchdog();
      timeoutRef.current = setTimeout(() => {
        // Embed never signalled load — advance to the next candidate.
        switchToProvider(nextIdx + 1);
      }, LOAD_TIMEOUT_MS);
    },
    [providers, activeSlot, clearWatchdog]
  );

  const handleLoaded = useCallback(
    (slot: Slot) => {
      const pending = pendingIdxRef.current;
      if (pending === null) return;

      const standbySlot: Slot = activeSlot === "A" ? "B" : "A";
      // Only promote when the slot that just loaded is the standby one we
      // were filling (ignore stale/initial loads on the active slot).
      if (slot !== standbySlot && !(activeSlot === slot && activeIdx === pending)) {
        return;
      }

      clearWatchdog();
      setActiveIdx(pending);
      setActiveSlot(slot);
      pendingIdxRef.current = null;
      setIsLoading(false);
    },
    [activeSlot, activeIdx, clearWatchdog]
  );

  // Kick off the first provider's watchdog on mount.
  useEffect(() => {
    if (!providers.length) return;
    timeoutRef.current = setTimeout(() => {
      switchToProvider(1);
    }, LOAD_TIMEOUT_MS);
    return clearWatchdog;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleManualSwitch = (idx: number) => {
    if (idx === activeIdx && !isLoading) return;
    switchToProvider(idx);
  };

  const handleNextServer = () => {
    switchToProvider((activeIdx + 1) % providers.length);
  };

  const handleRetry = () => {
    setActiveSlot("A");
    setSlotBProvider(null);
    setSlotAProvider(providers[0] ?? null);
    switchToProvider(0);
  };

  return (
    <div className="group relative aspect-video w-full overflow-hidden rounded-xl border border-white/10 bg-black shadow-2xl">
      {/* Header overlay */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-3 bg-gradient-to-b from-black/80 to-transparent p-4">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand px-2.5 py-0.5 text-xs font-semibold text-white">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
            LIVE
          </span>
          <h2 className="text-sm font-bold text-white drop-shadow md:text-base">
            {eventTitle}
          </h2>
        </div>

        {providers.length > 0 && (
          <div className="pointer-events-auto flex items-center gap-2">
            <select
              value={activeIdx}
              onChange={(e) => handleManualSwitch(Number(e.target.value))}
              className="rounded-lg border border-white/20 bg-black/70 px-3 py-1.5 text-xs font-medium text-white focus:outline-none"
              aria-label="Select stream server"
            >
              {providers.map((p, idx) => (
                <option key={p.id} value={idx}>
                  {p.name} · {p.quality}
                </option>
              ))}
            </select>
            <button
              onClick={handleNextServer}
              className="rounded-lg bg-white/20 px-2.5 py-1.5 text-xs font-medium text-white transition hover:bg-white/30"
            >
              Fix / Next ↻
            </button>
          </div>
        )}
      </div>

      {/* Loading indicator */}
      {isLoading && !hasError && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/60 backdrop-blur-sm">
          <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-brand border-t-transparent" />
          <p className="text-xs font-semibold text-white">
            Connecting to{" "}
            {providers[pendingIdxRef.current ?? activeIdx]?.name ?? "live feed"}…
          </p>
        </div>
      )}

      {/* All-servers-failed state */}
      {hasError && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-zinc-950 p-6 text-center">
          <h3 className="mb-2 text-lg font-bold text-brand">Stream Unavailable</h3>
          <p className="mb-4 max-w-md text-sm text-neutral-400">
            All live servers are currently offline or congested. This usually
            means the broadcast hasn&apos;t started yet or the hosts are still
            spinning up.
          </p>
          <button
            onClick={handleRetry}
            className="rounded-lg bg-brand px-4 py-2 text-xs font-medium text-white hover:bg-red-700"
          >
            Retry from Server 1
          </button>
        </div>
      )}

      {/* Slot A */}
      {slotAProvider && (
        <iframe
          key={`slot-a-${slotAProvider.id}`}
          src={slotAProvider.embedUrl}
          title={`${eventTitle} — ${slotAProvider.name}`}
          onLoad={() => handleLoaded("A")}
          allow={IFRAME_ALLOW}
          allowFullScreen
          referrerPolicy="origin"
          sandbox={IFRAME_SANDBOX}
          className={`absolute inset-0 h-full w-full border-0 transition-opacity duration-500 ${
            activeSlot === "A"
              ? "z-0 opacity-100"
              : "-z-10 pointer-events-none opacity-0"
          }`}
        />
      )}

      {/* Slot B (standby buffer) */}
      {slotBProvider && (
        <iframe
          key={`slot-b-${slotBProvider.id}`}
          src={slotBProvider.embedUrl}
          title={`${eventTitle} — ${slotBProvider.name}`}
          onLoad={() => handleLoaded("B")}
          allow={IFRAME_ALLOW}
          allowFullScreen
          referrerPolicy="origin"
          sandbox={IFRAME_SANDBOX}
          className={`absolute inset-0 h-full w-full border-0 transition-opacity duration-500 ${
            activeSlot === "B"
              ? "z-0 opacity-100"
              : "-z-10 pointer-events-none opacity-0"
          }`}
        />
      )}
    </div>
  );
}
