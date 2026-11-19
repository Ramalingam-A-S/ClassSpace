import { conflictError, notFoundError } from '../../shared/api-error';
import type { BookingRepository, UpdateBookingStatusInput } from '../interfaces/booking.repository';
import type {
  BookingRecord,
  BookingStatus,
  PaginatedResult,
  PaginationOptions,
  RoomRecord,
  ScheduleRecord,
  ScheduleRecordType,
  SlotLockRecord,
} from '../interfaces/domain-models';
import type { RepositoryContext } from '../interfaces/repository-context';
import type { ListByBlockOptions, RoomRepository } from '../interfaces/room.repository';
import type { ScheduleRepository } from '../interfaces/schedule.repository';
import type {
  ClaimSlotsInput,
  ReleaseSlotsInput,
  SlotClaimResult,
  SlotLockRepository,
} from '../interfaces/slot-lock.repository';

export interface InMemoryRepositoryContext extends RepositoryContext {
  clear(): void;
}

function paginateArray<T>(
  items: readonly T[],
  options?: PaginationOptions,
): PaginatedResult<T> {
  const limit = options?.limit ?? 25;
  const offset = options?.nextToken ? Number(Buffer.from(options.nextToken, 'base64url').toString('utf8')) : 0;
  const safeOffset = Number.isSafeInteger(offset) && offset >= 0 ? offset : 0;
  const slice = items.slice(safeOffset, safeOffset + limit);
  const nextOffset = safeOffset + limit;

  return {
    items: slice,
    ...(nextOffset < items.length
      ? { nextToken: Buffer.from(String(nextOffset), 'utf8').toString('base64url') }
      : {}),
  };
}

/**
 * Creates an isolated in-memory RepositoryContext for unit tests.
 * Note: Enforces basic PK uniqueness and conditional preconditions in memory,
 * but does NOT prove DynamoDB TransactWriteItems concurrency correctness.
 */
