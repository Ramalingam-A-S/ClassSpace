export type DataSource = 'DEMO' | 'ADMIN_ENTERED' | 'VERIFIED_INSTITUTIONAL';

export type BookingStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export type Facility =
  | 'Projector'
  | 'Air Conditioning'
  | 'Smart Board'
  | 'Audio System'
  | 'Whiteboard'
  | 'Lab Workstations'
  | 'Power Outlets'
  | 'High-Speed Wi-Fi';

export const AVAILABLE_FACILITIES: readonly Facility[] = [
  'Projector',
  'Air Conditioning',
  'Smart Board',
  'Audio System',
  'Whiteboard',
  'Lab Workstations',
  'Power Outlets',
  'High-Speed Wi-Fi',
] as const;

export interface Room {
  roomId: string;
  blockId: string;
  floor: number;
  roomNumber: string;
  capacity: number;
  facilities: Facility[];
  active: boolean;
  dataSource: DataSource;
}

export interface TimetableEntry {
  scheduleId: string;
  roomId: string;
  date: string; // YYYY-MM-DD in Asia/Kolkata
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  subject: string;
  dataSource: DataSource;
}

export interface Booking {
  bookingId: string;
  roomId: string;
  studentId: string;
  studentName?: string;
  purpose?: string;
  date: string; // YYYY-MM-DD in Asia/Kolkata
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  status: BookingStatus;
  createdAt: string; // ISO 8601 timestamp
  dataSource: DataSource;
}

export interface RoomRestriction {
  restrictionId: string;
  roomId: string;
  date: string; // YYYY-MM-DD in Asia/Kolkata
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  reason: string;
  dataSource: DataSource;
}

export type AvailabilityStatus =
  | 'SCHEDULE_VACANT'
  | 'OCCUPIED_TIMETABLE'
  | 'OCCUPIED_BOOKING'
  | 'RESTRICTED'
  | 'INACTIVE'
  | 'INSUFFICIENT_CAPACITY';

export interface AvailabilityQuery {
  date: string;
  startTime: string;
  endTime: string;
  minCapacity: number;
  blockId?: string;
  floor?: number;
  facilities?: Facility[];
}

export interface AvailabilityConflicts {
  timetable: TimetableEntry[];
  approvedBookings: Booking[];
  restrictions: RoomRestriction[];
}

export interface RoomAvailabilityResult {
  room: Room;
  isAvailable: boolean;
  status: AvailabilityStatus;
  explanation: string;
  physicalOccupancyNotice: string;
  conflicts: AvailabilityConflicts;
  pendingBookingsCount: number;
}

export type DemoRole = 'STUDENT_DEMO' | 'ADMIN_DEMO';

export interface DemoIdentity {
  role: DemoRole;
  userId: string;
  displayName: string;
  cognitoGroupPlaceholder: 'student' | 'admin';
}

export interface ActivityEvent {
  id: string;
  timestamp: string;
  type: 'BOOKING_CREATED' | 'BOOKING_APPROVED' | 'BOOKING_REJECTED' | 'ROOM_UPDATED' | 'TIMETABLE_UPDATED' | 'RESTRICTION_ADDED';
  message: string;
  dataSource: DataSource;
}
