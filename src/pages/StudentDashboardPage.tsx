import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Filter, RotateCcw, Search } from 'lucide-react';
import { AVAILABLE_FACILITIES, type Facility, type RoomAvailabilityResult } from '../types/domain';
import { useDemoRole } from '../hooks/useDemoRole';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { classSpaceService } from '../services';
import { formatCampusDate, getTodayKolkata } from '../utils/datetime';
import { availabilityQuerySchema } from '../utils/validation';
import { AvailabilityLegend } from '../components/rooms/AvailabilityLegend';
import { RoomCard } from '../components/rooms/RoomCard';
import { Button } from '../components/ui/Button';
import {
  DemoDisclosureBanner,
  EmptyState,
  ErrorBanner,
  LoadingCardsSkeleton,
  PhysicalOccupancyBanner,
} from '../components/ui/StateBanner';

interface SearchFilterState {
  date: string;
  startTime: string;
  endTime: string;
  minCapacity: string;
  blockId: string;
  floor: string;
  facilities: Facility[];
  includeUnavailable: boolean;
}

function getDefaultFilters(): SearchFilterState {
  return {
    date: getTodayKolkata(),
    startTime: '11:00',
    endTime: '12:00',
    minCapacity: '20',
    blockId: 'ALL',
    floor: 'ALL',
    facilities: [],
    includeUnavailable: false,
  };
}

