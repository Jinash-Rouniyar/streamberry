import type { StreamResponse, StreamSource, StreamSubtitle } from "./types";

const QUALITY_RANK: Record<string, number> = {
  "4k": 4000,
  "2160p": 4000,
  "1080p": 1080,
  fhd: 1080,
  "720p": 720,
  hd: 720,
  "480p": 480,
  sd: 480,
  auto: 0,
  unknown: 0,
};

export function qualityScore(q: string): number {
  const key = q.toLowerCase().replace(/\s/g, "");
  const parsed = parseInt(key, 10);
  return QUALITY_RANK[key] ?? (Number.isNaN(parsed) ? 0 : parsed);
}

export function sortSourcesByQuality(sources: StreamSource[]): StreamSource[] {
  return [...sources].sort((a, b) => {
    const qa = qualityScore(a.quality);
    const qb = qualityScore(b.quality);
    if (qb !== qa) return qb - qa;
    if (a.isM3U8 !== b.isM3U8) return a.isM3U8 ? -1 : 1;
    return 0;
  });
}

/** Map arbitrary provider JSON into our StreamResponse shape. */
export function normalizeProviderPayload(
  data: unknown,
  providerLabel: string
): StreamResponse | null {
  if (!data || typeof data !== "object") return null;
  const obj = data as Record<string, unknown>;

  const rawSources =
    (obj.sources as unknown[]) ??
    (obj.streams as unknown[]) ??
    (obj.data as Record<string, unknown>)?.sources ??
    [];

  if (!Array.isArray(rawSources) || rawSources.length === 0) return null;

  const headers = (
    obj.headers ??
    (rawSources[0] as Record<string, unknown>)?.headers
  ) as Record<string, string> | undefined;

  const referer =
    headers?.Referer ??
    headers?.referer ??
    (obj.referer as string) ??
    null;

  const sources: StreamSource[] = rawSources
    .map((s) => {
      const row = s as Record<string, unknown>;
      const url = (row.url ?? row.link ?? row.file) as string | undefined;
      if (!url) return null;
      const type = String(row.type ?? row.format ?? "").toLowerCase();
      const isM3U8 =
        Boolean(row.isM3U8) ||
        type.includes("hls") ||
        url.includes(".m3u8");
      return {
        url,
        quality: String(row.quality ?? row.label ?? "auto"),
        isM3U8,
      };
    })
    .filter((x): x is StreamSource => x !== null);

  if (!sources.length) return null;

  const rawSubs = (obj.subtitles as unknown[]) ?? [];
  const subtitles: StreamSubtitle[] = rawSubs
    .map((s) => {
      const row = s as Record<string, unknown>;
      const url = row.url as string | undefined;
      if (!url) return null;
      return {
        url,
        lang: String(row.lang ?? row.label ?? row.language ?? "Unknown"),
      };
    })
    .filter((x): x is StreamSubtitle => x !== null);

  return {
    sources: sortSourcesByQuality(sources),
    subtitles,
    referer,
    provider: providerLabel,
  };
}

export function applyStreamUrlTemplate(
  template: string,
  vars: Record<string, string>
): string {
  let out = template;
  for (const [key, value] of Object.entries(vars)) {
    const encoded = key === "base" ? value : encodeURIComponent(value);
    out = out.replaceAll(`{${key}}`, encoded);
  }
  return out;
}
