import { AlertCircle, Cloud, FlaskConical, Info, SearchX } from 'lucide-react';
import { useContext, type ReactNode } from 'react';
import { AppModeContext } from '../../hooks/useAppMode';

export function DemoDisclosureBanner({ compact = false }: { compact?: boolean }) {
  const appMode = useContext(AppModeContext);
  if (appMode?.mode === 'LIVE') {
    return (
      <div
        className={`flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-950 ${
          compact ? 'px-3.5 py-2.5 text-xs' : 'p-4 text-sm'
        }`}
      >
        <Cloud className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" aria-hidden="true" />
        <p className="leading-relaxed">
          <strong className="font-semibold">Live AWS Mode:</strong> Requests authenticate with
          Amazon Cognito PKCE and persist atomically to Amazon DynamoDB via AWS Lambda. Schedule
          entries reflect admin-entered data only; physical occupancy is not monitored.
        </p>
      </div>
    );
  }

  return (
    <div
      className={`flex items-start gap-3 rounded-xl border border-violet-200 bg-violet-50 text-violet-950 ${
        compact ? 'px-3.5 py-2.5 text-xs' : 'p-4 text-sm'
      }`}
    >
      <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-violet-700" aria-hidden="true" />
      <p className="leading-relaxed">
        <strong className="font-semibold">Demonstration Mode (Phase 1):</strong> All classrooms,
        timetables, bookings, and restrictions shown are fictional <strong>DEMO</strong> records.
        Actual institutional timetable feeds are not yet connected. Changes persist locally in this
        browser only.
      </p>
    </div>
  );
}

export function PhysicalOccupancyBanner() {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-700" aria-hidden="true" />
      <p className="leading-relaxed">
        <strong className="font-semibold">Schedule-Vacant ≠ Physically Verified:</strong> ClassSpace
        evaluates scheduled timetables, approved bookings, and administrator restrictions. It does{' '}
        <strong>not</strong> detect real-time physical occupancy (e.g., ad-hoc study groups or
        unscheduled faculty sessions).
      </p>
    </div>
  );
}

export function ErrorBanner({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss?: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex items-start justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"
    >
      <div className="flex items-start gap-2.5">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-700" aria-hidden="true" />
        <span>{message}</span>
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="text-xs font-semibold text-rose-800 underline hover:text-rose-950"
        >
          Dismiss
        </button>
      )}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-600">
        <SearchX className="h-6 w-6" aria-hidden="true" />
      </div>
      <h2 className="mt-4 text-base font-semibold text-slate-900">{title}</h2>
      <p className="mt-1.5 max-w-md text-sm text-slate-600">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function LoadingCardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading results" className="grid gap-4 md:grid-cols-2">
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={idx}
          className="animate-pulse rounded-xl border border-slate-200 bg-white p-5"
        >
          <div className="flex items-center justify-between">
            <div className="h-5 w-36 rounded bg-slate-200" />
            <div className="h-5 w-24 rounded-full bg-slate-200" />
          </div>
          <div className="mt-3 h-4 w-48 rounded bg-slate-100" />
          <div className="mt-4 flex gap-2">
            <div className="h-6 w-20 rounded bg-slate-100" />
            <div className="h-6 w-24 rounded bg-slate-100" />
          </div>
          <div className="mt-5 h-10 w-full rounded bg-slate-100" />
        </div>
      ))}
    </div>
  );
}