export function StudentDashboardPage() {
  useDocumentTitle('Find Classrooms');
  const { identity } = useDemoRole();

  const [formState, setFormState] = useState<SearchFilterState>(getDefaultFilters);
  const [appliedQuery, setAppliedQuery] = useState<SearchFilterState>(getDefaultFilters);
  const [results, setResults] = useState<RoomAvailabilityResult[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const runSearch = useCallback(async (queryState: SearchFilterState) => {
    setLoading(true);
    setError(null);

    const parsed = availabilityQuerySchema.safeParse({
      date: queryState.date,
      startTime: queryState.startTime,
      endTime: queryState.endTime,
      minCapacity: queryState.minCapacity,
      blockId: queryState.blockId === 'ALL' ? undefined : queryState.blockId,
      floor: queryState.floor === 'ALL' ? undefined : Number(queryState.floor),
      facilities: queryState.facilities.length > 0 ? queryState.facilities : undefined,
    });

    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0]?.message ?? 'Invalid search filters.';
      setError(firstIssue);
      setResults([]);
      setLoading(false);
      return;
    }

    try {
      const data = await classSpaceService.getAvailableRooms({
        date: parsed.data.date,
        startTime: parsed.data.startTime,
        endTime: parsed.data.endTime,
        minCapacity: parsed.data.minCapacity,
        blockId: parsed.data.blockId,
        floor: parsed.data.floor,
        facilities: parsed.data.facilities as Facility[] | undefined,
      });
      setResults(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to evaluate classroom availability.');
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void runSearch(appliedQuery);
  }, [appliedQuery, runSearch]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setAppliedQuery({ ...formState });
  };

  const handleReset = () => {
    const defaults = getDefaultFilters();
    setFormState(defaults);
    setAppliedQuery(defaults);
  };

  const toggleFacility = (facility: Facility) => {
    setFormState((prev) => ({
      ...prev,
      facilities: prev.facilities.includes(facility)
        ? prev.facilities.filter((f) => f !== facility)
        : [...prev.facilities, facility],
    }));
  };

  const vacantResults = results.filter((r) => r.isAvailable);
  const visibleResults = formState.includeUnavailable ? results : vacantResults;

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Welcome, {identity.displayName}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Search for schedule-vacant classrooms in Campus Block A (Timezone: Asia/Kolkata IST).
          </p>
        </div>
      </div>

      <DemoDisclosureBanner compact />

      {/* Search & Filters */}
      <div role="search">
        <form
          onSubmit={handleSubmit}
          aria-label="Classroom availability search"
          className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs"
        >
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Filter className="h-4 w-4 text-indigo-700" aria-hidden="true" />
            <h2 className="text-base font-semibold text-slate-900">Search Free Period Window</h2>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
            <div>
              <label htmlFor="search-date" className="block text-xs font-semibold text-slate-700">
                Date
              </label>
              <input
                id="search-date"
                name="date"
                type="date"
                required
                value={formState.date}
                onChange={(e) => setFormState((p) => ({ ...p, date: e.target.value }))}
                className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
              />
            </div>

            <div>
              <label htmlFor="search-start" className="block text-xs font-semibold text-slate-700">
                Start Time
              </label>
              <input
                id="search-start"
                name="startTime"
                type="time"
                required
                value={formState.startTime}
                onChange={(e) => setFormState((p) => ({ ...p, startTime: e.target.value }))}
                className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
              />
            </div>

            <div>
              <label htmlFor="search-end" className="block text-xs font-semibold text-slate-700">
                End Time
              </label>
              <input
                id="search-end"
                name="endTime"
                type="time"
                required
                value={formState.endTime}
                onChange={(e) => setFormState((p) => ({ ...p, endTime: e.target.value }))}
                className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
              />
            </div>

            <div>
              <label
                htmlFor="search-capacity"
                className="block text-xs font-semibold text-slate-700"
              >
                Min Capacity
              </label>
              <input
                id="search-capacity"
                name="minCapacity"
                type="number"
                min={1}
                max={500}
                required
                value={formState.minCapacity}
                onChange={(e) => setFormState((p) => ({ ...p, minCapacity: e.target.value }))}
                className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
              />
            </div>

            <div>
              <label htmlFor="search-block" className="block text-xs font-semibold text-slate-700">
                Block
              </label>
              <select
                id="search-block"
                name="blockId"
                value={formState.blockId}
                onChange={(e) => setFormState((p) => ({ ...p, blockId: e.target.value }))}
                className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              >
                <option value="ALL">All Blocks</option>
                <option value="BLOCK-A">BLOCK-A</option>
              </select>
            </div>

            <div>
              <label htmlFor="search-floor" className="block text-xs font-semibold text-slate-700">
                Floor
              </label>
              <select
                id="search-floor"
                name="floor"
                value={formState.floor}
                onChange={(e) => setFormState((p) => ({ ...p, floor: e.target.value }))}
                className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              >
                <option value="ALL">All Floors</option>
                <option value="1">Floor 1</option>
                <option value="2">Floor 2</option>
                <option value="3">Floor 3</option>
              </select>
            </div>
          </div>

          <fieldset className="mt-5 border-t border-slate-100 pt-4">
            <legend className="text-xs font-semibold text-slate-700">Required Facilities</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {AVAILABLE_FACILITIES.map((facility) => {
                const checked = formState.facilities.includes(facility);
                const id = `fac-${facility.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
                return (
                  <label
                    key={facility}
                    htmlFor={id}
                    className={`inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                      checked
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-900'
                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <input
                      id={id}
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleFacility(facility)}
                      className="h-4 w-4 accent-indigo-700"
                    />
                    {facility}
                  </label>
                );
              })}
            </div>
          </fieldset>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 pt-4">
            <label
              htmlFor="toggle-unavailable"
              className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-700"
            >
              <input
                id="toggle-unavailable"
                type="checkbox"
                checked={formState.includeUnavailable}
                onChange={(e) =>
                  setFormState((p) => ({ ...p, includeUnavailable: e.target.checked }))
                }
                className="h-4 w-4 accent-indigo-700"
              />
              Also show occupied, restricted, and below-capacity rooms ({results.length - vacantResults.length})
            </label>

            <div className="flex flex-wrap items-center gap-2.5">
              <Button type="button" variant="secondary" onClick={handleReset}>
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                Reset Filters
              </Button>
              <Button type="submit" variant="primary" loading={loading}>
                <Search className="h-4 w-4" aria-hidden="true" />
                Search Classrooms
              </Button>
            </div>
          </div>
        </form>
      </div>

      <AvailabilityLegend />

      {error && <ErrorBanner message={error} />}

      {/* Results Header */}
      {!loading && !error && (
        <div
          aria-live="polite"
          className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-700"
        >
          <p>
            Showing <strong className="text-slate-900">{visibleResults.length}</strong> classroom(s)
            ({vacantResults.length} schedule-vacant) for{' '}
            <strong className="text-slate-900">{formatCampusDate(appliedQuery.date)}</strong>,{' '}
            <strong className="text-slate-900">
              {appliedQuery.startTime}–{appliedQuery.endTime} IST
            </strong>
            .
          </p>
        </div>
      )}

      {/* Results Grid / States */}
      {loading ? (
        <LoadingCardsSkeleton count={4} />
      ) : error ? null : visibleResults.length === 0 ? (
        <EmptyState
          title="No schedule-vacant classrooms match your filters"
          description="Try widening your time window, lowering the minimum capacity requirement, or clearing facility filters. You can also toggle unavailable rooms to inspect why rooms were excluded."
          action={
            <div className="flex flex-wrap justify-center gap-3">
              <Button type="button" variant="secondary" onClick={handleReset}>
                Reset All Filters
              </Button>
              {results.length > 0 && !formState.includeUnavailable && (
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => setFormState((p) => ({ ...p, includeUnavailable: true }))}
                >
                  Show All {results.length} Evaluated Rooms
                </Button>
              )}
            </div>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {visibleResults.map((result) => (
            <RoomCard
              key={result.room.roomId}
              result={result}
              searchDate={appliedQuery.date}
              searchStartTime={appliedQuery.startTime}
              searchEndTime={appliedQuery.endTime}
            />
          ))}
        </div>
      )}

      <PhysicalOccupancyBanner />
    </div>
  );
}
