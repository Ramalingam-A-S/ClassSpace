import { createContext, useContext } from 'react';
import type { DemoIdentity, DemoRole } from '../types/domain';

export interface DemoRoleContextValue {
  role: DemoRole;
  identity: DemoIdentity;
  setRole: (role: DemoRole) => void;
}

export const DemoRoleContext = createContext<DemoRoleContextValue | null>(null);

export function useDemoRole(): DemoRoleContextValue {
  const ctx = useContext(DemoRoleContext);
  if (!ctx) {
    throw new Error('useDemoRole must be used within DemoRoleProvider');
  }
  return ctx;
}
