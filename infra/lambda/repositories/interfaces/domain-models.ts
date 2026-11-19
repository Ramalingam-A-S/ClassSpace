export type DataSource = 'DEMO' | 'ADMIN_ENTERED' | 'VERIFIED_INSTITUTIONAL';

export type BookingStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export type ScheduleRecordType = 'TIMETABLE' | 'RESTRICTION';

export type SlotClaimType = 'TIMETABLE' | 'BOOKING' | 'RESTRICTION';

export interface RoomRecord {
  readonly roomId: string;
  readonly blockId: string;
  readonly floor: number;
  readonly roomNumber: string;
  readonly capacity: number;
  readonly facilities: readonly string[];
  readonly active: boolean;
  readonly dataSource: DataSource;
  readonly updatedAt: string;
}

export interface ScheduleRecord {
  readonly scheduleId: string;
  readonly recordType: ScheduleRecordType;
  readonly roomId: string;
  readonly date: string; // YYYY-MM-DD (Asia/Kolkata)
  readonly startTime: string; // HH:mm
  readonly endTime: string; // HH:mm
  readonly label: string; // subject for TIMETABLE, reason for RESTRICTION
  readonly dataSource: DataSource;
}

export interface BookingRecord {
  readonly bookingId: string;
  readonly roomId: string;
  readonly studentId: string;
  readonly studentName?: string;
  readonly purpose: string;
  readonly date: string; // YYYY-MM-DD (Asia/Kolkata)
  readonly startTime: string; // HH:mm
  readonly endTime: string; // HH:mm
  readonly status: BookingStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly dataSource: DataSource;
}

export interface SlotLockRecord {
  readonly lockKey: string; // roomId#date#slotStartHHmm
  readonly roomId: string;
  readonly date: string;
  readonly slotStart: string; // HH:mm
  readonly claimType: SlotClaimType;
  readonly claimRefId: string;
  readonly createdAt: string;
}

export interface PaginatedResult<T> {
  readonly items: readonly T[];
  readonly nextToken?: string;
}

export interface PaginationOptions {
  readonly limit?: number;
  readonly nextToken?: string;
}
