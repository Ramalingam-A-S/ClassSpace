import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppModeContext, type AppModeContextValue } from '../hooks/useAppMode';
import {
  buildCognitoLogoutUrl,
  clearAuthSession,
  getAuthSession,
  isLiveModeConfigured,
  setActiveServiceMode,
  startCognitoLogin,
  subscribeAuthSession,
  type AppServiceMode,
  type AuthSession,
} from '../services';

function getInitialMode(liveConfigured: boolean): AppServiceMode {
  const envDemoMode = (import.meta.env as Record<string, string | undefined>)['VITE_DEMO_MODE'];
  if (envDemoMode === 'false' && liveConfigured) {
    return 'LIVE';
  }
  return 'DEMO';
}

export function AppModeProvider({ children }: { children: ReactNode }) {
  const liveConfigured = isLiveModeConfigured();
  const [mode, setModeState] = useState<AppServiceMode>(() => {
    const initial = getInitialMode(liveConfigured);
    setActiveServiceMode(initial);
    return initial;
  });
  const [session, setSession] = useState<AuthSession | null>(() => getAuthSession());

  useEffect(() => subscribeAuthSession(setSession), []);

  const setMode = (nextMode: AppServiceMode) => {
    setActiveServiceMode(nextMode);
    setModeState(nextMode);
  };

  const signInWithCognito = async () => {
    await startCognitoLogin();
  };

  const signOutLive = () => {
    clearAuthSession();
    const logoutUrl = buildCognitoLogoutUrl();
    if (logoutUrl && typeof window !== 'undefined') {
      window.location.assign(logoutUrl);
    }
  };

  const value = useMemo<AppModeContextValue>(
    () => ({
      mode,
      liveConfigured,
      session,
      setMode,
      signInWithCognito,
      signOutLive,
    }),
    [mode, liveConfigured, session],
  );

  return <AppModeContext.Provider value={value}>{children}</AppModeContext.Provider>;
}
