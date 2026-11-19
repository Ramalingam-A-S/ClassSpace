import { createDemoSeedData, type DemoDataset } from '../data/demoData';

const STORAGE_KEY = 'classspace_phase1_demo_repository_v1';

function cloneDataset(dataset: DemoDataset): DemoDataset {
  return JSON.parse(JSON.stringify(dataset)) as DemoDataset;
}

function isValidDemoDataset(value: unknown): value is DemoDataset {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    Array.isArray(candidate.rooms) &&
    Array.isArray(candidate.timetable) &&
    Array.isArray(candidate.bookings) &&
    Array.isArray(candidate.restrictions) &&
    Array.isArray(candidate.activities)
  );
}

/**
 * Isolated local mock repository for Phase 1 demonstration persistence.
 * WARNING: localStorage is used strictly for local demo state persistence across refreshes,
 * NOT as a substitute for a production database or authentication store.
 */
export class LocalMockRepository {
  private memoryFallback: DemoDataset | null = null;

  load(): DemoDataset {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed: unknown = JSON.parse(raw);
          if (isValidDemoDataset(parsed)) {
            return cloneDataset(parsed);
          }
        }
      } catch {
        // Fall through to seed creation if storage is unavailable or corrupted.
      }
    }

    if (this.memoryFallback) {
      return cloneDataset(this.memoryFallback);
    }

    const seeded = createDemoSeedData();
    this.save(seeded);
    return cloneDataset(seeded);
  }

  save(dataset: DemoDataset): void {
    const copy = cloneDataset(dataset);
    this.memoryFallback = copy;
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(copy));
      } catch {
        // Ignore storage quota errors in restricted environments; memoryFallback remains active.
      }
    }
  }

  reset(): DemoDataset {
    const fresh = createDemoSeedData();
    this.save(fresh);
    return cloneDataset(fresh);
  }
}

export const mockRepository = new LocalMockRepository();
