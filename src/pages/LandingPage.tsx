import { Link } from 'react-router-dom';
import {
  ArrowRight,
  CalendarCheck2,
  CheckCircle2,
  Clock,
  EyeOff,
  Search,
  ShieldAlert,
  Users,
} from 'lucide-react';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { Card, CardContent } from '../components/ui/Card';
import { DemoDisclosureBanner } from '../components/ui/StateBanner';

export function LandingPage() {
  useDocumentTitle('Campus Classroom Availability Discovery');

  return (
    <div>
      {/* Hero Section */}
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
          <div className="max-w-3xl">
            <span className="inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-800">
              Phase 1 Foundation • Single Academic Block Demo
            </span>
            <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
              Discover schedule-vacant classrooms during your free periods.
            </h1>
            <p className="mt-4 text-lg leading-relaxed text-slate-600">
              Students often waste free periods walking floor-to-floor looking for an unused room
              for quiet study or team collaboration. ClassSpace surfaces rooms that have no
              scheduled class, approved booking, or maintenance restriction for your exact time
              window.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link
                to="/student"
                className="inline-flex min-h-12 items-center gap-2 rounded-lg bg-indigo-700 px-6 py-3 text-base font-semibold text-white shadow-xs hover:bg-indigo-800"
              >
                <Search className="h-5 w-5" aria-hidden="true" />
                Find a Classroom
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link
                to="/admin"
                className="inline-flex min-h-12 items-center gap-2 rounded-lg border border-slate-300 bg-white px-5 py-3 text-base font-semibold text-slate-800 hover:bg-slate-50"
              >
                Explore Admin Demo
              </Link>
            </div>
          </div>

          <div className="mt-10">
            <DemoDisclosureBanner />
          </div>
        </div>
      </section>

      {/* Four Critical Status Distinctions */}
      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">
            Clear distinction between schedule status and physical occupancy
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            ClassSpace intentionally separates four room states and never claims real-time physical
            occupancy detection.
          </p>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="space-y-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
              </div>
              <h3 className="text-base font-semibold text-slate-900">1. Schedule-Vacant</h3>
              <p className="text-sm leading-relaxed text-slate-600">
                No timetable entry, approved student booking, or restriction overlaps the requested
                interval.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-50 text-sky-700">
                <Users className="h-5 w-5" aria-hidden="true" />
              </div>
              <h3 className="text-base font-semibold text-slate-900">2. Approved Booking</h3>
              <p className="text-sm leading-relaxed text-slate-600">
                An administrator-approved student request blocks the requested slot. Pending
                requests do not block availability.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-rose-50 text-rose-700">
                <ShieldAlert className="h-5 w-5" aria-hidden="true" />
              </div>
              <h3 className="text-base font-semibold text-slate-900">3. Restricted</h3>
              <p className="text-sm leading-relaxed text-slate-600">
                An administrator has marked the room unavailable for maintenance, exams, or
                departmental events.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                <EyeOff className="h-5 w-5" aria-hidden="true" />
              </div>
              <h3 className="text-base font-semibold text-slate-900">4. Unknown Physical State</h3>
              <p className="text-sm leading-relaxed text-slate-600">
                The platform cannot verify whether someone is physically inside a schedule-vacant
                room without sensors.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* How It Works */}
      <section className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">How ClassSpace works</h2>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            <div className="rounded-xl border border-slate-200 p-5">
              <div className="flex items-center gap-2 text-sm font-bold text-indigo-700">
                <Clock className="h-4 w-4" aria-hidden="true" />
                Step 1: Set your free window
              </div>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                Choose the date, start time, end time (in Asia/Kolkata IST), minimum seat capacity,
                floor, and required facilities.
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 p-5">
              <div className="flex items-center gap-2 text-sm font-bold text-indigo-700">
                <Search className="h-4 w-4" aria-hidden="true" />
                Step 2: Inspect room schedules
              </div>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                View schedule-vacant rooms with full daily timetable slots, approved bookings, and
                any active restrictions before walking over.
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 p-5">
              <div className="flex items-center gap-2 text-sm font-bold text-indigo-700">
                <CalendarCheck2 className="h-4 w-4" aria-hidden="true" />
                Step 3: Submit a demo request
              </div>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                Submit a booking request in Demo Mode and switch to the Admin Demo role to test
                approval, rejection, and timetable conflict checks.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
