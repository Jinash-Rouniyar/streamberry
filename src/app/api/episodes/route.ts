import { NextRequest, NextResponse } from "next/server";
import { getSeasonEpisodes } from "@/lib/tmdb";

// GET /api/episodes?tvId=1399&season=1
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const tvId = Number(sp.get("tvId"));
  const season = Number(sp.get("season") ?? "1");

  if (!tvId || Number.isNaN(tvId)) {
    return NextResponse.json({ error: "Missing tvId" }, { status: 400 });
  }

  try {
    const episodes = await getSeasonEpisodes(tvId, season);
    return NextResponse.json(
      { episodes },
      { headers: { "Cache-Control": "s-maxage=3600" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
