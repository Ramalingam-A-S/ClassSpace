import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle, CalendarPlus, Edit2, ShieldAlert, Trash2 } from 'lucide-react';
import { useAsyncData } from '../hooks/useAsyncData';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { classSpaceService } from '../services';
import { findOverlappingTimetableEntries } from '../services/availabilityEngine';
import type { RoomRestriction, TimetableEntry } from '../types/domain';
import { getTodayKolkata, isValidDateString, isValidTimeRange } from '../utils/datetime';
import {
  restrictionFormSchema,
  timetableFormSchema,
  type RestrictionFormValues,
  type TimetableFormValues,
} from '../utils/validation';
import { AdminRoleGate } from '../components/layout/AdminRoleGate';
import { DataSourceBadge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, CardContent, CardHeader } from '../components/ui/Card';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Dialog } from '../components/ui/Dialog';
import {
  DemoDisclosureBanner,
  ErrorBanner,
  LoadingCardsSkeleton,
} from '../components/ui/StateBanner';

export function AdminTimetablePage() {
  useDocumentTitle('Timetable & Restrictions');

  const { data, loading, error, reload } = useAsyncData(async () => {
    const [rooms, timetable, restrictions] = await Promise.all([
      classSpaceService.listRooms(),
      classSpaceService.listTimetableEntries(),
      classSpaceService.listRestrictions(),
    ]);
    return { rooms, timetable, restrictions };
  }, []);

  const [ttModalOpen, setTtModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<TimetableEntry | null>(null);
  const [deleteEntryTarget, setDeleteEntryTarget] = useState<TimetableEntry | null>(null);
  const [resModalOpen, setResModalOpen] = useState(false);
  const [deleteResTarget, setDeleteResTarget] = useState<RoomRestriction | null>(null);

  const [ttError, setTtError] = useState<string | null>(null);
  const [resError, setResError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const defaultRoomId = data?.rooms[0]?.roomId ?? '';

  const ttForm = useForm<TimetableFormValues>({
    resolver: zodResolver(timetableFormSchema),
    mode: 'onBlur',
    defaultValues: {
      roomId: defaultRoomId,
      date: getTodayKolkata(),
      startTime: '10:00',
      endTime: '11:00',
      subject: '',
    },
  });

  const resForm = useForm<RestrictionFormValues>({
    resolver: zodResolver(restrictionFormSchema),
    mode: 'onBlur',
    defaultValues: {
      roomId: defaultRoomId,
      date: getTodayKolkata(),
      startTime: '13:00',
      endTime: '15:00',
      reason: '',
    },
  });

  useEffect(() => {
    if (!ttModalOpen) return;
    setTtError(null);
    if (editingEntry) {
      ttForm.reset({
        roomId: editingEntry.roomId,
        date: editingEntry.date,
        startTime: editingEntry.startTime,
        endTime: editingEntry.endTime,
        subject: editingEntry.subject,
      });
    } else {
      ttForm.reset({
        roomId: defaultRoomId,
        date: getTodayKolkata(),
        startTime: '10:00',
        endTime: '11:00',
        subject: '',
      });
    }
  }, [ttModalOpen, editingEntry, defaultRoomId, ttForm]);

  useEffect(() => {
    if (!resModalOpen) return;
    setResError(null);
    resForm.reset({
      roomId: defaultRoomId,
      date: getTodayKolkata(),
      startTime: '13:00',
      endTime: '15:00',
      reason: '',
    });
  }, [resModalOpen, defaultRoomId, resForm]);

  // Live overlap preview inside Timetable modal
  const watchedTt = ttForm.watch();
  const liveOverlaps: TimetableEntry[] =
    ttModalOpen &&
    data?.timetable &&
    watchedTt.roomId &&
    isValidDateString(watchedTt.date) &&
    isValidTimeRange(watchedTt.startTime, watchedTt.endTime)
      ? findOverlappingTimetableEntries(
          data.timetable,
          {
            roomId: watchedTt.roomId,
            date: watchedTt.date,
            startTime: watchedTt.startTime,
            endTime: watchedTt.endTime,
          },
          editingEntry?.scheduleId,
        )
      : [];

  const handleSaveTimetable = async (values: TimetableFormValues) => {
    setTtError(null);
    setStatusMessage(null);
    try {
      await classSpaceService.upsertTimetableEntry({
        scheduleId: editingEntry?.scheduleId,
        roomId: values.roomId,
        date: values.date,
        startTime: values.startTime,
        endTime: values.endTime,
        subject: values.subject,
      });
      setTtModalOpen(false);
      setStatusMessage(
        `${editingEntry ? 'Updated' : 'Added'} timetable entry "${values.subject}" (${values.date} ${values.startTime}–${values.endTime}).`,
      );
      await reload();
    } catch (err) {
      setTtError(err instanceof Error ? err.message : 'Unable to save timetable entry.');
    }
  };

  const handleDeleteTimetable = async () => {
    if (!deleteEntryTarget) return;
    setDeleting(true);
    try {
      await classSpaceService.deleteTimetableEntry(deleteEntryTarget.scheduleId);
      setStatusMessage(`Deleted timetable entry "${deleteEntryTarget.subject}".`);
      setDeleteEntryTarget(null);
      await reload();
    } finally {
      setDeleting(false);
    }
  };

  const handleSaveRestriction = async (values: RestrictionFormValues) => {
    setResError(null);
    setStatusMessage(null);
    try {
      await classSpaceService.createRestriction({
        roomId: values.roomId,
        date: values.date,
        startTime: values.startTime,
        endTime: values.endTime,
        reason: values.reason,
      });
      setResModalOpen(false);
      setStatusMessage(
        `Added room restriction (${values.date} ${values.startTime}–${values.endTime}): ${values.reason}.`,
      );
      await reload();
    } catch (err) {
      setResError(err instanceof Error ? err.message : 'Unable to add restriction.');
    }
  };

  const handleDeleteRestriction = async () => {
    if (!deleteResTarget) return;
    setDeleting(true);
    try {
      await classSpaceService.deleteRestriction(deleteResTarget.restrictionId);
      setStatusMessage(`Removed restriction "${deleteResTarget.reason}".`);
      setDeleteResTarget(null);
      await reload();
    } finally {
      setDeleting(false);
    }
  };

  const roomsById = new Map((data?.rooms ?? []).map((r) => [r.roomId, r]));

  return (
    <AdminRoleGate>
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Timetable &amp; Restrictions Management
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Manage demonstration timetable entries with automatic same-room overlap detection, plus
              maintenance or event restrictions.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setResModalOpen(true)}
            >
              <ShieldAlert className="h-4 w-4" aria-hidden="true" />
              Add Restriction
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={() => {
                setEditingEntry(null);
                setTtModalOpen(true);
              }}
            >
              <CalendarPlus className="h-4 w-4" aria-hidden="true" />
              Add Timetable Entry
            </Button>
          </div>
        </div>

        <DemoDisclosureBanner compact />

        {error && <ErrorBanner message={error} />}
        {statusMessage && (
          <div
            role="status"
            className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"
          >
            {statusMessage}
          </div>
        )}

        {loading || !data ? (
          <LoadingCardsSkeleton count={4} />
        ) : (
          <div className="space-y-6">
            {/* Timetable Entries Table */}
            <Card>
              <CardHeader>
                <h2 className="text-base font-semibold text-slate-900">
                  Timetable Entries ({data.timetable.length})
                </h2>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <caption className="visually-hidden">
                      Demonstration timetable entries
                    </caption>
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600 uppercase">
                        <th scope="col" className="px-5 py-3">
                          Room
                        </th>
                        <th scope="col" className="px-5 py-3">
                          Date
                        </th>
                        <th scope="col" className="px-5 py-3">
                          Time (IST)
                        </th>
                        <th scope="col" className="px-5 py-3">
                          Subject Label
                        </th>
                        <th scope="col" className="px-5 py-3">
                          Source
                        </th>
                        <th scope="col" className="px-5 py-3 text-right">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.timetable.map((entry) => {
                        const room = roomsById.get(entry.roomId);
                        return (
                          <tr key={entry.scheduleId} className="hover:bg-slate-50">
                            <td className="px-5 py-3 font-semibold text-slate-900">
                              {room ? `${room.blockId} / ${room.roomNumber}` : entry.roomId}
                            </td>
                            <td className="px-5 py-3 text-slate-700">{entry.date}</td>
                            <td className="px-5 py-3 font-medium whitespace-nowrap text-slate-800">
                              {entry.startTime}–{entry.endTime}
                            </td>
                            <td className="px-5 py-3 text-slate-700">{entry.subject}</td>
                            <td className="px-5 py-3">
                              <DataSourceBadge dataSource={entry.dataSource} />
                            </td>
                            <td className="px-5 py-3 text-right">
                              <div className="inline-flex items-center gap-2">
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => {
                                    setEditingEntry(entry);
                                    setTtModalOpen(true);
                                  }}
                                >
                                  <Edit2 className="h-3.5 w-3.5" aria-hidden="true" />
                                  Edit
                                </Button>
                                <Button
                                  type="button"
                                  variant="danger"
                                  size="sm"
                                  onClick={() => setDeleteEntryTarget(entry)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                                  Delete
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* Restrictions Table */}
            <Card>
              <CardHeader>
                <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
                  <ShieldAlert className="h-4 w-4 text-rose-700" aria-hidden="true" />
                  Room Restrictions ({data.restrictions.length})
                </h2>
              </CardHeader>
              <CardContent className="p-0">
                {data.restrictions.length === 0 ? (
                  <p className="p-5 text-sm text-slate-600">No active room restrictions.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <caption className="visually-hidden">
                        Administrator room restrictions
                      </caption>
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600 uppercase">
                          <th scope="col" className="px-5 py-3">
                            Room
                          </th>
                          <th scope="col" className="px-5 py-3">
                            Date
                          </th>
                          <th scope="col" className="px-5 py-3">
                            Time (IST)
                          </th>
                          <th scope="col" className="px-5 py-3">
                            Reason
                          </th>
                          <th scope="col" className="px-5 py-3 text-right">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {data.restrictions.map((res) => {
                          const room = roomsById.get(res.roomId);
                          return (
                            <tr key={res.restrictionId} className="hover:bg-slate-50">
                              <td className="px-5 py-3 font-semibold text-slate-900">
                                {room ? `${room.blockId} / ${room.roomNumber}` : res.roomId}
                              </td>
                              <td className="px-5 py-3 text-slate-700">{res.date}</td>
                              <td className="px-5 py-3 font-medium whitespace-nowrap text-slate-800">
                                {res.startTime}–{res.endTime}
                              </td>
                              <td className="px-5 py-3 text-slate-700">{res.reason}</td>
                              <td className="px-5 py-3 text-right">
                                <Button
                                  type="button"
                                  variant="danger"
                                  size="sm"
                                  onClick={() => setDeleteResTarget(res)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                                  Remove
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* Timetable Modal */}
        <Dialog
          open={ttModalOpen}
          onClose={() => setTtModalOpen(false)}
          title={editingEntry ? 'Edit Timetable Entry' : 'Add Timetable Entry'}
          description="Overlapping entries on the same classroom and date are automatically detected and blocked."
        >
          <form onSubmit={ttForm.handleSubmit(handleSaveTimetable)} noValidate className="space-y-4">
            {ttError && <ErrorBanner message={ttError} onDismiss={() => setTtError(null)} />}

            {liveOverlaps.length > 0 && (
              <div
                role="alert"
                className="flex items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
                <div>
                  <p className="font-semibold">Overlap Detected:</p>
                  <p>
                    Conflicts with{' '}
                    {liveOverlaps.map((o) => `${o.subject} (${o.startTime}–${o.endTime})`).join(', ')}.
                  </p>
                </div>
              </div>
            )}

            <div>
              <label htmlFor="tt-room" className="block text-sm font-medium text-slate-800">
                Classroom
              </label>
              <select
                id="tt-room"
                className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                {...ttForm.register('roomId')}
              >
                {(data?.rooms ?? []).map((room) => (
                  <option key={room.roomId} value={room.roomId}>
                    {room.blockId} / {room.roomNumber} (Floor {room.floor}, {room.capacity} seats)
                  </option>
                ))}
              </select>
              {ttForm.formState.errors.roomId && (
                <p className="mt-1 text-xs font-medium text-rose-700">
                  {ttForm.formState.errors.roomId.message}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="tt-date" className="block text-sm font-medium text-slate-800">
                Date (Asia/Kolkata)
              </label>
              <input
                id="tt-date"
                type="date"
                className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                {...ttForm.register('date')}
              />
              {ttForm.formState.errors.date && (
                <p className="mt-1 text-xs font-medium text-rose-700">
                  {ttForm.formState.errors.date.message}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="tt-start" className="block text-sm font-medium text-slate-800">
                  Start Time
                </label>
                <input
                  id="tt-start"
                  type="time"
                  className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  {...ttForm.register('startTime')}
                />
                {ttForm.formState.errors.startTime && (
                  <p className="mt-1 text-xs font-medium text-rose-700">
                    {ttForm.formState.errors.startTime.message}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="tt-end" className="block text-sm font-medium text-slate-800">
                  End Time
                </label>
                <input
                  id="tt-end"
                  type="time"
                  className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  {...ttForm.register('endTime')}
                />
                {ttForm.formState.errors.endTime && (
                  <p className="mt-1 text-xs font-medium text-rose-700">
                    {ttForm.formState.errors.endTime.message}
                  </p>
                )}
              </div>
            </div>

            <div>
              <label htmlFor="tt-subject" className="block text-sm font-medium text-slate-800">
                Subject Label (Fictional Demo Label)
              </label>
              <input
                id="tt-subject"
                type="text"
                placeholder="e.g., Computer Networks (Demo)"
                className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                {...ttForm.register('subject')}
              />
              {ttForm.formState.errors.subject && (
                <p className="mt-1 text-xs font-medium text-rose-700">
                  {ttForm.formState.errors.subject.message}
                </p>
              )}
            </div>

            <div className="flex flex-wrap justify-end gap-3 pt-2">
              <Button type="button" variant="secondary" onClick={() => setTtModalOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                loading={ttForm.formState.isSubmitting}
              >
                {editingEntry ? 'Update Entry' : 'Add Entry'}
              </Button>
            </div>
          </form>
        </Dialog>

        {/* Restriction Modal */}
        <Dialog
          open={resModalOpen}
          onClose={() => setResModalOpen(false)}
          title="Add Room Restriction"
          description="Marks a classroom as unavailable during the selected interval."
        >
          <form onSubmit={resForm.handleSubmit(handleSaveRestriction)} noValidate className="space-y-4">
            {resError && <ErrorBanner message={resError} onDismiss={() => setResError(null)} />}

            <div>
              <label htmlFor="res-room" className="block text-sm font-medium text-slate-800">
                Classroom
              </label>
              <select
                id="res-room"
                className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                {...resForm.register('roomId')}
              >
                {(data?.rooms ?? []).map((room) => (
                  <option key={room.roomId} value={room.roomId}>
                    {room.blockId} / {room.roomNumber}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="res-date" className="block text-sm font-medium text-slate-800">
                Date (Asia/Kolkata)
              </label>
              <input
                id="res-date"
                type="date"
                className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                {...resForm.register('date')}
              />
              {resForm.formState.errors.date && (
                <p className="mt-1 text-xs font-medium text-rose-700">
                  {resForm.formState.errors.date.message}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="res-start" className="block text-sm font-medium text-slate-800">
                  Start Time
                </label>
                <input
                  id="res-start"
                  type="time"
                  className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  {...resForm.register('startTime')}
                />
                {resForm.formState.errors.startTime && (
                  <p className="mt-1 text-xs font-medium text-rose-700">
                    {resForm.formState.errors.startTime.message}
                  </p>
                )}
              </div>
              <div>
                <label htmlFor="res-end" className="block text-sm font-medium text-slate-800">
                  End Time
                </label>
                <input
                  id="res-end"
                  type="time"
                  className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  {...resForm.register('endTime')}
                />
                {resForm.formState.errors.endTime && (
                  <p className="mt-1 text-xs font-medium text-rose-700">
                    {resForm.formState.errors.endTime.message}
                  </p>
                )}
              </div>
            </div>

            <div>
              <label htmlFor="res-reason" className="block text-sm font-medium text-slate-800">
                Restriction Reason
              </label>
              <input
                id="res-reason"
                type="text"
                placeholder="e.g., Lab equipment calibration (DEMO)"
                className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                {...resForm.register('reason')}
              />
              {resForm.formState.errors.reason && (
                <p className="mt-1 text-xs font-medium text-rose-700">
                  {resForm.formState.errors.reason.message}
                </p>
              )}
            </div>

            <div className="flex flex-wrap justify-end gap-3 pt-2">
              <Button type="button" variant="secondary" onClick={() => setResModalOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                loading={resForm.formState.isSubmitting}
              >
                Save Restriction
              </Button>
            </div>
          </form>
        </Dialog>

        <ConfirmDialog
          open={Boolean(deleteEntryTarget)}
          onClose={() => setDeleteEntryTarget(null)}
          onConfirm={handleDeleteTimetable}
          title="Delete timetable entry?"
          message={
            deleteEntryTarget
              ? `Remove "${deleteEntryTarget.subject}" (${deleteEntryTarget.date} ${deleteEntryTarget.startTime}–${deleteEntryTarget.endTime}) from the timetable?`
              : ''
          }
          confirmLabel="Delete Entry"
          variant="danger"
          loading={deleting}
        />

        <ConfirmDialog
          open={Boolean(deleteResTarget)}
          onClose={() => setDeleteResTarget(null)}
          onConfirm={handleDeleteRestriction}
          title="Remove room restriction?"
          message={
            deleteResTarget
              ? `Remove restriction "${deleteResTarget.reason}" (${deleteResTarget.date} ${deleteResTarget.startTime}–${deleteResTarget.endTime})?`
              : ''
          }
          confirmLabel="Remove Restriction"
          variant="danger"
          loading={deleting}
        />
      </div>
    </AdminRoleGate>
  );
}
