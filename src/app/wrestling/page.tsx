import Link from "next/link";
import { getAllShowStatuses, getFeaturedStatus, type ShowStatus } from "@/lib/wrestling";

// Live status is time-sensitive, so always render at request time.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Wrestling · StreamBerry",
  description: "Live WWE Raw, NXT, and SmackDown streams.",
};

function humanCountdown(ms: number): string {
  const totalMin = Math.floor(ms / 60000);
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const mins = totalMin % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function ChannelCard({ status }: { status: ShowStatus }) {
  const { show } = status;
  return (
    <Link
      href={`/wrestling/${show.id}`}
      className={`group relative flex flex-col justify-between overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br ${show.accent.gradient} via-surface to-black p-5 transition hover:ring-2 ${show.accent.ring}`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs uppercase tracking-widest text-neutral-400">WWE</p>
          <h3 className={`text-xl font-extrabold ${show.accent.text}`}>
            {show.shortName}
          </h3>
        </div>
        {status.isLive ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand px-2.5 py-0.5 text-xs font-semibold text-white">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
            LIVE NOW
          </span>
        ) : (
          <span className="rounded-full border border-white/20 px-2.5 py-0.5 text-xs font-medium text-neutral-300">
            in {humanCountdown(status.msUntilAir)}
          </span>
        )}
      </div>

      <p className="mt-6 text-sm text-neutral-400">{show.tagline}</p>

      <div className="mt-4">
        <span
          className={`inline-block rounded ${
            status.isLive ? show.accent.bg : "bg-white/10"
          } px-4 py-1.5 text-sm font-semibold text-white`}
        >
          {status.isLive ? "Watch Live ▶" : "View Channel"}
        </span>
      </div>
    </Link>
  );
}

export default async function WrestlingHub() {
  const statuses = getAllShowStatuses();
  const featured = getFeaturedStatus(statuses);

  return (
    <div className="px-4 py-6 md:px-8">
      {/* Hero */}
      <section
        className={`relative mb-8 overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-r ${featured.show.accent.gradient} via-black to-black p-8 md:p-12`}
      >
        <p className="text-xs font-semibold uppercase tracking-widest text-neutral-400">
          {featured.isLive ? "Live right now" : "Up next"}
        </p>
        <h1 className="mt-2 text-3xl font-extrabold md:text-5xl">
          {featured.show.name}
        </h1>
        <p className="mt-3 max-w-xl text-sm text-neutral-300 md:text-base">
          {featured.show.tagline}
        </p>
        <div className="mt-5 flex items-center gap-3">
          <Link
            href={`/wrestling/${featured.show.id}`}
            className={`rounded ${featured.show.accent.bg} px-6 py-2 text-sm font-semibold text-white hover:opacity-90`}
          >
            {featured.isLive
              ? "Watch Live ▶"
              : `Airs in ${humanCountdown(featured.msUntilAir)}`}
          </Link>
        </div>
      </section>

      <h2 className="mb-4 text-lg font-bold">Live Channels</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {statuses.map((s) => (
          <ChannelCard key={s.show.id} status={s} />
        ))}
      </div>

      <p className="mt-8 max-w-2xl text-xs text-neutral-500">
        Streams are aggregated from third-party providers and load automatically
        during each show&apos;s broadcast window (US Eastern): Raw on Mondays,
        NXT on Tuesdays, and SmackDown on Fridays at 8:00 PM.
      </p>
    </div>
  );
}
