import type {
  AvailabilityQuery,
  Booking,
  Room,
  RoomAvailabilityResult,
  RoomRestriction,
  TimetableEntry,
} from '../types/domain';
import {
  intervalsOverlap,
  isValidDateString,
  isValidTimeRange,
} from '../utils/datetime';

export const PHYSICAL_OCCUPANCY_NOTICE =
  'Schedule status only: physical room occupancy is not monitored or verified in Phase 1.';

export class AvailabilityValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AvailabilityValidationError';
  }
}

export interface AvailabilityDataset {
  rooms: Room[];
  timetable: TimetableEntry[];
  bookings: Booking[];
  restrictions: RoomRestriction[];
}

/**
 * Evaluates a single room against a validated date/time interval and capacity requirement.
 * Precedence of blocking statuses:
 * 1. INACTIVE
 * 2. INSUFFICIENT_CAPACITY
 * 3. RESTRICTED
 * 4. OCCUPIED_TIMETABLE
 * 5. OCCUPIED_BOOKING (APPROVED only; PENDING/REJECTED/CANCELLED never block)
 * 6. SCHEDULE_VACANT
 */
export function evaluateRoomAvailability(
  room: Room,
  query: AvailabilityQuery,
  dataset: Pick<AvailabilityDataset, 'timetable' | 'bookings' | 'restrictions'>,
): RoomAvailabilityResult {
  validateAvailabilityQuery(query);

  const overlappingTimetable = dataset.timetable.filter(
    (entry) =>
      entry.roomId === room.roomId &&
      entry.date === query.date &&
      intervalsOverlap(query.startTime, query.endTime, entry.startTime, entry.endTime),
  );

  const overlappingApprovedBookings = dataset.bookings.filter(
    (booking) =>
      booking.roomId === room.roomId &&
      booking.date === query.date &&
      booking.status === 'APPROVED' &&
      intervalsOverlap(query.startTime, query.endTime, booking.startTime, booking.endTime),
  );

  const overlappingPendingBookings = dataset.bookings.filter(
    (booking) =>
      booking.roomId === room.roomId &&
      booking.date === query.date &&
      booking.status === 'PENDING' &&
      intervalsOverlap(query.startTime, query.endTime, booking.startTime, booking.endTime),
  );

  const overlappingRestrictions = dataset.restrictions.filter(
    (restriction) =>
      restriction.roomId === room.roomId &&
      restriction.date === query.date &&
      intervalsOverlap(query.startTime, query.endTime, restriction.startTime, restriction.endTime),
  );

  const conflicts = {
    timetable: overlappingTimetable,
    approvedBookings: overlappingApprovedBookings,
    restrictions: overlappingRestrictions,
  };

  if (!room.active) {
    return {
      room,
      isAvailable: false,
      status: 'INACTIVE',
      explanation: `Room ${room.blockId} / ${room.roomNumber} is currently marked inactive by an administrator.`,
      physicalOccupancyNotice: PHYSICAL_OCCUPANCY_NOTICE,
      conflicts,
      pendingBookingsCount: overlappingPendingBookings.length,
    };
  }

  if (room.capacity < query.minCapacity) {
    return {
      room,
      isAvailable: false,
      status: 'INSUFFICIENT_CAPACITY',
      explanation: `Capacity (${room.capacity} seats) is below the requested minimum of ${query.minCapacity} seats.`,
      physicalOccupancyNotice: PHYSICAL_OCCUPANCY_NOTICE,
      conflicts,
      pendingBookingsCount: overlappingPendingBookings.length,
    };
  }

  if (overlappingRestrictions.length > 0) {
    const reasons = overlappingRestrictions.map((r) => `${r.reason} (${r.startTime}–${r.endTime})`).join('; ');
    return {
      room,
      isAvailable: false,
      status: 'RESTRICTED',
      explanation: `Restricted during requested time: ${reasons}.`,
      physicalOccupancyNotice: PHYSICAL_OCCUPANCY_NOTICE,
      conflicts,
      pendingBookingsCount: overlappingPendingBookings.length,
    };
  }

  if (overlappingTimetable.length > 0) {
    const subjects = overlappingTimetable.map((t) => `${t.subject} (${t.startTime}–${t.endTime})`).join('; ');
    return {
      room,
      isAvailable: false,
      status: 'OCCUPIED_TIMETABLE',
      explanation: `Scheduled class overlaps requested interval: ${subjects}.`,
      physicalOccupancyNotice: PHYSICAL_OCCUPANCY_NOTICE,
      conflicts,
      pendingBookingsCount: overlappingPendingBookings.length,
    };
  }

  if (overlappingApprovedBookings.length > 0) {
    const bookingsSummary = overlappingApprovedBookings
      .map((b) => `Approved booking ${b.bookingId} (${b.startTime}–${b.endTime})`)
      .join('; ');
    return {
      room,
      isAvailable: false,
      status: 'OCCUPIED_BOOKING',
      explanation: `Blocked by an approved student booking: ${bookingsSummary}.`,
      physicalOccupancyNotice: PHYSICAL_OCCUPANCY_NOTICE,
      conflicts,
      pendingBookingsCount: overlappingPendingBookings.length,
    };
  }

  const pendingNote =
    overlappingPendingBookings.length > 0
      ? ` Note: ${overlappingPendingBookings.length} unapproved pending request(s) exist for this slot and do not block availability.`
      : '';

  return {
    room,
    isAvailable: true,
    status: 'SCHEDULE_VACANT',
    explanation: `Schedule-vacant from ${query.startTime} to ${query.endTime} on ${query.date} (no timetable, approved booking, or restriction overlap).${pendingNote}`,
    physicalOccupancyNotice: PHYSICAL_OCCUPANCY_NOTICE,
    conflicts,
    pendingBookingsCount: overlappingPendingBookings.length,
  };
}

