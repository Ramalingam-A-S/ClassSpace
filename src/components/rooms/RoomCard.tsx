import { Link } from 'react-router-dom';
import { ArrowRight, Building2, Layers, Users } from 'lucide-react';
import type { RoomAvailabilityResult } from '../../types/domain';
import { AvailabilityBadge, DataSourceBadge } from '../ui/Badge';
import { Card, CardContent } from '../ui/Card';

interface RoomCardProps {
  result: RoomAvailabilityResult;
  searchDate: string;
  searchStartTime: string;
  searchEndTime: string;
}

export function RoomCard({
  result,
  searchDate,
  searchStartTime,
  searchEndTime,
}: RoomCardProps) {
  const { room, status, explanation, pendingBookingsCount } = result;
  const detailsUrl = `/rooms/${room.roomId}?date=${encodeURIComponent(searchDate)}&start=${encodeURIComponent(
    searchStartTime,
  )}&end=${encodeURIComponent(searchEndTime)}`;

  return (
    <Card className="flex flex-col justify-between transition-shadow hover:shadow-sm">
      <CardContent className="flex flex-1 flex-col justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="text-lg font-bold text-slate-900">
                {room.blockId} / {room.roomNumber}
              </h3>
              <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-600">
                <span className="inline-flex items-center gap-1">
                  <Building2 className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                  {room.blockId}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Layers className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                  Floor {room.floor}
                </span>
                <span className="inline-flex items-center gap-1 font-medium text-slate-800">
                  <Users className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                  {room.capacity} seats
                </span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <AvailabilityBadge status={status} />
              <DataSourceBadge dataSource={room.dataSource} />
            </div>
          </div>

          <p className="mt-3 text-sm leading-relaxed text-slate-700">{explanation}</p>

          {pendingBookingsCount > 0 && status === 'SCHEDULE_VACANT' && (
            <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900">
              {pendingBookingsCount} unapproved pending booking request(s) exist for this slot
              (does not block availability).
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-1.5">
            {room.facilities.map((facility) => (
              <span
                key={facility}
                className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-700"
              >
                {facility}
              </span>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 pt-3">
          <span className="text-xs text-slate-500">
            Physical occupancy not sensor-verified
          </span>
          <Link
            to={detailsUrl}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-indigo-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-indigo-800"
          >
            View Details
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
