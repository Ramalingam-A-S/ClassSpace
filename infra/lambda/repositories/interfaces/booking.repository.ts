import type {
  BookingRecord,
  BookingStatus,
  PaginatedResult,
  PaginationOptions,
} from './domain-models';

export interface UpdateBookingStatusInput {
  readonly bookingId: string;
  readonly expectedCurrentStatus: BookingStatus;
  readonly nextStatus: BookingStatus;
  readonly updatedAt: string;
}

export interface BookingRepository {
  getById(bookingId: string): Promise<BookingRecord | null>;
  listByStudent(
    studentId: string,
    options?: PaginationOptions,
  ): Promise<PaginatedResult<BookingRecord>>;
  /**
   * Lists room bookings for a date (backed by GSI_RoomDateBookings).
   * Note: Eventually consistent GSI reads MUST NOT be treated as authoritative
   * for booking conflict prevention; use SlotLockRepository instead.
   */
  listByRoomDate(
    roomId: string,
    date: string,
    statusFilter?: BookingStatus,
  ): Promise<readonly BookingRecord[]>;
  create(booking: BookingRecord): Promise<BookingRecord>;
  updateStatus(input: UpdateBookingStatusInput): Promise<BookingRecord>;
}
