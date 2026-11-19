import { createContext, useContext } from 'react';
import type { AuthSession } from '../services/cognitoAuth';
import type { AppServiceMode } from '../services';

export interface AppModeContextValue {
  readonly mode: AppServiceMode;
  readonly liveConfigured: boolean;
  readonly session: AuthSession | null;
  readonly setMode: (nextMode: AppServiceMode) => void;
  readonly signInWithCognito: () => Promise<void>;
  readonly signOutLive: () => void;
}

export const AppModeContext = createContext<AppModeContextValue | null>(null);

export function useAppMode(): AppModeContextValue {
  const ctx = useContext(AppModeContext);
  if (!ctx) {
    throw new Error('useAppMode must be used within AppModeProvider');
  }
  return ctx;
}
