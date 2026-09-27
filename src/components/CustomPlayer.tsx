"use client";

import { useEffect, useRef } from "react";
import Hls from "hls.js";
import Plyr from "plyr";
import type { StreamResponse } from "@/lib/types";
import { proxied } from "@/lib/proxy";

/**
 * Custom HLS player.
 *
 * - Picks the best source from the extractor response.
 * - For m3u8: uses hls.js, routing the master manifest (and therefore every
 *   nested segment, via the worker's manifest rewriting) through the proxy.
 * - Falls back to native HLS (Safari) or a plain <video> src for mp4.
 * - Wraps the <video> in Plyr for a Netflix-style control bar.
 *
 * Calls onFatal() if playback cannot be established so the parent can switch
 * to the iframe fallback.
 */
export function CustomPlayer({
  stream,
  onFatal,
}: {
  stream: StreamResponse;
  onFatal: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Prefer an m3u8 source, else take the first available.
    const source =
      stream.sources.find((s) => s.isM3U8) ?? stream.sources[0];
    if (!source) {
      onFatal();
      return;
    }

    const src = proxied(source.url, stream.referer);
    let hls: Hls | null = null;
    let player: Plyr | null = null;

    // Build Plyr caption tracks from subtitles (proxied for CORS).
    const captionTracks = stream.subtitles.slice(0, 8);

    function setupPlyr() {
      player = new Plyr(video as HTMLVideoElement, {
        captions: { active: true, update: true, language: "auto" },
        settings: ["captions", "quality", "speed"],
      });
    }

    if (source.isM3U8 && Hls.isSupported()) {
      hls = new Hls({
        // The worker already rewrites segment URLs, so no per-fragment
        // loader hacks are needed here.
        enableWorker: true,
        lowLatencyMode: false,
      });
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.ERROR, (_evt, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              hls?.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls?.recoverMediaError();
              break;
            default:
              hls?.destroy();
              onFatal();
          }
        }
      });
      hls.on(Hls.Events.MANIFEST_PARSED, setupPlyr);
    } else if (
      source.isM3U8 &&
      video.canPlayType("application/vnd.apple.mpegurl")
    ) {
      // Native HLS (Safari).
      video.src = src;
      setupPlyr();
    } else {
      // Direct file (mp4/webm).
      video.src = src;
      setupPlyr();
    }

    // Attach subtitle tracks after the element exists.
    for (const sub of captionTracks) {
      const track = document.createElement("track");
      track.kind = "subtitles";
      track.label = sub.lang;
      track.srclang = sub.lang.slice(0, 2).toLowerCase();
      track.src = proxied(sub.url, stream.referer);
      video.appendChild(track);
    }

    return () => {
      hls?.destroy();
      player?.destroy();
      if (video) {
        video.removeAttribute("src");
        video.innerHTML = "";
      }
    };
  }, [stream, onFatal]);

  return (
    <div className="aspect-video w-full overflow-hidden rounded-lg bg-black">
      <video
        ref={videoRef}
        controls
        crossOrigin="anonymous"
        playsInline
        className="h-full w-full"
      />
    </div>
  );
}
