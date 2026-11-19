import { useState } from 'react';
import { Link } from 'react-router-dom';
import { RotateCcw } from 'lucide-react';
import { Logo } from './Logo';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { classSpaceService } from '../../services';

export function Footer({ onDemoReset }: { onDemoReset?: () => void }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [resetting, setResetting] = useState(false);

  const handleReset = async () => {
    setResetting(true);
    try {
      await classSpaceService.resetDemoData();
      setConfirmOpen(false);
      if (onDemoReset) {
        onDemoReset();
      } else {
        window.location.reload();
      }
    } finally {
      setResetting(false);
    }
  };

  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid gap-8 md:grid-cols-3">
          <div>
            <Logo size="sm" />
            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              Phase 1 demonstration platform for discovering schedule-vacant campus classrooms
              during free periods. Built with Asia/Kolkata campus time semantics.
            </p>
          </div>

          <div>
            <h2 className="text-xs font-semibold tracking-wider text-slate-900 uppercase">
              Platform Views
            </h2>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              <li>
                <Link to="/" className="hover:text-indigo-700 hover:underline">
                  Overview &amp; Disclosure
                </Link>
              </li>
              <li>
                <Link to="/student" className="hover:text-indigo-700 hover:underline">
                  Student Classroom Search
                </Link>
              </li>
              <li>
                <Link to="/bookings" className="hover:text-indigo-700 hover:underline">
                  My Bookings (Demo)
                </Link>
              </li>
              <li>
                <Link to="/admin" className="hover:text-indigo-700 hover:underline">
                  Admin Dashboard
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h2 className="text-xs font-semibold tracking-wider text-slate-900 uppercase">
              Demo Environment Controls
            </h2>
            <p className="mt-3 text-xs leading-relaxed text-slate-600">
              All data is fictional demonstration data persisted locally in your browser. Not
              connected to verified institutional systems or real-time room sensors.
            </p>
            <div className="mt-3">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setConfirmOpen(true)}
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                Reset Demo Data
              </Button>
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-col items-start justify-between gap-2 border-t border-slate-100 pt-6 text-xs text-slate-500 sm:flex-row sm:items-center">
          <p>ClassSpace Phase 1 Foundation — Demonstration Build (Single Block Scope)</p>
          <p>Campus Timezone: Asia/Kolkata (IST)</p>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleReset}
        title="Reset local demo repository?"
        message="This restores all rooms, timetables, booking requests, and restrictions back to the original Phase 1 demonstration seed data."
        confirmLabel="Reset Demo Data"
        variant="danger"
        loading={resetting}
      />
    </footer>
  );
}
