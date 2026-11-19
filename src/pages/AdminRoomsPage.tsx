import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Edit2, Plus, Power } from 'lucide-react';
import { AVAILABLE_FACILITIES, type Facility, type Room } from '../types/domain';
import { useAsyncData } from '../hooks/useAsyncData';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { classSpaceService } from '../services';
import { roomFormSchema, type RoomFormValues } from '../utils/validation';
import { AdminRoleGate } from '../components/layout/AdminRoleGate';
import { DataSourceBadge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, CardContent } from '../components/ui/Card';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Dialog } from '../components/ui/Dialog';
import {
  DemoDisclosureBanner,
  ErrorBanner,
  LoadingCardsSkeleton,
} from '../components/ui/StateBanner';

export function AdminRoomsPage() {
  useDocumentTitle('Room Management');

  const { data: rooms, loading, error, reload } = useAsyncData(
    () => classSpaceService.listRooms(),
    [],
  );

  const [modalOpen, setModalOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [toggleTarget, setToggleTarget] = useState<Room | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [toggling, setToggling] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<RoomFormValues>({
    resolver: zodResolver(roomFormSchema),
    mode: 'onBlur',
    defaultValues: {
      blockId: 'BLOCK-A',
      floor: 1,
      roomNumber: '',
      capacity: 40,
      facilities: ['Projector', 'Whiteboard'],
      active: true,
    },
  });

  const selectedFacilities = watch('facilities') ?? [];

  useEffect(() => {
    if (!modalOpen) return;
    setFormError(null);
    if (editingRoom) {
      reset({
        blockId: editingRoom.blockId,
        floor: editingRoom.floor,
        roomNumber: editingRoom.roomNumber,
        capacity: editingRoom.capacity,
        facilities: editingRoom.facilities,
        active: editingRoom.active,
      });
    } else {
      reset({
        blockId: 'BLOCK-A',
        floor: 1,
        roomNumber: '',
        capacity: 40,
        facilities: ['Projector', 'Whiteboard'],
        active: true,
      });
    }
  }, [modalOpen, editingRoom, reset]);

  const openCreateModal = () => {
    setEditingRoom(null);
    setModalOpen(true);
  };

  const openEditModal = (room: Room) => {
    setEditingRoom(room);
    setModalOpen(true);
  };

  const toggleFacilityValue = (facility: Facility) => {
    const next = selectedFacilities.includes(facility)
      ? selectedFacilities.filter((f) => f !== facility)
      : [...selectedFacilities, facility];
    setValue('facilities', next, { shouldValidate: true });
  };

  const onSubmit = async (values: RoomFormValues) => {
    setFormError(null);
    setStatusMessage(null);
    try {
      if (editingRoom) {
        const updated = await classSpaceService.updateRoom(editingRoom.roomId, {
          blockId: values.blockId,
          floor: values.floor,
          roomNumber: values.roomNumber,
          capacity: values.capacity,
          facilities: values.facilities as Facility[],
          active: values.active,
        });
        setStatusMessage(`Updated classroom ${updated.blockId} / ${updated.roomNumber}.`);
      } else {
        const created = await classSpaceService.createRoom({
          blockId: values.blockId,
          floor: values.floor,
          roomNumber: values.roomNumber,
          capacity: values.capacity,
          facilities: values.facilities as Facility[],
          active: values.active,
        });
        setStatusMessage(`Added new classroom ${created.blockId} / ${created.roomNumber}.`);
      }
      setModalOpen(false);
      await reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to save classroom.');
    }
  };

  const handleToggleActive = async (room: Room) => {
    if (room.active) {
      setToggleTarget(room);
      return;
    }
    await executeToggleActive(room);
  };

  const executeToggleActive = async (room: Room) => {
    setToggling(true);
    setStatusMessage(null);
    try {
      const updated = await classSpaceService.updateRoom(room.roomId, { active: !room.active });
      setStatusMessage(
        `${updated.blockId} / ${updated.roomNumber} is now ${
          updated.active ? 'Active' : 'Inactive'
        }.`,
      );
      setToggleTarget(null);
      await reload();
    } finally {
      setToggling(false);
    }
  };

  return (
    <AdminRoleGate>
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Room Management</h1>
            <p className="mt-1 text-sm text-slate-600">
              Add, edit, activate, or deactivate demonstration classrooms in Block A.
            </p>
          </div>
          <Button type="button" variant="primary" onClick={openCreateModal}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add Classroom
          </Button>
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

        {loading || !rooms ? (
          <LoadingCardsSkeleton count={4} />
        ) : (
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <caption className="visually-hidden">
                    Campus demonstration classrooms
                  </caption>
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600 uppercase">
                      <th scope="col" className="px-5 py-3">
                        Room
                      </th>
                      <th scope="col" className="px-5 py-3">
                        Floor
                      </th>
                      <th scope="col" className="px-5 py-3">
                        Capacity
                      </th>
                      <th scope="col" className="px-5 py-3">
                        Facilities
                      </th>
                      <th scope="col" className="px-5 py-3">
                        Status
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
                    {rooms.map((room) => (
                      <tr key={room.roomId} className="hover:bg-slate-50">
                        <td className="px-5 py-3.5 font-bold text-slate-900">
                          {room.blockId} / {room.roomNumber}
                        </td>
                        <td className="px-5 py-3.5 text-slate-700">Floor {room.floor}</td>
                        <td className="px-5 py-3.5 text-slate-700">{room.capacity} seats</td>
                        <td className="px-5 py-3.5">
                          <div className="flex max-w-xs flex-wrap gap-1">
                            {room.facilities.map((fac) => (
                              <span
                                key={fac}
                                className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700"
                              >
                                {fac}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-5 py-3.5">
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                              room.active
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                                : 'border-slate-300 bg-slate-100 text-slate-700'
                            }`}
                          >
                            {room.active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          <DataSourceBadge dataSource={room.dataSource} />
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <div className="inline-flex items-center gap-2">
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() => openEditModal(room)}
                              aria-label={`Edit ${room.blockId} ${room.roomNumber}`}
                            >
                              <Edit2 className="h-3.5 w-3.5" aria-hidden="true" />
                              Edit
                            </Button>
                            <Button
                              type="button"
                              variant={room.active ? 'danger' : 'primary'}
                              size="sm"
                              onClick={() => handleToggleActive(room)}
                              aria-label={`${room.active ? 'Deactivate' : 'Activate'} ${
                                room.blockId
                              } ${room.roomNumber}`}
                            >
                              <Power className="h-3.5 w-3.5" aria-hidden="true" />
                              {room.active ? 'Deactivate' : 'Activate'}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Add / Edit Room Modal */}
        <Dialog
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          title={editingRoom ? `Edit ${editingRoom.blockId} / ${editingRoom.roomNumber}` : 'Add Demo Classroom'}
          description="All rooms added in Phase 1 are tagged as DEMO records."
        >
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
            {formError && <ErrorBanner message={formError} onDismiss={() => setFormError(null)} />}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="room-block" className="block text-sm font-medium text-slate-800">
                  Block ID
                </label>
                <input
                  id="room-block"
                  type="text"
                  aria-invalid={errors.blockId ? 'true' : undefined}
                  aria-describedby={errors.blockId ? 'room-block-err' : undefined}
                  className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm uppercase"
                  {...register('blockId')}
                />
                {errors.blockId && (
                  <p id="room-block-err" className="mt-1 text-xs font-medium text-rose-700">
                    {errors.blockId.message}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="room-number" className="block text-sm font-medium text-slate-800">
                  Room Number
                </label>
                <input
                  id="room-number"
                  type="text"
                  placeholder="e.g., ECE-205"
                  aria-invalid={errors.roomNumber ? 'true' : undefined}
                  aria-describedby={errors.roomNumber ? 'room-number-err' : undefined}
                  className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm uppercase"
                  {...register('roomNumber')}
                />
                {errors.roomNumber && (
                  <p id="room-number-err" className="mt-1 text-xs font-medium text-rose-700">
                    {errors.roomNumber.message}
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="room-floor" className="block text-sm font-medium text-slate-800">
                  Floor
                </label>
                <input
                  id="room-floor"
                  type="number"
                  min={0}
                  max={20}
                  aria-invalid={errors.floor ? 'true' : undefined}
                  aria-describedby={errors.floor ? 'room-floor-err' : undefined}
                  className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  {...register('floor', { valueAsNumber: true })}
                />
                {errors.floor && (
                  <p id="room-floor-err" className="mt-1 text-xs font-medium text-rose-700">
                    {errors.floor.message}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="room-capacity" className="block text-sm font-medium text-slate-800">
                  Seating Capacity
                </label>
                <input
                  id="room-capacity"
                  type="number"
                  min={1}
                  max={500}
                  aria-invalid={errors.capacity ? 'true' : undefined}
                  aria-describedby={errors.capacity ? 'room-capacity-err' : undefined}
                  className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  {...register('capacity', { valueAsNumber: true })}
                />
                {errors.capacity && (
                  <p id="room-capacity-err" className="mt-1 text-xs font-medium text-rose-700">
                    {errors.capacity.message}
                  </p>
                )}
              </div>
            </div>

            <fieldset>
              <legend className="text-sm font-medium text-slate-800">Facilities</legend>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {AVAILABLE_FACILITIES.map((facility) => {
                  const checked = selectedFacilities.includes(facility);
                  const id = `modal-fac-${facility.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
                  return (
                    <label
                      key={facility}
                      htmlFor={id}
                      className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50"
                    >
                      <input
                        id={id}
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleFacilityValue(facility)}
                        className="h-4 w-4 accent-indigo-700"
                      />
                      {facility}
                    </label>
                  );
                })}
              </div>
              {errors.facilities && (
                <p className="mt-1 text-xs font-medium text-rose-700">
                  {errors.facilities.message}
                </p>
              )}
            </fieldset>

            <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm font-medium text-slate-800">
              <input
                type="checkbox"
                className="h-4 w-4 accent-indigo-700"
                {...register('active')}
              />
              Room is active and discoverable for student availability search
            </label>

            <div className="flex flex-wrap justify-end gap-3 pt-2">
              <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={isSubmitting}>
                {editingRoom ? 'Save Changes' : 'Create Room'}
              </Button>
            </div>
          </form>
        </Dialog>

        <ConfirmDialog
          open={Boolean(toggleTarget)}
          onClose={() => setToggleTarget(null)}
          onConfirm={() => {
            if (toggleTarget) void executeToggleActive(toggleTarget);
          }}
          title="Deactivate classroom?"
          message={
            toggleTarget
              ? `Deactivating ${toggleTarget.blockId} / ${toggleTarget.roomNumber} removes it from schedule-vacant results and prevents new student requests until reactivated.`
              : ''
          }
          confirmLabel="Deactivate Room"
          variant="danger"
          loading={toggling}
        />
      </div>
    </AdminRoleGate>
  );
}