/**
 * Validates query date, time strings, time ordering, and capacity.
 */
export function validateAvailabilityQuery(query: AvailabilityQuery): void {
  if (!isValidDateString(query.date)) {
    throw new AvailabilityValidationError(
      `Invalid date "${query.date}". Expected a valid YYYY-MM-DD calendar date.`,
    );
  }
  if (!isValidTimeRange(query.startTime, query.endTime)) {
    throw new AvailabilityValidationError(
      `Invalid time range (${query.startTime} to ${query.endTime}). Start time must be strictly earlier than end time in HH:mm format.`,
    );
  }
  if (!Number.isFinite(query.minCapacity) || query.minCapacity < 1) {
    throw new AvailabilityValidationError('Minimum capacity must be at least 1.');
  }
}

/**
 * Filters rooms by optional block, floor, and required facilities, then evaluates availability.
 * Results are ordered with schedule-vacant rooms first, then by block and room number.
 */
export function queryRoomAvailability(
  query: AvailabilityQuery,
  dataset: AvailabilityDataset,
): RoomAvailabilityResult[] {
  validateAvailabilityQuery(query);

  const filteredRooms = dataset.rooms.filter((room) => {
    if (query.blockId && room.blockId !== query.blockId) {
      return false;
    }
    if (query.floor !== undefined && room.floor !== query.floor) {
      return false;
    }
    if (query.facilities && query.facilities.length > 0) {
      const hasAllFacilities = query.facilities.every((fac) => room.facilities.includes(fac));
      if (!hasAllFacilities) {
        return false;
      }
    }
    return true;
  });

  const results = filteredRooms.map((room) => evaluateRoomAvailability(room, query, dataset));

  return results.sort((a, b) => {
    if (a.isAvailable !== b.isAvailable) {
      return a.isAvailable ? -1 : 1;
    }
    if (a.room.blockId !== b.room.blockId) {
      return a.room.blockId.localeCompare(b.room.blockId);
    }
    return a.room.roomNumber.localeCompare(b.room.roomNumber);
  });
}

/**
 * Detects overlapping timetable entries for the same room on the same date.
 */
export function findOverlappingTimetableEntries(
  entries: TimetableEntry[],
  candidate: Pick<TimetableEntry, 'roomId' | 'date' | 'startTime' | 'endTime'>,
  excludeScheduleId?: string,
): TimetableEntry[] {
  if (!isValidDateString(candidate.date) || !isValidTimeRange(candidate.startTime, candidate.endTime)) {
    throw new AvailabilityValidationError('Timetable entry must have a valid date and startTime < endTime.');
  }

  return entries.filter(
    (entry) =>
      entry.scheduleId !== excludeScheduleId &&
      entry.roomId === candidate.roomId &&
      entry.date === candidate.date &&
      intervalsOverlap(candidate.startTime, candidate.endTime, entry.startTime, entry.endTime),
  );
}
