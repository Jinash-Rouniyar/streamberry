# StreamBerry

A Netflix-style streaming aggregator built with Next.js (App Router). It uses
TMDB for metadata, an embedded extractor for raw stream links, a Cloudflare
Worker to proxy the video, and a third-party iframe as a fallback — the
"hybrid fallback" architecture for maximum uptime.

## Architecture

```
Browser ─┬─► TMDB API                (metadata: search, trending, details)
         │
         ├─► /api/stream (this app)   (extractor: @consumet/extensions)
         │        │
         │        └─► FlixHQ / SFlix / Goku  (scraped for raw m3u8)
         │
         ├─► Cloudflare Worker proxy  (injects Referer, strips CORS,
         │                             rewrites m3u8 segment URLs)
         │
         └─► Iframe embed (vidsrc)    (fallback when extraction fails)
```

Playback decision flow (in [`PlayerShell`](src/components/PlayerShell.tsx)):

1. Call `/api/stream` for a raw source.
2. Success -> render the ad-free [`CustomPlayer`](src/components/CustomPlayer.tsx) (hls.js + Plyr).
3. 404 / error / fatal player error -> render [`IframeFallback`](src/components/IframeFallback.tsx).

## Important: extractor note

The original plan was to deploy `consumet/api.consumet.org` as a separate
Vercel service. That repository was removed from GitHub via DMCA takedown
(2026-03). Instead, this app runs the still-published `@consumet/extensions`
library directly in the [`/api/stream`](src/app/api/stream/route.ts) route
handler (see [`src/lib/extractor.ts`](src/lib/extractor.ts)). This keeps the
extractor self-hosted on the same Vercel deployment with one fewer moving part.

`@consumet/extensions` is marked as a server-external package in
[`next.config.mjs`](next.config.mjs) because its `got-scraping` dependency
cannot be bundled by webpack.

## Prerequisites

- Node 18+
- A free TMDB API Read Access Token: https://www.themoviedb.org/settings/api
- A Cloudflare account (for the proxy worker)

## 1. App setup (local)

```bash
npm install
cp .env.example .env      # then fill in the values below
npm run dev               # http://localhost:3000
```

Environment variables (see [`.env.example`](.env.example)):

| Variable | Where | Purpose |
|---|---|---|
| `TMDB_ACCESS_TOKEN` | server | TMDB v4 read token for metadata |
| `CONSUMET_API_URL` | server | Optional: only if you run a standalone extractor |
| `NEXT_PUBLIC_STREAM_PROXY_URL` | browser | Cloudflare Worker base URL |
| `NEXT_PUBLIC_EMBED_BASE_URL` | browser | Iframe fallback base (default vidsrc.to/embed) |

## 2. Deploy the Cloudflare Worker proxy

The proxy is required for the custom player: raw `.m3u8`/`.ts` hosts block
cross-origin browser reads and require a specific `Referer`. Vercel is a poor
fit for piping video chunks (bandwidth limits), so we use a Cloudflare Worker.

```bash
cd worker
npm install
npx wrangler login
npx wrangler deploy
```

Wrangler prints a URL like `https://streamberry-proxy.<subdomain>.workers.dev`.
Put that in `NEXT_PUBLIC_STREAM_PROXY_URL`. Lock `ALLOWED_ORIGIN` in
[`worker/src/index.js`](worker/src/index.js) to your frontend domain for
production.

## 3. Deploy the app to Vercel

```bash
npm i -g vercel
vercel            # link/create the project
vercel --prod
```

Add the same environment variables in the Vercel dashboard
(Project -> Settings -> Environment Variables). `maxDuration` for the stream
route is set to 60s in [`route.ts`](src/app/api/stream/route.ts) for scraping
headroom.

## Optional: standalone extractor

If you later want the extractor on its own service (e.g. to share it across
apps or add caching), wrap the same `@consumet/extensions` calls in a small
Express/Fastify server, deploy it, and point `CONSUMET_API_URL` at it. You
would then swap [`src/lib/extractor.ts`](src/lib/extractor.ts) to `fetch` that
service instead of importing the library directly.

## Project layout

```
src/
  app/
    page.tsx                     Home (hero + carousels)
    search/page.tsx              Search results
    watch/[type]/[id]/page.tsx   Watch page (movie or tv)
    api/stream/route.ts          Extractor endpoint (TMDB -> sources)
    api/episodes/route.ts        Season episode list
  components/
    PlayerShell.tsx              Hybrid fallback orchestrator
    CustomPlayer.tsx             hls.js + Plyr player
    IframeFallback.tsx           Third-party embed fallback
    WatchClient.tsx              Season/episode selector
    MediaRow / MediaCard / SearchBar
  lib/
    tmdb.ts                      TMDB client
    extractor.ts                 @consumet/extensions wrapper + failover
    proxy.ts                     Builds proxied stream URLs
    types.ts
worker/
  src/index.js                   Cloudflare Worker CORS proxy
  wrangler.toml
```

## Legal

This is an educational reference implementation. It aggregates third-party
sources you do not control. Only stream content you are legally permitted to
access in your jurisdiction.
