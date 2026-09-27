/**
 * Wrap an upstream stream URL so it flows through the Cloudflare Worker proxy,
 * carrying the required Referer. Used for the master manifest; the worker
 * rewrites nested segment URLs itself.
 *
 * If no proxy is configured we return the raw URL (works only when the host
 * happens to allow CORS, which is rare — configure the worker in production).
 */
export function proxied(url: string, referer: string | null): string {
  const base = process.env.NEXT_PUBLIC_STREAM_PROXY_URL;
  if (!base) return url;

  const u = new URL(base);
  u.searchParams.set("url", url);
  if (referer) u.searchParams.set("referer", referer);
  return u.toString();
}
