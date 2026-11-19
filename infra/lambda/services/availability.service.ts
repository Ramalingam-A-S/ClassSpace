import { buildSlotLockKeys } from '../../lib/concurrency/slot-locks';
import type {
  RoomRecord,
  ScheduleRecord,
  SlotClaimType,
  SlotLockRecord,
} from '../repositories/interfaces/domain-models';
import type { RepositoryContext } from '../repositories/interfaces/repository-context';
import { PHYSICAL_OCCUPANCY_NOTICE } from './room.service';

export type AvailabilityStatus =
  | 'SCHEDULE_VACANT'
  | 'OCCUPIED_TIMETABLE'
  | 'OCCUPIED_BOOKING'
  | 'RESTRICTED'
  | 'INACTIVE'
  | 'INSUFFICIENT_CAPACITY';

export interface AvailabilitySearchInput {
  readonly date: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly minCapacity: number;
  readonly blockId?: string;
  readonly floor?: number;
  readonly facilities?: string;
}

export interface RoomAvailabilityEvaluation {
  readonly room: RoomRecord;
  readonly isAvailable: boolean;
  readonly status: AvailabilityStatus;
  readonly explanation: string;
  readonly physicalOccupancyNotice: string;
  readonly conflictingLocks: readonly SlotLockRecord[];
  readonly conflictingSchedules: readonly ScheduleRecord[];
  readonly pendingBookingsCount: number;
}

export interface AvailabilitySearchResult {
  readonly query: {
    readonly date: string;
    readonly startTime: string;
    readonly endTime: string;
    readonly minCapacity: number;
    readonly blockId: string;
    readonly floor?: number;
    readonly facilities: readonly string[];
  };
  readonly physicalOccupancyNotice: string;
  readonly availableRooms: readonly RoomAvailabilityEvaluation[];
  readonly roomResults: readonly RoomAvailabilityEvaluation[];
}

function parseFacilitiesFilter(raw?: string): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function intervalsOverlap(
  startA: string,
  endA: string,
  startB: string,
  endB: string,
): boolean {
  return startA < endB && startB < endA;
}

function resolveBlockingClaimType(locks: readonly SlotLockRecord[]): SlotClaimType {
  if (locks.some((l) => l.claimType === 'RESTRICTION')) return 'RESTRICTION';
  if (locks.some((l) => l.claimType === 'TIMETABLE')) return 'TIMETABLE';
  return 'BOOKING';
}

export class AvailabilityService {
  constructor(private readonly repos: RepositoryContext) {}

