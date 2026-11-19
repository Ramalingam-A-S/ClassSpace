import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Calendar, Clock, MapPin, Search } from 'lucide-react';
import { useAsyncData } from '../hooks/useAsyncData';
import { useDemoRole } from '../hooks/useDemoRole';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { classSpaceService } from '../services';
import type { Booking, BookingStatus } from '../types/domain';
import { formatCampusDate, formatCampusTimestamp } from '../utils/datetime';
import { BookingStatusBadge, DataSourceBadge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, CardContent } from '../components/ui/Card';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import {
  DemoDisclosureBanner,
  EmptyState,
  ErrorBanner,
  LoadingCardsSkeleton,
} from '../components/ui/StateBanner';

export function MyBookingsPage() {
  useDocumentTitle('My Bookings');
  const { role, identity, setRole } = useDemoRole();
  const [statusFilter, setStatusFilter] = useState<'ALL' | BookingStatus>('ALL');
  const [cancelTarget, setCancelTarget] = useState<Booking | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const studentUserId = role === 'STUDENT_DEMO' ? identity.userId : 'student-demo-01';

  const { data, loading, error, reload } = useAsyncData(async () => {
    const [bookings, rooms] = await Promise.all([
      classSpaceService.getMyBookings(studentUserId),
      classSpaceService.listRooms(),
    ]);
    return { bookings, rooms };
  }, [studentUserId]);

  const handleConfirmCancel = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    setActionError(null);
    try {
      await classSpaceService.updateBookingStatus(cancelTarget.bookingId, 'CANCELLED');
      setCancelTarget(null);
      await reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to cancel booking.');
    } finally {
      setCancelling(false);
    }
  };

  if (role !== 'STUDENT_DEMO') {
    return (
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="text-2xl font-bold text-slate-900">My Bookings</h1>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">
          <p className="font-semibold">Currently viewing as Admin Demo ({identity.displayName})</p>
          <p className="mt-1">
            Student booking history is scoped per student account. Switch back to the Student Demo
            role to inspect and manage your demo requests.
          </p>
          <div className="mt-4">
            <Button type="button" variant="primary" onClick={() => setRole('STUDENT_DEMO')}>
              Switch to Student Demo
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const roomsById = new Map((data?.rooms ?? []).map((r) => [r.roomId, r]));
  const allBookings = data?.bookings ?? [];
  const filteredBookings =
    statusFilter === 'ALL'
      ? allBookings
      : allBookings.filter((b) => b.status === statusFilter);

  const counts = {
    ALL: allBookings.length,
    PENDING: allBookings.filter((b) => b.status === 'PENDING').length,
    APPROVED: allBookings.filter((b) => b.status === 'APPROVED').length,
    REJECTED: allBookings.filter((b) => b.status === 'REJECTED').length,
    CANCELLED: allBookings.filter((b) => b.status === 'CANCELLED').length,
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">My Demo Bookings</h1>
          <p className="mt-1 text-sm text-slate-600">
            Showing requests owned by <strong>{identity.displayName}</strong> only.
          </p>
        </div>
        <Link
          to="/student"
          className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-800"
        >
          <Search className="h-4 w-4" aria-hidden="true" />
          Find Another Classroom
        </Link>
      </div>

      <DemoDisclosureBanner compact />

      {error && <ErrorBanner message={error} />}
      {actionError && (
        <ErrorBanner message={actionError} onDismiss={() => setActionError(null)} />
      )}

      {/* Status Filter Tabs */}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter bookings by status">
        {(['ALL', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setStatusFilter(tab)}
            className={`min-h-10 cursor-pointer rounded-lg border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
              statusFilter === tab
                ? 'border-indigo-700 bg-indigo-700 text-white'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            {tab === 'ALL' ? 'All Requests' : tab.charAt(0) + tab.slice(1).toLowerCase()} (
            {counts[tab]})
          </button>
        ))}
      </div>

      {loading ? (
        <LoadingCardsSkeleton count={3} />
      ) : filteredBookings.length === 0 ? (
        <EmptyState
          title="No booking requests in this category"
          description="Search for a schedule-vacant classroom during your free period and submit a demo booking request."
          action={
            <Link
              to="/student"
              className="inline-flex min-h-11 items-center rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-800"
            >
              Find a Classroom
            </Link>
          }
        />
      ) : (
        <div className="space-y-4">
          {filteredBookings.map((booking) => {
            const room = roomsById.get(booking.roomId);
            return (
              <Card key={booking.bookingId}>
                <CardContent className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-bold text-slate-900">
                        {room ? `${room.blockId} / ${room.roomNumber}` : booking.roomId}
                      </h2>
                      <BookingStatusBadge status={booking.status} />
                      <DataSourceBadge dataSource={booking.dataSource} />
                    </div>

                    <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
                      <span className="inline-flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                        {formatCampusDate(booking.date)}
                      </span>
                      <span className="inline-flex items-center gap-1.5 font-medium text-slate-800">
                        <Clock className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                        {booking.startTime}–{booking.endTime} IST
                      </span>
                      {room && (
                        <span className="inline-flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                          Floor {room.floor} • {room.capacity} seats
                        </span>
                      )}
                    </div>

                    {booking.purpose && (
                      <p className="text-sm text-slate-700">Purpose: {booking.purpose}</p>
                    )}

                    <p className="text-xs text-slate-500">
                      Submitted: {formatCampusTimestamp(booking.createdAt)} IST • ID:{' '}
                      <code>{booking.bookingId}</code>
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      to={`/rooms/${booking.roomId}?date=${encodeURIComponent(booking.date)}`}
                      className="inline-flex min-h-10 items-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      View Room
                    </Link>
                    {booking.status === 'PENDING' && (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => setCancelTarget(booking)}
                      >
                        Cancel Request
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(cancelTarget)}
        onClose={() => setCancelTarget(null)}
        onConfirm={handleConfirmCancel}
        title="Cancel pending booking request?"
        message={
          cancelTarget
            ? `Are you sure you want to cancel your request for ${
                roomsById.get(cancelTarget.roomId)?.roomNumber ?? cancelTarget.roomId
              } on ${cancelTarget.date} (${cancelTarget.startTime}–${cancelTarget.endTime})?`
            : ''
        }
        confirmLabel="Yes, Cancel Request"
        variant="danger"
        loading={cancelling}
      />
    </div>
  );
}
