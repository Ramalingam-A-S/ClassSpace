import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  Building2,
  CalendarRange,
  CheckCircle2,
  Clock,
  DoorOpen,
  ShieldAlert,
  TicketCheck,
  XCircle,
} from 'lucide-react';
import { useAsyncData } from '../hooks/useAsyncData';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { classSpaceService } from '../services';
import type { Booking } from '../types/domain';
import { formatCampusDate, formatCampusTimestamp, getTodayKolkata, isValidDateString, isValidTimeRange } from '../utils/datetime';
import { AdminRoleGate } from '../components/layout/AdminRoleGate';
import { BookingStatusBadge, DataSourceBadge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, CardContent, CardHeader } from '../components/ui/Card';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import {
  DemoDisclosureBanner,
  ErrorBanner,
  LoadingCardsSkeleton,
} from '../components/ui/StateBanner';

export function AdminDashboardPage() {
  useDocumentTitle('Admin Dashboard');

  const [selectedDate, setSelectedDate] = useState<string>(getTodayKolkata);
  const [startTime, setStartTime] = useState<string>('11:00');
  const [endTime, setEndTime] = useState<string>('12:00');
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<Booking | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const rangeIsValid = isValidDateString(selectedDate) && isValidTimeRange(startTime, endTime);

  const { data, loading, error, reload } = useAsyncData(async () => {
    if (!rangeIsValid) {
      throw new Error('Select a valid date and a start time earlier than the end time.');
    }
    const [snapshot, bookings, rooms] = await Promise.all([
      classSpaceService.getAdminSnapshot(selectedDate, startTime, endTime),
      classSpaceService.listAllBookings(),
      classSpaceService.listRooms(),
    ]);
    return { snapshot, bookings, rooms };
  }, [selectedDate, startTime, endTime, rangeIsValid]);

  const handleApprove = async (booking: Booking) => {
    setProcessingId(booking.bookingId);
    setActionError(null);
    setActionSuccess(null);
    try {
      await classSpaceService.updateBookingStatus(booking.bookingId, 'APPROVED');
      setActionSuccess(
        `Approved demo booking ${booking.bookingId} (${booking.date} ${booking.startTime}–${booking.endTime}).`,
      );
      await reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to approve booking.');
    } finally {
      setProcessingId(null);
    }
  };

  const handleConfirmReject = async () => {
    if (!rejectTarget) return;
    setProcessingId(rejectTarget.bookingId);
    setActionError(null);
    setActionSuccess(null);
    try {
      await classSpaceService.updateBookingStatus(rejectTarget.bookingId, 'REJECTED');
      setActionSuccess(`Rejected demo booking ${rejectTarget.bookingId}.`);
      setRejectTarget(null);
      await reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to reject booking.');
    } finally {
      setProcessingId(null);
    }
  };

  const roomsById = new Map((data?.rooms ?? []).map((r) => [r.roomId, r]));
  const pendingBookings = (data?.bookings ?? []).filter((b) => b.status === 'PENDING');

  return (
    <AdminRoleGate>
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Administrator Dashboard
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Live metrics calculated from the Phase 1 demo repository (Asia/Kolkata IST).
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              to="/admin/rooms"
              className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50"
            >
              <DoorOpen className="h-4 w-4" aria-hidden="true" />
              Manage Rooms
            </Link>
            <Link
              to="/admin/timetable"
              className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-indigo-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-indigo-800"
            >
              <CalendarRange className="h-4 w-4" aria-hidden="true" />
              Manage Timetable &amp; Restrictions
            </Link>
          </div>
        </div>

        <DemoDisclosureBanner compact />

        {/* Snapshot Time Window Selector */}
        <section
          aria-label="Snapshot evaluation window"
          className="rounded-xl border border-slate-200 bg-white p-4"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Evaluate Vacancy &amp; Restrictions For Time Window
              </h2>
              <p className="text-xs text-slate-600">
                Adjust the date and interval to recalculate schedule-vacant and restricted room
                counts.
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label htmlFor="admin-snap-date" className="block text-xs font-semibold text-slate-700">
                  Date
                </label>
                <input
                  id="admin-snap-date"
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="mt-1 min-h-10 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                />
              </div>
              <div>
                <label htmlFor="admin-snap-start" className="block text-xs font-semibold text-slate-700">
                  Start
                </label>
                <input
                  id="admin-snap-start"
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="mt-1 min-h-10 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                />
              </div>
              <div>
                <label htmlFor="admin-snap-end" className="block text-xs font-semibold text-slate-700">
                  End
                </label>
                <input
                  id="admin-snap-end"
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="mt-1 min-h-10 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                />
              </div>
            </div>
          </div>
        </section>

        {error && <ErrorBanner message={error} />}
        {actionError && (
          <ErrorBanner message={actionError} onDismiss={() => setActionError(null)} />
        )}
        {actionSuccess && (
          <div
            role="status"
            className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"
          >
            {actionSuccess}
          </div>
        )}

        {loading || !data ? (
          <LoadingCardsSkeleton count={4} />
        ) : (
          <>
            {/* Metrics Cards */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <Card>
                <CardContent className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-500 uppercase">
                    <span>Total Rooms</span>
                    <Building2 className="h-4 w-4 text-slate-400" aria-hidden="true" />
                  </div>
                  <p className="text-3xl font-bold text-slate-900">{data.snapshot.totalRooms}</p>
                  <p className="text-xs text-slate-600">{data.snapshot.activeRooms} active</p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-semibold text-emerald-700 uppercase">
                    <span>Schedule-Vacant</span>
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                  </div>
                  <p className="text-3xl font-bold text-emerald-800">
                    {data.snapshot.scheduleVacantCount}
                  </p>
                  <p className="text-xs text-slate-600">
                    {startTime}–{endTime} IST
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-semibold text-amber-800 uppercase">
                    <span>Pending Requests</span>
                    <Clock className="h-4 w-4 text-amber-600" aria-hidden="true" />
                  </div>
                  <p className="text-3xl font-bold text-amber-900">
                    {data.snapshot.pendingBookingsCount}
                  </p>
                  <p className="text-xs text-slate-600">Awaiting review</p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-semibold text-sky-800 uppercase">
                    <span>Approved Bookings</span>
                    <TicketCheck className="h-4 w-4 text-sky-600" aria-hidden="true" />
                  </div>
                  <p className="text-3xl font-bold text-sky-900">
                    {data.snapshot.approvedBookingsCount}
                  </p>
                  <p className="text-xs text-slate-600">Total active approvals</p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-semibold text-rose-800 uppercase">
                    <span>Restricted Rooms</span>
                    <ShieldAlert className="h-4 w-4 text-rose-600" aria-hidden="true" />
                  </div>
                  <p className="text-3xl font-bold text-rose-900">
                    {data.snapshot.restrictedRoomsCount}
                  </p>
                  <p className="text-xs text-slate-600">For selected window</p>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              {/* Pending Booking Approval Queue */}
              <div className="lg:col-span-2">
                <Card>
                  <CardHeader className="flex items-center justify-between">
                    <div>
                      <h2 className="text-base font-semibold text-slate-900">
                        Pending Booking Requests ({pendingBookings.length})
                      </h2>
                      <p className="text-xs text-slate-600">
                        Approving checks for timetable, restriction, and existing booking conflicts.
                      </p>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {pendingBookings.length === 0 ? (
                      <p className="text-sm text-slate-600">
                        All demo booking requests have been reviewed.
                      </p>
                    ) : (
                      <ul className="space-y-3">
                        {pendingBookings.map((booking) => {
                          const room = roomsById.get(booking.roomId);
                          const isBusy = processingId === booking.bookingId;
                          return (
                            <li
                              key={booking.bookingId}
                              className="flex flex-col justify-between gap-3 rounded-lg border border-slate-200 p-4 sm:flex-row sm:items-center"
                            >
                              <div className="space-y-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-bold text-slate-900">
                                    {room ? `${room.blockId} / ${room.roomNumber}` : booking.roomId}
                                  </span>
                                  <BookingStatusBadge status={booking.status} />
                                  <DataSourceBadge dataSource={booking.dataSource} />
                                </div>
                                <p className="text-xs text-slate-700">
                                  <strong>{formatCampusDate(booking.date)}</strong> •{' '}
                                  {booking.startTime}–{booking.endTime} IST
                                </p>
                                <p className="text-xs text-slate-600">
                                  Requested by {booking.studentName ?? booking.studentId} —{' '}
                                  {booking.purpose ?? 'General academic use'}
                                </p>
                              </div>

                              <div className="flex flex-wrap items-center gap-2">
                                <Button
                                  type="button"
                                  variant="primary"
                                  size="sm"
                                  loading={isBusy}
                                  onClick={() => handleApprove(booking)}
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                                  Approve
                                </Button>
                                <Button
                                  type="button"
                                  variant="danger"
                                  size="sm"
                                  disabled={isBusy}
                                  onClick={() => setRejectTarget(booking)}
                                >
                                  <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                                  Reject
                                </Button>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </CardContent>
                </Card>

                {/* All Bookings Table */}
                <Card className="mt-6">
                  <CardHeader>
                    <h2 className="text-base font-semibold text-slate-900">
                      All Demo Bookings ({data.bookings.length})
                    </h2>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <caption className="visually-hidden">
                          All demo booking requests across students
                        </caption>
                        <thead>
                          <tr className="border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase">
                            <th scope="col" className="py-2 pr-3">
                              Room
                            </th>
                            <th scope="col" className="py-2 pr-3">
                              Date &amp; Time
                            </th>
                            <th scope="col" className="py-2 pr-3">
                              Student
                            </th>
                            <th scope="col" className="py-2">
                              Status
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {data.bookings.map((b) => {
                            const room = roomsById.get(b.roomId);
                            return (
                              <tr key={b.bookingId}>
                                <td className="py-2.5 pr-3 font-medium text-slate-900">
                                  {room ? `${room.blockId} / ${room.roomNumber}` : b.roomId}
                                </td>
                                <td className="py-2.5 pr-3 text-xs text-slate-700">
                                  {b.date} ({b.startTime}–{b.endTime})
                                </td>
                                <td className="py-2.5 pr-3 text-xs text-slate-600">
                                  {b.studentName ?? b.studentId}
                                </td>
                                <td className="py-2.5">
                                  <BookingStatusBadge status={b.status} />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Recent Activity Feed */}
              <div>
                <Card>
                  <CardHeader>
                    <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
                      <Activity className="h-4 w-4 text-indigo-700" aria-hidden="true" />
                      Recent Activity
                    </h2>
                  </CardHeader>
                  <CardContent>
                    {data.snapshot.recentActivities.length === 0 ? (
                      <p className="text-sm text-slate-600">No recent demo activity recorded.</p>
                    ) : (
                      <ul className="space-y-3">
                        {data.snapshot.recentActivities.map((act) => (
                          <li
                            key={act.id}
                            className="border-l-2 border-indigo-200 pl-3 text-xs leading-relaxed"
                          >
                            <p className="text-slate-800">{act.message}</p>
                            <p className="mt-1 text-slate-500">
                              {formatCampusTimestamp(act.timestamp)} IST • {act.dataSource}
                            </p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </>
        )}

        <ConfirmDialog
          open={Boolean(rejectTarget)}
          onClose={() => setRejectTarget(null)}
          onConfirm={handleConfirmReject}
          title="Reject demo booking request?"
          message={
            rejectTarget
              ? `Reject booking request ${rejectTarget.bookingId} for ${
                  roomsById.get(rejectTarget.roomId)?.roomNumber ?? rejectTarget.roomId
                } (${rejectTarget.date} ${rejectTarget.startTime}–${rejectTarget.endTime})?`
              : ''
          }
          confirmLabel="Reject Request"
          variant="danger"
          loading={processingId !== null}
        />
      </div>
    </AdminRoleGate>
  );
}
