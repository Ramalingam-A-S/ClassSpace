import type {
  BookingRecord,
  ScheduleRecord,
  ScheduleRecordType,
  SlotLockRecord,
} from './domain-models';
import type { BookingRepository } from './booking.repository';
import type { RoomRepository } from './room.repository';
import type { ScheduleRepository } from './schedule.repository';
import type { SlotLockRepository } from './slot-lock.repository';

export interface AtomicApproveBookingInput {
  readonly booking: BookingRecord;
  readonly slotLocks: readonly SlotLockRecord[];
  readonly updatedAt: string;
}

export interface AtomicCancelApprovedBookingInput {
  readonly booking: BookingRecord;
  readonly lockKeys: readonly string[];
  readonly updatedAt: string;
}

export interface AtomicUpsertScheduleInput {
  readonly record: ScheduleRecord;
  readonly previousRecord?: ScheduleRecord;
  readonly locksToInsert: readonly SlotLockRecord[];
  readonly lockKeysToDelete: readonly string[];
}

export interface AtomicDeleteScheduleInput {
  readonly roomId: string;
  readonly date: string;
  readonly recordType: ScheduleRecordType;
  readonly startTime: string;
  readonly scheduleId: string;
  readonly lockKeys: readonly string[];
}

export interface AtomicOperations {
  approveBooking(input: AtomicApproveBookingInput): Promise<BookingRecord>;
  cancelApprovedBooking(input: AtomicCancelApprovedBookingInput): Promise<BookingRecord>;
  upsertScheduleWithLocks(input: AtomicUpsertScheduleInput): Promise<ScheduleRecord>;
  deleteScheduleWithLocks(input: AtomicDeleteScheduleInput): Promise<void>;
}

export interface RepositoryContext {
  readonly rooms: RoomRepository;
  readonly schedules: ScheduleRepository;
  readonly bookings: BookingRepository;
  readonly slotLocks: SlotLockRepository;
  readonly atomic: AtomicOperations;
  readonly supportsAtomicTransactions: boolean;
}