  async searchAvailability(input: AvailabilitySearchInput): Promise<AvailabilitySearchResult> {
    const blockId = input.blockId ?? 'BLOCK-A';
    const requiredFacilities = parseFacilitiesFilter(input.facilities);

    const roomsPage = await this.repos.rooms.listByBlock(blockId, {
      floor: input.floor,
      activeOnly: false,
      limit: 100,
    });

    const facilityMatchedRooms = roomsPage.items.filter((room) =>
      requiredFacilities.every((facility) => room.facilities.includes(facility)),
    );

    // Pre-generate 15-minute slot keys per room (max 32 slots per room for 8h search window)
    const eligibleForLockCheck = facilityMatchedRooms.filter(
      (r) => r.active && r.capacity >= input.minCapacity,
    );

    const perRoomSlotKeys = new Map<string, string[]>();
    const allLockKeys: string[] = [];
    for (const room of eligibleForLockCheck) {
      const keys = buildSlotLockKeys(
        room.roomId,
        input.date,
        input.startTime,
        input.endTime,
        'TIMETABLE',
      );
      perRoomSlotKeys.set(room.roomId, keys);
      allLockKeys.push(...keys);
    }

    // Authoritative strongly consistent lock read on ClassSpaceSlotLocks
    const allExistingLocks =
      allLockKeys.length > 0
        ? await this.repos.slotLocks.getLocksForSlots(allLockKeys)
        : [];

    const locksByRoom = new Map<string, SlotLockRecord[]>();
    for (const lock of allExistingLocks) {
      const existing = locksByRoom.get(lock.roomId) ?? [];
      existing.push(lock);
      locksByRoom.set(lock.roomId, existing);
    }

    const roomResults: RoomAvailabilityEvaluation[] = await Promise.all(
      facilityMatchedRooms.map(async (room): Promise<RoomAvailabilityEvaluation> => {
        if (!room.active) {
          return {
            room,
            isAvailable: false,
            status: 'INACTIVE',
            explanation: `Room ${room.blockId} / ${room.roomNumber} is currently marked inactive by an administrator.`,
            physicalOccupancyNotice: PHYSICAL_OCCUPANCY_NOTICE,
            conflictingLocks: [],
            conflictingSchedules: [],
            pendingBookingsCount: 0,
          };
        }

        if (room.capacity < input.minCapacity) {
          return {
            room,
            isAvailable: false,
            status: 'INSUFFICIENT_CAPACITY',
            explanation: `Room capacity (${room.capacity}) is lower than requested minimum (${input.minCapacity}).`,
            physicalOccupancyNotice: PHYSICAL_OCCUPANCY_NOTICE,
            conflictingLocks: [],
            conflictingSchedules: [],
            pendingBookingsCount: 0,
          };
        }

        const roomLocks = locksByRoom.get(room.roomId) ?? [];
        const pendingBookings = await this.repos.bookings.listByRoomDate(
          room.roomId,
          input.date,
          'PENDING',
        );
        const overlappingPendingCount = pendingBookings.filter((b) =>
          intervalsOverlap(input.startTime, input.endTime, b.startTime, b.endTime),
        ).length;

        if (roomLocks.length === 0) {
          return {
            room,
            isAvailable: true,
            status: 'SCHEDULE_VACANT',
            explanation:
              overlappingPendingCount > 0
                ? `No timetable block, approved booking, or restriction covers ${input.startTime}–${input.endTime} (${overlappingPendingCount} unapproved pending request(s) exist).`
                : `No scheduled class, approved booking, or admin restriction covers ${input.startTime}–${input.endTime}.`,
            physicalOccupancyNotice: PHYSICAL_OCCUPANCY_NOTICE,
            conflictingLocks: [],
            conflictingSchedules: [],
            pendingBookingsCount: overlappingPendingCount,
          };
        }

        const schedulesForDate = await this.repos.schedules.getForRoomDate(room.roomId, input.date);
        const conflictingSchedules = schedulesForDate.filter((s) =>
          intervalsOverlap(input.startTime, input.endTime, s.startTime, s.endTime),
        );

        const primaryClaim = resolveBlockingClaimType(roomLocks);
        if (primaryClaim === 'RESTRICTION') {
          const reasonText =
            conflictingSchedules.find((s) => s.recordType === 'RESTRICTION')?.label ??
            'Administrative restriction';
          return {
            room,
            isAvailable: false,
            status: 'RESTRICTED',
            explanation: `Room blocked by administrative restriction: ${reasonText}.`,
            physicalOccupancyNotice: PHYSICAL_OCCUPANCY_NOTICE,
            conflictingLocks: roomLocks,
            conflictingSchedules,
            pendingBookingsCount: overlappingPendingCount,
          };
        }

        if (primaryClaim === 'TIMETABLE') {
          const subjectText =
            conflictingSchedules.find((s) => s.recordType === 'TIMETABLE')?.label ??
            'Scheduled class';
          return {
            room,
            isAvailable: false,
            status: 'OCCUPIED_TIMETABLE',
            explanation: `Room reserved by timetable schedule: ${subjectText}.`,
            physicalOccupancyNotice: PHYSICAL_OCCUPANCY_NOTICE,
            conflictingLocks: roomLocks,
            conflictingSchedules,
            pendingBookingsCount: overlappingPendingCount,
          };
        }

        return {
          room,
          isAvailable: false,
          status: 'OCCUPIED_BOOKING',
          explanation: `Room occupied by an approved student booking during ${input.startTime}–${input.endTime}.`,
          physicalOccupancyNotice: PHYSICAL_OCCUPANCY_NOTICE,
          conflictingLocks: roomLocks,
          conflictingSchedules,
          pendingBookingsCount: overlappingPendingCount,
        };
      }),
    );

    const availableRooms = roomResults.filter((item) => item.isAvailable);

    return {
      query: {
        date: input.date,
        startTime: input.startTime,
        endTime: input.endTime,
        minCapacity: input.minCapacity,
        blockId,
        ...(input.floor !== undefined ? { floor: input.floor } : {}),
        facilities: requiredFacilities,
      },
      physicalOccupancyNotice: PHYSICAL_OCCUPANCY_NOTICE,
      availableRooms,
      roomResults,
    };
  }
}