export function createInMemoryRepositoryContext(): InMemoryRepositoryContext {
  const rooms = new Map<string, RoomRecord>();
  const schedules = new Map<string, ScheduleRecord>();
  const bookings = new Map<string, BookingRecord>();
  const slotLocks = new Map<string, SlotLockRecord>();

  const scheduleMapKey = (
    roomId: string,
    date: string,
    recordType: ScheduleRecordType,
    scheduleId: string,
  ): string => `${roomId}#${date}#${recordType}#${scheduleId}`;

  const toChronologicalSortKey = (r: ScheduleRecord): string =>
    `${r.startTime}#${r.recordType === 'TIMETABLE' ? 'TT' : 'RES'}#${r.scheduleId}`;

  const roomRepo: RoomRepository = {
    async getById(roomId) {
      return rooms.get(roomId) ?? null;
    },
    async listByBlock(blockId, options?: ListByBlockOptions) {
      const filtered = [...rooms.values()]
        .filter((r) => {
          if (r.blockId !== blockId) return false;
          if (options?.floor !== undefined && r.floor !== options.floor) return false;
          if (options?.activeOnly && !r.active) return false;
          return true;
        })
        .sort((a, b) =>
          a.floor !== b.floor ? a.floor - b.floor : a.roomNumber.localeCompare(b.roomNumber),
        );
      return paginateArray(filtered, options);
    },
    async create(room) {
      if (rooms.has(room.roomId)) {
        throw conflictError(`Room "${room.roomId}" already exists.`);
      }
      const duplicateBlockRoom = [...rooms.values()].some(
        (r) => r.blockId === room.blockId && r.roomNumber === room.roomNumber,
      );
      if (duplicateBlockRoom) {
        throw conflictError(`Room "${room.blockId} / ${room.roomNumber}" already exists.`);
      }
      rooms.set(room.roomId, room);
      return room;
    },
    async update(roomId, patch) {
      const existing = rooms.get(roomId);
      if (!existing) {
        throw notFoundError(`Room "${roomId}" was not found.`);
      }
      const updated: RoomRecord = { ...existing, ...patch, roomId };
      rooms.set(roomId, updated);
      return updated;
    },
    async deactivate(roomId, updatedAt) {
      return roomRepo.update(roomId, { active: false, updatedAt });
    },
  };

  const scheduleRepo: ScheduleRepository = {
    async getForRoomDate(roomId, date) {
      return [...schedules.values()]
        .filter((s) => s.roomId === roomId && s.date === date)
        .sort((a, b) => toChronologicalSortKey(a).localeCompare(toChronologicalSortKey(b)));
    },
    async listForDate(date) {
      return [...schedules.values()]
        .filter((s) => s.date === date)
        .sort((a, b) => toChronologicalSortKey(a).localeCompare(toChronologicalSortKey(b)));
    },
    async create(record) {
      const key = scheduleMapKey(record.roomId, record.date, record.recordType, record.scheduleId);
      if (schedules.has(key)) {
        throw conflictError(`Schedule record "${record.scheduleId}" already exists.`);
      }
      schedules.set(key, record);
      return record;
    },
    async update(roomId, date, recordType, scheduleId, patch) {
      const key = scheduleMapKey(roomId, date, recordType, scheduleId);
      const existing = schedules.get(key);
      if (!existing) {
        throw notFoundError(`Schedule record "${scheduleId}" was not found.`);
      }
      const updated: ScheduleRecord = {
        ...existing,
        ...patch,
        roomId,
        date,
        recordType,
        scheduleId,
      };
      schedules.set(key, updated);
      return updated;
    },
    async delete(roomId, date, recordType, _startTime, scheduleId) {
      const key = scheduleMapKey(roomId, date, recordType, scheduleId);
      if (!schedules.has(key)) {
        throw notFoundError(`Schedule record "${scheduleId}" was not found.`);
      }
      schedules.delete(key);
    },
  };

  const bookingRepo: BookingRepository = {
    async getById(bookingId) {
      return bookings.get(bookingId) ?? null;
    },
    async listByStudent(studentId, options) {
      const filtered = [...bookings.values()]
        .filter((b) => b.studentId === studentId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return paginateArray(filtered, options);
    },
    async listByRoomDate(roomId, date, statusFilter?: BookingStatus) {
      return [...bookings.values()]
        .filter(
          (b) =>
            b.roomId === roomId &&
            b.date === date &&
            (statusFilter === undefined || b.status === statusFilter),
        )
        .sort((a, b) => a.startTime.localeCompare(b.startTime));
    },
    async create(booking) {
      if (bookings.has(booking.bookingId)) {
        throw conflictError(`Booking "${booking.bookingId}" already exists.`);
      }
      bookings.set(booking.bookingId, booking);
      return booking;
    },
    async updateStatus(input: UpdateBookingStatusInput) {
      const existing = bookings.get(input.bookingId);
      if (!existing) {
        throw notFoundError(`Booking "${input.bookingId}" was not found.`);
      }
      if (existing.status !== input.expectedCurrentStatus) {
        throw conflictError(
          `Booking "${input.bookingId}" is in status ${existing.status}, expected ${input.expectedCurrentStatus}.`,
        );
      }
      const updated: BookingRecord = {
        ...existing,
        status: input.nextStatus,
        updatedAt: input.updatedAt,
      };
      bookings.set(input.bookingId, updated);
      return updated;
    },
  };

  const slotLockRepo: SlotLockRepository = {
    async getLocksForSlots(lockKeys) {
      const found: SlotLockRecord[] = [];
      for (const key of lockKeys) {
        const record = slotLocks.get(key);
        if (record) found.push(record);
      }
      return found;
    },
    async claimSlots(input: ClaimSlotsInput): Promise<SlotClaimResult> {
      const conflicts = input.locks
        .map((l) => l.lockKey)
        .filter((key) => slotLocks.has(key));

      if (conflicts.length > 0) {
        return { acquired: false, conflictingLockKeys: conflicts };
      }

      for (const lock of input.locks) {
        slotLocks.set(lock.lockKey, lock);
      }
      return { acquired: true, conflictingLockKeys: [] };
    },
    async releaseSlots(input: ReleaseSlotsInput) {
      for (const key of input.lockKeys) {
        const existing = slotLocks.get(key);
        if (
          existing &&
          existing.claimType === input.expectedClaimType &&
          existing.claimRefId === input.expectedClaimRefId
        ) {
          slotLocks.delete(key);
        }
      }
    },
  };

  return {
    rooms: roomRepo,
    schedules: scheduleRepo,
    bookings: bookingRepo,
    slotLocks: slotLockRepo,
    supportsAtomicTransactions: false,
    clear() {
      rooms.clear();
      schedules.clear();
      bookings.clear();
      slotLocks.clear();
    },
  };
}
