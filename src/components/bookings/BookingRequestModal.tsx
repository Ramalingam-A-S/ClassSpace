import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { bookingFormSchema, type BookingFormValues } from '../../utils/validation';
import type { Room } from '../../types/domain';
import { classSpaceService } from '../../services';
import { useDemoRole } from '../../hooks/useDemoRole';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { ErrorBanner } from '../ui/StateBanner';

interface BookingRequestModalProps {
  open: boolean;
  onClose: () => void;
  room: Room;
  defaultDate: string;
  defaultStartTime: string;
  defaultEndTime: string;
  onSuccess: () => void;
}

export function BookingRequestModal({
  open,
  onClose,
  room,
  defaultDate,
  defaultStartTime,
  defaultEndTime,
  onSuccess,
}: BookingRequestModalProps) {
  const { identity } = useDemoRole();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<BookingFormValues>({
    resolver: zodResolver(bookingFormSchema),
    mode: 'onBlur',
    defaultValues: {
      roomId: room.roomId,
      date: defaultDate,
      startTime: defaultStartTime,
      endTime: defaultEndTime,
      purpose: '',
    },
  });

  useEffect(() => {
    if (open) {
      setSubmitError(null);
      reset({
        roomId: room.roomId,
        date: defaultDate,
        startTime: defaultStartTime,
        endTime: defaultEndTime,
        purpose: '',
      });
    }
  }, [open, room.roomId, defaultDate, defaultStartTime, defaultEndTime, reset]);

  const onSubmit = async (values: BookingFormValues) => {
    setSubmitError(null);
    try {
      await classSpaceService.createBooking({
        roomId: room.roomId,
        studentId: identity.userId,
        studentName: identity.displayName,
        purpose: values.purpose,
        date: values.date,
        startTime: values.startTime,
        endTime: values.endTime,
      });
      onSuccess();
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to submit booking request.');
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Request Demo Use — ${room.blockId} / ${room.roomNumber}`}
      description="Submitted requests enter PENDING status and require administrator approval in Demo Mode."
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <input type="hidden" {...register('roomId')} />

        {submitError && <ErrorBanner message={submitError} onDismiss={() => setSubmitError(null)} />}

        <div>
          <label htmlFor="booking-date" className="block text-sm font-medium text-slate-800">
            Date (Asia/Kolkata)
          </label>
          <input
            id="booking-date"
            type="date"
            aria-invalid={errors.date ? 'true' : undefined}
            aria-describedby={errors.date ? 'booking-date-err' : undefined}
            className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
            {...register('date')}
          />
          {errors.date && (
            <p id="booking-date-err" className="mt-1 text-xs font-medium text-rose-700">
              {errors.date.message}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="booking-start" className="block text-sm font-medium text-slate-800">
              Start Time
            </label>
            <input
              id="booking-start"
              type="time"
              aria-invalid={errors.startTime ? 'true' : undefined}
              aria-describedby={errors.startTime ? 'booking-start-err' : undefined}
              className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
              {...register('startTime')}
            />
            {errors.startTime && (
              <p id="booking-start-err" className="mt-1 text-xs font-medium text-rose-700">
                {errors.startTime.message}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="booking-end" className="block text-sm font-medium text-slate-800">
              End Time
            </label>
            <input
              id="booking-end"
              type="time"
              aria-invalid={errors.endTime ? 'true' : undefined}
              aria-describedby={errors.endTime ? 'booking-end-err' : undefined}
              className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
              {...register('endTime')}
            />
            {errors.endTime && (
              <p id="booking-end-err" className="mt-1 text-xs font-medium text-rose-700">
                {errors.endTime.message}
              </p>
            )}
          </div>
        </div>

        <div>
          <label htmlFor="booking-purpose" className="block text-sm font-medium text-slate-800">
            Activity / Study Purpose
          </label>
          <p id="booking-purpose-hint" className="mt-0.5 text-xs text-slate-500">
            Example: Peer algorithms study group (4 students).
          </p>
          <textarea
            id="booking-purpose"
            rows={3}
            aria-invalid={errors.purpose ? 'true' : undefined}
            aria-describedby={
              errors.purpose ? 'booking-purpose-hint booking-purpose-err' : 'booking-purpose-hint'
            }
            className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
            {...register('purpose')}
          />
          {errors.purpose && (
            <p id="booking-purpose-err" className="mt-1 text-xs font-medium text-rose-700">
              {errors.purpose.message}
            </p>
          )}
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
          Requesting as <strong>{identity.displayName}</strong>. Pending requests do not reserve the
          room until approved by an administrator.
        </div>

        <div className="flex flex-wrap justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={isSubmitting}>
            Submit Demo Request
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
