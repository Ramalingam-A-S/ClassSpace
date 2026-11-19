import { useContext, type ReactNode } from 'react';
import { LogIn, ShieldCheck } from 'lucide-react';
import { AppModeContext } from '../../hooks/useAppMode';
import { useDemoRole } from '../../hooks/useDemoRole';
import { Button } from '../ui/Button';

export function AdminRoleGate({ children }: { children: ReactNode }) {
  const appMode = useContext(AppModeContext);
  const { role, setRole } = useDemoRole();

  if (appMode?.mode === 'LIVE') {
    if (!appMode.session) {
      return (
        <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-6 text-indigo-950">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-6 w-6 shrink-0 text-indigo-700" aria-hidden="true" />
              <div>
                <h1 className="text-lg font-bold text-slate-900">Cognito Sign-In Required</h1>
                <p className="mt-2 text-sm leading-relaxed text-slate-700">
                  Live AWS Mode requires an authenticated Amazon Cognito session with{' '}
                  <code>admin</code> group membership to access administrator endpoints.
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  {appMode.liveConfigured ? (
                    <Button
                      type="button"
                      variant="primary"
                      onClick={() => {
                        void appMode.signInWithCognito();
                      }}
                    >
                      <LogIn className="h-4 w-4" aria-hidden="true" />
                      Sign in with Cognito
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => appMode.setMode('DEMO')}
                    >
                      Switch to Demo Mode
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (!appMode.session.isAdmin) {
      return (
        <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-rose-950">
            <h1 className="text-lg font-bold text-slate-900">Administrator Access Restricted</h1>
            <p className="mt-2 text-sm leading-relaxed text-slate-700">
              Signed-in account <strong>{appMode.session.displayName}</strong> is not a member of
              the Cognito <code>admin</code> group. All admin routes enforce exact{' '}
              <code>cognito:groups</code> membership on AWS Lambda.
            </p>
          </div>
        </div>
      );
    }

    return <>{children}</>;
  }

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
