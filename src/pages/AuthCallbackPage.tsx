import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, ShieldAlert } from 'lucide-react';
import { useAppMode } from '../hooks/useAppMode';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { exchangeAuthorizationCode } from '../services';
import { Button } from '../components/ui/Button';

export function AuthCallbackPage() {
  useDocumentTitle('Signing In');
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { setMode } = useAppMode();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const oauthError = searchParams.get('error_description') ?? searchParams.get('error');
    if (oauthError) {
      setError(`Cognito authentication failed: ${oauthError}`);
      return;
    }

    const code = searchParams.get('code');
    const state = searchParams.get('state');
    if (!code || !state) {
      setError('Missing OAuth authorization code or PKCE state parameter.');
      return;
    }

    let cancelled = false;
    void exchangeAuthorizationCode(code, state)
      .then((session) => {
        if (cancelled) return;
        setMode('LIVE');
        navigate(session.isAdmin ? '/admin' : '/student', { replace: true });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Unable to complete Cognito sign-in.');
      });

    return () => {
      cancelled = true;
    };
  }, [navigate, searchParams, setMode]);

  if (error) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-rose-950">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 h-6 w-6 shrink-0 text-rose-700" aria-hidden="true" />
            <div>
              <h1 className="text-lg font-bold">Sign-In Could Not Be Completed</h1>
              <p className="mt-2 text-sm text-rose-800">{error}</p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Link to="/">
                  <Button type="button" variant="secondary">
                    Return Home
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-20 text-center">
      <Loader2 className="h-8 w-8 animate-spin text-indigo-700" aria-hidden="true" />
      <h1 className="mt-4 text-xl font-bold text-slate-900">Completing Secure Sign-In</h1>
      <p className="mt-2 text-sm text-slate-600">
        Exchanging PKCE authorization code with Amazon Cognito…
      </p>
    </div>
  );
}
