import { createHash, randomUUID } from 'node:crypto';
import { buildSlotLockKeys } from '../../lib/concurrency/slot-locks';
import type {
  BookingRecord,
  BookingStatus,
  DataSource,
  PaginatedResult,
  SlotLockRecord,
} from '../repositories/interfaces/domain-models';
import type { RepositoryContext } from '../repositories/interfaces/repository-context';
import { conflictError, notFoundError, validationError } from '../shared/api-error';
import { AuthorizationError } from '../shared/authorization';
import type { AuthorizedCaller } from '../shared/request-context';
import { getTodayCampusDate } from '../shared/runtime-context';

export interface CreateBookingInput {
  readonly roomId: string;
  readonly date: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly purpose: string;
}

export interface ListMyBookingsInput {
  readonly status?: BookingStatus;
  readonly limit?: number;
  readonly nextToken?: string;
}

export interface AdminListBookingsInput {
  readonly date?: string;
  readonly blockId?: string;
  readonly status?: BookingStatus;
  readonly limit?: number;
  readonly nextToken?: string;
}

export interface CreateBookingResult {
  readonly booking: BookingRecord;
  readonly idempotentReplay: boolean;
}

function deterministicBookingId(studentId: string, idempotencyKey: string): string {
  const digest = createHash('sha256')
    .update(`${studentId}:${idempotencyKey.trim()}`)
    .digest('hex')
    .slice(0, 24);
  return `bkg-${digest}`;
}

function sameBookingPayload(existing: BookingRecord, input: CreateBookingInput): boolean {
  return (
    existing.roomId === input.roomId &&
    existing.date === input.date &&
    existing.startTime === input.startTime &&
    existing.endTime === input.endTime &&
    existing.purpose === input.purpose.trim()
  );
}

export class BookingService {
  constructor(private readonly repos: RepositoryContext) {}

  async createBooking(
    studentId: string,
    input: CreateBookingInput,
    idempotencyKey?: string,
    studentName?: string,
    dataSource: DataSource = 'ADMIN_ENTERED',
  ): Promise<CreateBookingResult> {
    const normalizedIdempotencyKey = idempotencyKey?.trim() || undefined;
    if (normalizedIdempotencyKey && normalizedIdempotencyKey.length > 128) {
      throw validationError('Idempotency-Key header cannot exceed 128 characters.');
    }

    const bookingId = normalizedIdempotencyKey
      ? deterministicBookingId(studentId, normalizedIdempotencyKey)
      : `bkg-${randomUUID().slice(0, 16)}`;

    // Check deterministic idempotent replay first
    if (normalizedIdempotencyKey) {
      const existing = await this.repos.bookings.getById(bookingId);
      if (existing) {
        if (existing.studentId !== studentId || !sameBookingPayload(existing, input)) {
          throw conflictError(
            'Idempotency-Key has already been used with a different booking payload.',
          );
        }
        return { booking: existing, idempotentReplay: true };
      }
    }

    const room = await this.repos.rooms.getById(input.roomId);
    if (!room) {
      throw notFoundError(`Room "${input.roomId}" was not found.`);
    }
    if (!room.active) {
      throw conflictError(`Room "${input.roomId}" is currently inactive and cannot be booked.`);
    }

    // Enforce 15-minute slot alignment and max 4-hour duration, then query authoritative slot locks
    const lockKeys = buildSlotLockKeys(
      input.roomId,
      input.date,
      input.startTime,
      input.endTime,
      'BOOKING',
    );
    const existingLocks = await this.repos.slotLocks.getLocksForSlots(lockKeys);
    if (existingLocks.length > 0) {
      const claimTypes = [...new Set(existingLocks.map((l) => l.claimType))];
      throw conflictError(
        `Requested slot (${input.startTime}–${input.endTime} on ${input.date}) is already occupied by ${claimTypes.join('/')}.`,
        {
          conflictingClaimTypes: claimTypes,
          conflictingLockKeys: existingLocks.map((l) => l.lockKey),
        },
      );
    }

    const now = new Date().toISOString();
    const record: BookingRecord = {
      bookingId,
      roomId: input.roomId,
      studentId,
      ...(studentName ? { studentName } : {}),
      purpose: input.purpose.trim(),
      date: input.date,
      startTime: input.startTime,
      endTime: input.endTime,
      status: 'PENDING',
      ...(normalizedIdempotencyKey ? { idempotencyKey: normalizedIdempotencyKey } : {}),
      createdAt: now,
      updatedAt: now,
      dataSource,
    };

    try {
      const created = await this.repos.bookings.create(record);
      return { booking: created, idempotentReplay: false };
    } catch (err) {
      // Handle narrow race where duplicate idempotent request passed initial Get before Put
      if (normalizedIdempotencyKey) {
        const raced = await this.repos.bookings.getById(bookingId);
        if (raced && raced.studentId === studentId && sameBookingPayload(raced, input)) {
          return { booking: raced, idempotentReplay: true };
        }
      }
      throw err;
    }
  }

