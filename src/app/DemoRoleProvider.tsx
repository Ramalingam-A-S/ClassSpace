import { useMemo, useState, type ReactNode } from 'react';
import { DEMO_IDENTITIES } from '../data/demoData';
import { DemoRoleContext, type DemoRoleContextValue } from '../hooks/useDemoRole';
import type { DemoRole } from '../types/domain';

const ROLE_STORAGE_KEY = 'classspace_phase1_demo_role';

function loadStoredRole(): DemoRole {
  if (typeof window !== 'undefined' && window.localStorage) {
    const stored = window.localStorage.getItem(ROLE_STORAGE_KEY);
    if (stored === 'ADMIN_DEMO' || stored === 'STUDENT_DEMO') {
      return stored;
    }
  }
  return 'STUDENT_DEMO';
}

export function DemoRoleProvider({ children }: { children: ReactNode }) {
  const [role, setRoleState] = useState<DemoRole>(loadStoredRole);

  const setRole = (nextRole: DemoRole) => {
    setRoleState(nextRole);
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.setItem(ROLE_STORAGE_KEY, nextRole);
      } catch {
        // Ignore storage errors in restricted environments.
      }
    }
  };

  const value = useMemo<DemoRoleContextValue>(
    () => ({
      role,
      identity: DEMO_IDENTITIES[role],
      setRole,
    }),
    [role],
  );

  return <DemoRoleContext.Provider value={value}>{children}</DemoRoleContext.Provider>;
}
