import type { BookingRepository } from './booking.repository';
import type { RoomRepository } from './room.repository';
import type { ScheduleRepository } from './schedule.repository';
import type { SlotLockRepository } from './slot-lock.repository';

export interface RepositoryContext {
  readonly rooms: RoomRepository;
  readonly schedules: ScheduleRepository;
  readonly bookings: BookingRepository;
  readonly slotLocks: SlotLockRepository;
  readonly supportsAtomicTransactions: boolean;
}
