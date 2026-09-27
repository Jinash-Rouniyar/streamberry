import { NextRequest, NextResponse } from "next/server";
import { getDetail } from "@/lib/tmdb";
import { resolveStream } from "@/lib/resolve-stream";
import type { MediaType } from "@/lib/types";

// Extraction scrapes remote sites; never statically cache and allow time.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/stream?type=movie&id=27205
 * GET /api/stream?type=tv&id=1399&season=1&episode=1
 *
 * Resolves TMDB metadata, then asks the extractor layer for playable sources.
 * Returns 404 when no source could be extracted so the client can fall back
 * to the iframe embed.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const type = (sp.get("type") === "tv" ? "tv" : "movie") as MediaType;
  const id = Number(sp.get("id"));
  const season = Number(sp.get("season") ?? "1");
  const episode = Number(sp.get("episode") ?? "1");
  const rawServer = sp.get("server");
  const server =
    rawServer && rawServer !== "auto" ? rawServer : undefined;

  if (!id || Number.isNaN(id)) {
    return NextResponse.json({ error: "Missing or invalid id" }, { status: 400 });
  }

  try {
    const detail = await getDetail(type, id);
    const year = detail.releaseDate?.slice(0, 4) ?? null;

    const result = await resolveStream({
      tmdbId: id,
      title: detail.title,
      year,
      mediaType: type,
      season,
      episode,
      server,
    });

    if (!result) {
      return NextResponse.json(
        { error: "No sources found", fallback: true },
        { status: 404 }
      );
    }

    return NextResponse.json(result, {
      headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=600" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Extraction failed";
    return NextResponse.json({ error: message, fallback: true }, { status: 500 });
  }
}
