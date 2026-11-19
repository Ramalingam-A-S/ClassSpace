import { AvailabilityBadge } from '../ui/Badge';

export function AvailabilityLegend() {
  return (
    <section
      aria-label="Availability status legend"
      className="rounded-xl border border-slate-200 bg-white p-4"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-xs font-semibold tracking-wider text-slate-700 uppercase">
            Availability Status Legend
          </h2>
          <p className="mt-0.5 text-xs text-slate-600">
            Statuses reflect schedule records only — physical occupancy is never assumed or
            sensor-verified.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AvailabilityBadge status="SCHEDULE_VACANT" />
          <AvailabilityBadge status="OCCUPIED_TIMETABLE" />
          <AvailabilityBadge status="OCCUPIED_BOOKING" />
          <AvailabilityBadge status="RESTRICTED" />
          <AvailabilityBadge status="INACTIVE" />
        </div>
      </div>
    </section>
  );
}