  async getBookingById(caller: AuthorizedCaller, bookingId: string): Promise<BookingRecord> {
    const booking = await this.repos.bookings.getById(bookingId);
    if (!booking) {
      throw notFoundError(`Booking "${bookingId}" was not found.`);
    }
    if (!caller.isAdminUser && booking.studentId !== caller.userId) {
      throw new AuthorizationError(403, 'You are not allowed to access another student’s booking.');
    }
    return booking;
  }

  async listMyBookings(
    studentId: string,
    query: ListMyBookingsInput,
  ): Promise<PaginatedResult<BookingRecord>> {
    const page = await this.repos.bookings.listByStudent(studentId, {
      limit: query.limit,
      nextToken: query.nextToken,
    });

    const filtered = query.status
      ? page.items.filter((b) => b.status === query.status)
      : page.items;

    return {
      items: filtered,
      ...(page.nextToken ? { nextToken: page.nextToken } : {}),
    };
  }

  async listAdminBookings(query: AdminListBookingsInput): Promise<PaginatedResult<BookingRecord>> {
    const targetDate = query.date ?? getTodayCampusDate();
    const blockId = query.blockId ?? 'BLOCK-A';
    const limit = query.limit ?? 50;

    // Query rooms via GSI_BlockFloor, then query GSI_RoomDateBookings per room (zero DynamoDB Scan)
    const roomsPage = await this.repos.rooms.listByBlock(blockId, { limit: 100 });
    const perRoom = await Promise.all(
      roomsPage.items.map((room) =>
        this.repos.bookings.listByRoomDate(room.roomId, targetDate, query.status),
      ),
    );

    const statusOrder: Record<BookingStatus, number> = {
      PENDING: 0,
      APPROVED: 1,
      REJECTED: 2,
      CANCELLED: 3,
    };

    const sorted = perRoom.flat().sort((a, b) => {
      if (statusOrder[a.status] !== statusOrder[b.status]) {
        return statusOrder[a.status] - statusOrder[b.status];
      }
      return b.createdAt.localeCompare(a.createdAt);
    });

    return {
      items: sorted.slice(0, limit),
    };
  }

  async approveBooking(bookingId: string): Promise<BookingRecord> {
    const booking = await this.repos.bookings.getById(bookingId);
    if (!booking) {
      throw notFoundError(`Booking "${bookingId}" was not found.`);
    }

    if (booking.status !== 'PENDING') {
      throw conflictError(
        `Only PENDING bookings can be approved; current status is "${booking.status}".`,
      );
    }

    const room = await this.repos.rooms.getById(booking.roomId);
    if (!room) {
      throw notFoundError(`Room "${booking.roomId}" for booking "${bookingId}" was not found.`);
    }
    if (!room.active) {
      throw conflictError(
        `Cannot approve booking "${bookingId}" because room "${booking.roomId}" is currently inactive.`,
      );
    }

    const lockKeys = buildSlotLockKeys(
      booking.roomId,
      booking.date,
      booking.startTime,
      booking.endTime,
      'BOOKING',
    );
    const now = new Date().toISOString();

    const slotLocks: SlotLockRecord[] = lockKeys.map((lockKey) => ({
      lockKey,
      roomId: booking.roomId,
      date: booking.date,
      slotStart: lockKey.slice(lockKey.lastIndexOf('#') + 1),
      claimType: 'BOOKING',
      claimRefId: booking.bookingId,
      createdAt: now,
    }));

    return this.repos.atomic.approveBooking({
      booking,
      slotLocks,
      updatedAt: now,
    });
  }

  async rejectBooking(bookingId: string): Promise<BookingRecord> {
    const booking = await this.repos.bookings.getById(bookingId);
    if (!booking) {
      throw notFoundError(`Booking "${bookingId}" was not found.`);
    }

    if (booking.status !== 'PENDING') {
      throw conflictError(
        `Only PENDING bookings can be rejected; current status is "${booking.status}".`,
      );
    }

    return this.repos.bookings.updateStatus({
      bookingId,
      expectedCurrentStatus: 'PENDING',
      nextStatus: 'REJECTED',
      updatedAt: new Date().toISOString(),
    });
  }

  async cancelBooking(caller: AuthorizedCaller, bookingId: string): Promise<BookingRecord> {
    const booking = await this.repos.bookings.getById(bookingId);
    if (!booking) {
      throw notFoundError(`Booking "${bookingId}" was not found.`);
    }

    if (!caller.isAdminUser && booking.studentId !== caller.userId) {
      throw new AuthorizationError(
        403,
        'You are not allowed to cancel another student’s booking.',
      );
    }

    const now = new Date().toISOString();

    if (booking.status === 'PENDING') {
      return this.repos.bookings.updateStatus({
        bookingId,
        expectedCurrentStatus: 'PENDING',
        nextStatus: 'CANCELLED',
        updatedAt: now,
      });
    }

    if (booking.status === 'APPROVED') {
      const lockKeys = buildSlotLockKeys(
        booking.roomId,
        booking.date,
        booking.startTime,
        booking.endTime,
        'BOOKING',
      );
      return this.repos.atomic.cancelApprovedBooking({
        booking,
        lockKeys,
        updatedAt: now,
      });
    }

    throw conflictError(
      `Cannot cancel booking "${bookingId}" from status "${booking.status}".`,
    );
  }
}
