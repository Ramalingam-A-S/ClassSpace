import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Building2,
  CalendarPlus,
  Layers,
  ShieldAlert,
  Users,
} from 'lucide-react';
import { useAsyncData } from '../hooks/useAsyncData';
import { useDemoRole } from '../hooks/useDemoRole';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { classSpaceService } from '../services';
import { evaluateRoomAvailability } from '../services/availabilityEngine';
import { formatCampusDate, getTodayKolkata, isValidDateString, isValidTimeRange } from '../utils/datetime';
import { AvailabilityBadge, DataSourceBadge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, CardContent, CardHeader } from '../components/ui/Card';
import {
  DemoDisclosureBanner,
  EmptyState,
  ErrorBanner,
  LoadingCardsSkeleton,
  PhysicalOccupancyBanner,
} from '../components/ui/StateBanner';
import { BookingRequestModal } from '../components/bookings/BookingRequestModal';

export function RoomDetailsPage() {
  const { roomId = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { role } = useDemoRole();

  const initialDate = searchParams.get('date');
  const selectedDate = initialDate && isValidDateString(initialDate) ? initialDate : getTodayKolkata();
  const paramStart = searchParams.get('start') ?? '11:00';
  const paramEnd = searchParams.get('end') ?? '12:00';
  const validRange = isValidTimeRange(paramStart, paramEnd);
  const windowStart = validRange ? paramStart : '11:00';
  const windowEnd = validRange ? paramEnd : '12:00';

  const [bookingModalOpen, setBookingModalOpen] = useState(false);
  const [bookingFeedback, setBookingFeedback] = useState<string | null>(null);

  const { data, loading, error, reload } = useAsyncData(
    () => classSpaceService.getRoomDetails(roomId, selectedDate),
    [roomId, selectedDate],
  );

  useDocumentTitle(
    data?.room ? `${data.room.blockId} / ${data.room.roomNumber}` : 'Classroom Details',
  );

  const handleDateChange = (nextDate: string) => {
    if (!isValidDateString(nextDate)) return;
    const next = new URLSearchParams(searchParams);
    next.set('date', nextDate);
    setSearchParams(next);
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <LoadingCardsSkeleton count={2} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 px-4 py-8 sm:px-6 lg:px-8">
        <ErrorBanner message={error} />
        <Link to="/student" className="text-sm font-semibold text-indigo-700 hover:underline">
          &larr; Back to Classroom Search
        </Link>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 px-4 py-8 sm:px-6 lg:px-8">
        <EmptyState
          title="Classroom not found"
          description="The requested classroom identifier does not exist in the Phase 1 demo dataset."
          action={
            <Link
              to="/student"
              className="inline-flex min-h-11 items-center rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-800"
            >
              Return to Search
            </Link>
          }
        />
      </div>
    );
  }

  const { room, timetable, approvedBookings, pendingBookings, restrictions } = data;

  const slotEvaluation = evaluateRoomAvailability(
    room,
    { date: selectedDate, startTime: windowStart, endTime: windowEnd, minCapacity: 1 },
    { timetable, bookings: [...approvedBookings, ...pendingBookings], restrictions },
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <div>
        <Link
          to="/student"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-700 hover:underline"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to Classroom Search
        </Link>
      </div>

      <DemoDisclosureBanner compact />
      <PhysicalOccupancyBanner />

      {bookingFeedback && (
        <div
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"
        >
          {bookingFeedback}{' '}
          <Link to="/bookings" className="font-semibold underline">
            View My Bookings
          </Link>
        </div>
      )}

      {/* Room Summary Card */}
      <Card>
        <CardContent className="space-y-5">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold text-slate-900">
                  {room.blockId} / {room.roomNumber}
                </h1>
                <AvailabilityBadge status={slotEvaluation.status} />
                <DataSourceBadge dataSource={room.dataSource} />
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-slate-600">
                <span className="inline-flex items-center gap-1.5">
                  <Building2 className="h-4 w-4 text-slate-400" aria-hidden="true" />
                  {room.blockId}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Layers className="h-4 w-4 text-slate-400" aria-hidden="true" />
                  Floor {room.floor}
                </span>
                <span className="inline-flex items-center gap-1.5 font-medium text-slate-800">
                  <Users className="h-4 w-4 text-slate-400" aria-hidden="true" />
                  Capacity: {room.capacity} seats
                </span>
              </div>
            </div>

            <div className="flex flex-col items-start gap-2 sm:items-end">
              {role === 'STUDENT_DEMO' ? (
                <Button
                  type="button"
                  variant="primary"
                  disabled={!room.active}
                  onClick={() => setBookingModalOpen(true)}
                >
                  <CalendarPlus className="h-4 w-4" aria-hidden="true" />
                  Request Use (Demo)
                </Button>
              ) : (
                <Link
                  to="/admin/timetable"
                  className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                >
                  Manage in Timetable Admin
                </Link>
              )}
              {!room.active && (
                <span className="text-xs font-medium text-rose-700">
                  Room is inactive and cannot be requested.
                </span>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-sm text-slate-700">
            <strong className="font-semibold text-slate-900">
              Evaluated Slot ({windowStart}–{windowEnd} IST on {formatCampusDate(selectedDate)}):
            </strong>{' '}
            {slotEvaluation.explanation}
          </div>

          <div>
            <h2 className="text-xs font-semibold tracking-wider text-slate-600 uppercase">
              Room Facilities
            </h2>
            <div className="mt-2 flex flex-wrap gap-2">
              {room.facilities.map((facility) => (
                <span
                  key={facility}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-800"
                >
                  {facility}
                </span>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Date Selector */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Schedule &amp; Restrictions for {formatCampusDate(selectedDate)}
          </h2>
          <p className="text-xs text-slate-600">All times are in Asia/Kolkata (IST).</p>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="detail-date" className="text-xs font-semibold text-slate-700">
            Inspect Date:
          </label>
          <input
            id="detail-date"
            type="date"
            value={selectedDate}
            onChange={(e) => handleDateChange(e.target.value)}
            className="min-h-10 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-900"
          />
        </div>
      </div>

      {/* Timetable, Approved Bookings & Restrictions */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <h3 className="text-base font-semibold text-slate-900">
              Timetable Slots ({timetable.length})
            </h3>
          </CardHeader>
          <CardContent>
            {timetable.length === 0 ? (
              <p className="text-sm text-slate-600">
                No timetable classes scheduled for this room on {selectedDate}.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <caption className="visually-hidden">
                    Timetable entries for {room.roomNumber} on {selectedDate}
                  </caption>
                  <thead>
                    <tr className="border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase">
                      <th scope="col" className="py-2 pr-3">
                        Time (IST)
                      </th>
                      <th scope="col" className="py-2 pr-3">
                        Subject
                      </th>
                      <th scope="col" className="py-2">
                        Source
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {timetable.map((entry) => (
                      <tr key={entry.scheduleId}>
                        <td className="py-2.5 pr-3 font-medium whitespace-nowrap text-slate-900">
                          {entry.startTime}–{entry.endTime}
                        </td>
                        <td className="py-2.5 pr-3 text-slate-700">{entry.subject}</td>
                        <td className="py-2.5">
                          <DataSourceBadge dataSource={entry.dataSource} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <h3 className="text-base font-semibold text-slate-900">
                Approved Student Bookings ({approvedBookings.length})
              </h3>
            </CardHeader>
            <CardContent className="space-y-3">
              {approvedBookings.length === 0 ? (
                <p className="text-sm text-slate-600">
                  No approved bookings on {selectedDate}.
                </p>
              ) : (
                <ul className="space-y-2.5">
                  {approvedBookings.map((booking) => (
                    <li
                      key={booking.bookingId}
                      className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm"
                    >
                      <div className="flex items-center justify-between gap-2 font-semibold text-sky-950">
                        <span>
                          {booking.startTime}–{booking.endTime} IST
                        </span>
                        <DataSourceBadge dataSource={booking.dataSource} />
                      </div>
                      <p className="mt-1 text-xs text-sky-900">
                        {booking.purpose || 'Approved student session'}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
              {pendingBookings.length > 0 && (
                <p className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">
                  {pendingBookings.length} pending booking request(s) exist for this date and do not
                  block availability until approved.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900">
                <ShieldAlert className="h-4 w-4 text-rose-700" aria-hidden="true" />
                Administrator Restrictions ({restrictions.length})
              </h3>
            </CardHeader>
            <CardContent>
              {restrictions.length === 0 ? (
                <p className="text-sm text-slate-600">
                  No room restrictions active on {selectedDate}.
                </p>
              ) : (
                <ul className="space-y-2.5">
                  {restrictions.map((res) => (
                    <li
                      key={res.restrictionId}
                      className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm"
                    >
                      <div className="font-semibold text-rose-950">
                        {res.startTime}–{res.endTime} IST
                      </div>
                      <p className="mt-1 text-xs text-rose-900">{res.reason}</p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <BookingRequestModal
        open={bookingModalOpen}
        onClose={() => setBookingModalOpen(false)}
        room={room}
        defaultDate={selectedDate}
        defaultStartTime={windowStart}
        defaultEndTime={windowEnd}
        onSuccess={() => {
          setBookingFeedback(
            `Demo booking request submitted for ${room.blockId} / ${room.roomNumber} on ${selectedDate}. Status is PENDING administrator review.`,
          );
          void reload();
        }}
      />
    </div>
  );
}
