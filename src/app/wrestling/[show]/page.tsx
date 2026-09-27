import Link from "next/link";
import { notFound } from "next/navigation";
import { LiveChannel } from "@/components/LiveChannel";
import {
  SHOW_ORDER,
  SHOWS,
  getShowStatus,
  isShowId,
} from "@/lib/wrestling";

export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return SHOW_ORDER.map((show) => ({ show }));
}

export function generateMetadata({ params }: { params: { show: string } }) {
  if (!isShowId(params.show)) return { title: "Wrestling · StreamBerry" };
  const show = SHOWS[params.show];
  return {
    title: `${show.name} · Live · StreamBerry`,
    description: show.tagline,
  };
}

export default function WrestlingChannelPage({
  params,
}: {
  params: { show: string };
}) {
  if (!isShowId(params.show)) notFound();

  const status = getShowStatus(params.show);
  const { show } = status;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-8">
      {/* Breadcrumb + channel switcher */}
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <Link href="/wrestling" className="text-neutral-400 hover:text-white">
          Wrestling
        </Link>
        <span className="text-neutral-600">/</span>
        <span className={`font-semibold ${show.accent.text}`}>
          {show.shortName}
        </span>

        <div className="ml-auto flex gap-2">
          {SHOW_ORDER.map((id) => {
            const s = SHOWS[id];
            const active = id === show.id;
            return (
              <Link
                key={id}
                href={`/wrestling/${id}`}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  active
                    ? `${s.accent.bg} text-white`
                    : "bg-white/10 text-neutral-300 hover:bg-white/20"
                }`}
              >
                {s.shortName}
              </Link>
            );
          })}
        </div>
      </div>

      <LiveChannel initialStatus={status} />

      {/* Show info */}
      <div className="mt-6">
        <h1 className="text-2xl font-extrabold md:text-3xl">{show.name}</h1>
        <p className="mt-2 max-w-2xl text-sm text-neutral-400">{show.tagline}</p>

        <dl className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-neutral-500">Broadcast Day</dt>
            <dd className="font-medium text-white">
              {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][show.dayOfWeekEt]}
            </dd>
          </div>
          <div>
            <dt className="text-neutral-500">Start Time</dt>
            <dd className="font-medium text-white">8:00 PM ET</dd>
          </div>
          <div>
            <dt className="text-neutral-500">Runtime</dt>
            <dd className="font-medium text-white">{show.durationHours} hours</dd>
          </div>
        </dl>
      </div>

      <p className="mt-8 max-w-2xl text-xs text-neutral-500">
        This channel aggregates live streams from third-party embed providers.
        If a server is congested, use the quality dropdown or the &quot;Fix /
        Next&quot; button to switch mirrors instantly.
      </p>
    </div>
  );
}
