import type { ReactNode } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useDemoRole } from '../../hooks/useDemoRole';
import { Button } from '../ui/Button';

export function AdminRoleGate({ children }: { children: ReactNode }) {
  const { role, setRole } = useDemoRole();

  if (role !== 'ADMIN_DEMO') {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-amber-950">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-6 w-6 shrink-0 text-amber-700" aria-hidden="true" />
            <div>
              <h1 className="text-lg font-bold text-slate-900">
                Admin Demo Role Required
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-slate-700">
                You are currently browsing in <strong>Student Demo</strong> mode. Switch to the{' '}
                <strong>Admin Demo</strong> role to manage rooms, timetables, restrictions, and
                booking approvals.
              </p>
              <p className="mt-2 text-xs text-slate-600">
                Security note: In Phase 1 Demo Mode, role switching is a client-side simulation
                only. In Phase 2, administrator authorization will be enforced on the backend via
                Amazon Cognito groups and API Gateway authorizers.
              </p>
              <div className="mt-4">
                <Button type="button" variant="primary" onClick={() => setRole('ADMIN_DEMO')}>
                  Switch to Admin Demo
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
