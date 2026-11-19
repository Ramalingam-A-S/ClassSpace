import type {
  ActivityEvent,
  AvailabilityQuery,
  Booking,
  BookingStatus,
  Facility,
  Room,
  RoomAvailabilityResult,
  RoomRestriction,
  TimetableEntry,
} from '../types/domain';

export interface RoomDetailsResponse {
  room: Room;
  date: string;
  timetable: TimetableEntry[];
  approvedBookings: Booking[];
  pendingBookings: Booking[];
  restrictions: RoomRestriction[];
}

export interface CreateBookingInput {
  roomId: string;
  studentId: string;
  studentName: string;
  purpose: string;
  date: string;
  startTime: string;
  endTime: string;
}

export interface CreateRoomInput {
  blockId: string;
  floor: number;
  roomNumber: string;
  capacity: number;
  facilities: Facility[];
  active: boolean;
}

export type UpdateRoomInput = Partial<CreateRoomInput>;

export interface UpsertTimetableInput {
  scheduleId?: string;
  roomId: string;
  date: string;
  startTime: string;
  endTime: string;
  subject: string;
}

export interface CreateRestrictionInput {
  roomId: string;
  date: string;
  startTime: string;
  endTime: string;
  reason: string;
}

export interface AdminDashboardSnapshot {
  totalRooms: number;
  activeRooms: number;
  scheduleVacantCount: number;
  pendingBookingsCount: number;
  approvedBookingsCount: number;
  restrictedRoomsCount: number;
  recentActivities: ActivityEvent[];
}

/**
 * Typed service boundary designed for Phase 2 replacement with AWS API Gateway + Lambda + Cognito.
 * Phase 1 implements this interface against an isolated local mock repository.
 */
export interface IClassSpaceService {
  // GET /rooms
  listRooms(): Promise<Room[]>;

  // GET /rooms/available
  getAvailableRooms(query: AvailabilityQuery): Promise<RoomAvailabilityResult[]>;

  // GET /rooms/{roomId}?date=YYYY-MM-DD
  getRoomDetails(roomId: string, date: string): Promise<RoomDetailsResponse | null>;

  // POST /bookings
  createBooking(input: CreateBookingInput): Promise<Booking>;

  // GET /bookings/me
  getMyBookings(studentId: string): Promise<Booking[]>;

  // Admin read endpoints
  listAllBookings(): Promise<Booking[]>;
  listTimetableEntries(): Promise<TimetableEntry[]>;
  listRestrictions(): Promise<RoomRestriction[]>;
  getAdminSnapshot(date: string, startTime: string, endTime: string): Promise<AdminDashboardSnapshot>;

  // PATCH /admin/bookings/{id}
  updateBookingStatus(
    bookingId: string,
    status: Extract<BookingStatus, 'APPROVED' | 'REJECTED' | 'CANCELLED'>,
  ): Promise<Booking>;

  // POST /admin/rooms (and update)
  createRoom(input: CreateRoomInput): Promise<Room>;
  updateRoom(roomId: string, input: UpdateRoomInput): Promise<Room>;

  // PUT /admin/timetable
  upsertTimetableEntry(input: UpsertTimetableInput): Promise<TimetableEntry>;
  deleteTimetableEntry(scheduleId: string): Promise<void>;

  // POST /admin/restrictions
  createRestriction(input: CreateRestrictionInput): Promise<RoomRestriction>;
  deleteRestriction(restrictionId: string): Promise<void>;

  // Demo-only utility
  resetDemoData(): Promise<void>;
}
