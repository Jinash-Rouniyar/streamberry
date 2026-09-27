import { NextRequest, NextResponse } from "next/server";
import { listWingServers } from "@/lib/backends/wing";
import type { StreamServerOption } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/servers
 *
 * When WING_API_BASE is set (Cinejoy-style backend), returns Lisbon/Nebula/…
 * from GET {base}/servers. Otherwise returns a single "auto" entry so the
 * client still tries /api/stream once.
 */
export async function GET(_req: NextRequest) {
  const wingBase =
    process.env.WING_API_BASE?.trim() || "https://api.wing.st";
  let servers: StreamServerOption[] = [];

  if (wingBase) {
    const wing = await listWingServers(wingBase);
    servers = wing.map((s) => ({
      name: s.name,
      fourK: s.fourK,
      status: s.status,
    }));
  }

  if (!servers.length) {
    servers = [{ name: "auto", fourK: false, status: "ok" }];
  }

  return NextResponse.json({ servers });
}
