import {
  AlertTriangle,
  Ban,
  CalendarClock,
  CheckCircle2,
  Clock,
  FlaskConical,
  ShieldAlert,
  Users,
  XCircle,
} from 'lucide-react';
import type { AvailabilityStatus, BookingStatus, DataSource } from '../../types/domain';

export function DataSourceBadge({ dataSource }: { dataSource: DataSource }) {
  const labelMap: Record<DataSource, string> = {
    DEMO: 'DEMO DATA',
    ADMIN_ENTERED: 'ADMIN ENTERED',
    VERIFIED_INSTITUTIONAL: 'VERIFIED INSTITUTIONAL',
  };

  const styleMap: Record<DataSource, string> = {
    DEMO: 'bg-violet-50 text-violet-800 border-violet-200',
    ADMIN_ENTERED: 'bg-slate-100 text-slate-800 border-slate-300',
    VERIFIED_INSTITUTIONAL: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  };

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold tracking-wide ${styleMap[dataSource]}`}
    >
      <FlaskConical className="h-3 w-3 shrink-0" aria-hidden="true" />
      {labelMap[dataSource]}
    </span>
  );
}

export function AvailabilityBadge({ status }: { status: AvailabilityStatus }) {
  switch (status) {
    case 'SCHEDULE_VACANT':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Schedule-Vacant
        </span>
      );
    case 'OCCUPIED_TIMETABLE':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-900">
          <CalendarClock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Scheduled Class
        </span>
      );
    case 'OCCUPIED_BOOKING':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-xs font-semibold text-sky-900">
          <Users className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Approved Booking
        </span>
      );
    case 'RESTRICTED':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-800">
          <ShieldAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Restricted
        </span>
      );
    case 'INACTIVE':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
          <Ban className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Inactive
        </span>
      );
    case 'INSUFFICIENT_CAPACITY':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-200 bg-orange-50 px-2.5 py-0.5 text-xs font-semibold text-orange-900">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Below Capacity
        </span>
      );
  }
}

export function BookingStatusBadge({ status }: { status: BookingStatus }) {
  switch (status) {
    case 'PENDING':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-900">
          <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Pending
        </span>
      );
    case 'APPROVED':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Approved
        </span>
      );
    case 'REJECTED':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-800">
          <XCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Rejected
        </span>
      );
    case 'CANCELLED':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
          <Ban className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Cancelled
        </span>
      );
  }
}
