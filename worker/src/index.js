/**
 * StreamBerry CORS Proxy — Cloudflare Worker
 *
 * Raw .m3u8 manifests and .ts video chunks are served by cyberlockers that
 * (a) block cross-origin browser reads via CORS and (b) require a specific
 * Referer/Origin header. This worker sits between the browser player and the
 * upstream host: it injects the required Referer, strips restrictive CORS
 * headers, and rewrites nested playlist URLs so every segment also flows back
 * through the proxy.
 *
 * Usage:
 *   https://<worker>/?url=<encoded upstream url>&referer=<encoded referer>
 */

const ALLOWED_ORIGIN = "https://streamberry-delta.vercel.app";

function corsHeaders(extra = {}) {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Expose-Headers": "*",
    ...extra,
  };
}

/** Is this an HLS manifest we need to rewrite? */
function isM3U8(url, contentType) {
  return (
    url.toLowerCase().includes(".m3u8") ||
    (contentType || "").includes("mpegurl")
  );
}

/**
 * Rewrite every URI in an m3u8 playlist to route back through this proxy,
 * carrying the same referer. Handles both absolute and relative URIs, and
 * URIs embedded in tag attributes (e.g. EXT-X-KEY, EXT-X-MEDIA).
 */
function rewriteManifest(body, baseUrl, referer, proxyOrigin) {
  const base = new URL(baseUrl);

  const toProxy = (raw) => {
    let abs;
    try {
      abs = new URL(raw, base).toString();
    } catch {
      return raw;
    }
    const p = new URL(proxyOrigin);
    p.searchParams.set("url", abs);
    if (referer) p.searchParams.set("referer", referer);
    return p.toString();
  };

  return body
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;

      // Rewrite URIs inside quoted attributes, e.g. URI="key.bin".
      if (trimmed.startsWith("#")) {
        return line.replace(/URI="([^"]+)"/g, (_m, uri) => `URI="${toProxy(uri)}"`);
      }

      // A bare line is a segment or a nested playlist URI.
      return toProxy(trimmed);
    })
    .join("\n");
}

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    const reqUrl = new URL(request.url);
    const target = reqUrl.searchParams.get("url");
    const referer = reqUrl.searchParams.get("referer") || "";

    if (!target) {
      return new Response("Missing ?url parameter", {
        status: 400,
        headers: corsHeaders(),
      });
    }

    // Build upstream request with the headers cyberlockers expect.
    const upstreamHeaders = new Headers();
    if (referer) {
      upstreamHeaders.set("Referer", referer);
      try {
        upstreamHeaders.set("Origin", new URL(referer).origin);
      } catch {
        /* referer may be a bare origin already */
      }
    }
    // Forward Range for seeking support on .ts/.mp4 chunks.
    const range = request.headers.get("Range");
    if (range) upstreamHeaders.set("Range", range);
    upstreamHeaders.set(
      "User-Agent",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
    );

    let upstream;
    try {
      upstream = await fetch(target, {
        method: "GET",
        headers: upstreamHeaders,
        redirect: "follow",
      });
    } catch (e) {
      return new Response(`Upstream fetch failed: ${e}`, {
        status: 502,
        headers: corsHeaders(),
      });
    }

    const contentType = upstream.headers.get("Content-Type") || "";

    // Rewrite HLS manifests so nested segments also proxy through us.
    if (isM3U8(target, contentType)) {
      const text = await upstream.text();
      const rewritten = rewriteManifest(
        text,
        upstream.url || target,
        referer,
        reqUrl.origin + reqUrl.pathname
      );
      return new Response(rewritten, {
        status: upstream.status,
        headers: corsHeaders({
          "Content-Type": "application/vnd.apple.mpegurl",
        }),
      });
    }

    // Stream everything else (segments, keys, subtitles) straight through.
    const passthrough = corsHeaders({
      "Content-Type": contentType || "application/octet-stream",
    });
    for (const h of ["Content-Length", "Content-Range", "Accept-Ranges"]) {
      const v = upstream.headers.get(h);
      if (v) passthrough[h] = v;
    }

    return new Response(upstream.body, {
      status: upstream.status,
      headers: passthrough,
    });
  },
};
