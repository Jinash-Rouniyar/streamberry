import { NextResponse } from "next/server";
import { getShowStatus, isShowId } from "@/lib/wrestling";

/**
 * Just-in-time live status + stream resolver for a weekly show.
 *
 * When off air this returns instantly with the countdown and zero external
 * calls. When live/preflight it returns the deterministic embed providers.
 * Cached briefly so a burst of viewers during a broadcast shares one response.
 */
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { show: string } }
) {
  const { show } = params;
  if (!isShowId(show)) {
    return NextResponse.json({ error: "Unknown show" }, { status: 404 });
  }

  const status = getShowStatus(show);

  return NextResponse.json(status, {
    headers: {
      // Let the CDN/browser reuse this for a short window during the show.
      "Cache-Control": "public, max-age=30, s-maxage=60, stale-while-revalidate=60",
    },
  });
}
