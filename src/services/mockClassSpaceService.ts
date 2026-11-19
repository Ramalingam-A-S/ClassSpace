import type {
  ActivityEvent,
  AvailabilityQuery,
  Booking,
  BookingStatus,
  Room,
  RoomAvailabilityResult,
  RoomRestriction,
  TimetableEntry,
} from '../types/domain';
import type {
  AdminDashboardSnapshot,
  CreateBookingInput,
  CreateRestrictionInput,
  CreateRoomInput,
  IClassSpaceService,
  RoomDetailsResponse,
  UpdateRoomInput,
  UpsertTimetableInput,
} from './contracts';
import {
  evaluateRoomAvailability,
  findOverlappingTimetableEntries,
  queryRoomAvailability,
  validateAvailabilityQuery,
} from './availabilityEngine';
import { LocalMockRepository, mockRepository } from './mockRepository';
import { isValidDateString, isValidTimeRange } from '../utils/datetime';

function generateDemoId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 7);
  return `${prefix}-demo-${Date.now().toString(36)}-${rand}`;
}

export class MockClassSpaceService implements IClassSpaceService {
  private readonly repo: LocalMockRepository;

  constructor(repo: LocalMockRepository = mockRepository) {
    this.repo = repo;
  }

  private appendActivity(
    activities: ActivityEvent[],
    type: ActivityEvent['type'],
    message: string,
    dataSource: ActivityEvent['dataSource'] = 'DEMO',
  ): ActivityEvent[] {
    const event: ActivityEvent = {
      id: generateDemoId('act'),
      timestamp: new Date().toISOString(),
      type,
      message,
      dataSource,
    };
    return [event, ...activities].slice(0, 20);
  }

  async listRooms(): Promise<Room[]> {
    const data = this.repo.load();
    return [...data.rooms].sort((a, b) =>
      a.blockId === b.blockId
        ? a.roomNumber.localeCompare(b.roomNumber)
        : a.blockId.localeCompare(b.blockId),
    );
  }

  async getAvailableRooms(query: AvailabilityQuery): Promise<RoomAvailabilityResult[]> {
    const data = this.repo.load();
    return queryRoomAvailability(query, data);
  }

  async getRoomDetails(roomId: string, date: string): Promise<RoomDetailsResponse | null> {
    if (!isValidDateString(date)) {
      throw new Error(`Invalid date "${date}".`);
    }
    const data = this.repo.load();
    const room = data.rooms.find((r) => r.roomId === roomId);
    if (!room) return null;

    const timetable = data.timetable
      .filter((t) => t.roomId === roomId && t.date === date)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));

    const dayBookings = data.bookings
      .filter((b) => b.roomId === roomId && b.date === date)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));

    const approvedBookings = dayBookings.filter((b) => b.status === 'APPROVED');
    const pendingBookings = dayBookings.filter((b) => b.status === 'PENDING');

    const restrictions = data.restrictions
      .filter((r) => r.roomId === roomId && r.date === date)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));

    return {
      room,
      date,
      timetable,
      approvedBookings,
      pendingBookings,
      restrictions,
    };
  }

  async createBooking(input: CreateBookingInput): Promise<Booking> {
    if (!isValidDateString(input.date)) {
      throw new Error('Booking date must be a valid YYYY-MM-DD date.');
    }
    if (!isValidTimeRange(input.startTime, input.endTime)) {
      throw new Error('Booking start time must be earlier than end time.');
    }

    const data = this.repo.load();
    const room = data.rooms.find((r) => r.roomId === input.roomId);
    if (!room) {
      throw new Error('Selected classroom was not found.');
    }

    const check = evaluateRoomAvailability(
      room,
      {
        date: input.date,
        startTime: input.startTime,
        endTime: input.endTime,
        minCapacity: 1,
      },
      data,
    );

    if (!check.isAvailable) {
      throw new Error(`Cannot request booking: ${check.explanation}`);
    }

    const booking: Booking = {
      bookingId: generateDemoId('bk'),
      roomId: input.roomId,
      studentId: input.studentId,
      studentName: input.studentName,
      purpose: input.purpose.trim(),
      date: input.date,
      startTime: input.startTime,
      endTime: input.endTime,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
      dataSource: 'DEMO',
    };

    data.bookings = [booking, ...data.bookings];
    data.activities = this.appendActivity(
      data.activities,
      'BOOKING_CREATED',
      `New demo request for ${room.blockId} / ${room.roomNumber} on ${input.date} (${input.startTime}–${input.endTime}).`,
      'DEMO',
    );
    this.repo.save(data);
    return booking;
  }

  async getMyBookings(studentId: string): Promise<Booking[]> {
    const data = this.repo.load();
    return data.bookings
      .filter((b) => b.studentId === studentId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async listAllBookings(): Promise<Booking[]> {
    const data = this.repo.load();
    return [...data.bookings].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async listTimetableEntries(): Promise<TimetableEntry[]> {
    const data = this.repo.load();
    return [...data.timetable].sort((a, b) =>
      a.date === b.date ? a.startTime.localeCompare(b.startTime) : a.date.localeCompare(b.date),
    );
  }

  async listRestrictions(): Promise<RoomRestriction[]> {
    const data = this.repo.load();
    return [...data.restrictions].sort((a, b) =>
      a.date === b.date ? a.startTime.localeCompare(b.startTime) : a.date.localeCompare(b.date),
    );
  }

  async getAdminSnapshot(
    date: string,
    startTime: string,
    endTime: string,
  ): Promise<AdminDashboardSnapshot> {
    validateAvailabilityQuery({ date, startTime, endTime, minCapacity: 1 });
    const data = this.repo.load();

    const evaluations = data.rooms.map((room) =>
      evaluateRoomAvailability(room, { date, startTime, endTime, minCapacity: 1 }, data),
    );

    const scheduleVacantCount = evaluations.filter((e) => e.status === 'SCHEDULE_VACANT').length;
    const restrictedRoomsCount = evaluations.filter((e) => e.status === 'RESTRICTED').length;

    return {
      totalRooms: data.rooms.length,
      activeRooms: data.rooms.filter((r) => r.active).length,
      scheduleVacantCount,
      pendingBookingsCount: data.bookings.filter((b) => b.status === 'PENDING').length,
      approvedBookingsCount: data.bookings.filter((b) => b.status === 'APPROVED').length,
      restrictedRoomsCount,
      recentActivities: data.activities,
    };
  }

  async updateBookingStatus(
    bookingId: string,
    status: Extract<BookingStatus, 'APPROVED' | 'REJECTED' | 'CANCELLED'>,
  ): Promise<Booking> {
    const data = this.repo.load();
    const index = data.bookings.findIndex((b) => b.bookingId === bookingId);
    if (index === -1) {
      throw new Error('Booking request not found.');
    }

    const existing = data.bookings[index]!;
    const room = data.rooms.find((r) => r.roomId === existing.roomId);

    if (status === 'APPROVED') {
      if (!room) {
        throw new Error('Associated classroom no longer exists.');
      }
      const otherBookings = data.bookings.filter((b) => b.bookingId !== bookingId);
      const check = evaluateRoomAvailability(
        room,
        {
          date: existing.date,
          startTime: existing.startTime,
          endTime: existing.endTime,
          minCapacity: 1,
        },
        {
          timetable: data.timetable,
          bookings: otherBookings,
          restrictions: data.restrictions,
        },
      );
      if (!check.isAvailable) {
        throw new Error(`Cannot approve booking due to conflict: ${check.explanation}`);
      }
    }

    const updated: Booking = { ...existing, status };
    data.bookings[index] = updated;
    const roomLabel = room ? `${room.blockId} / ${room.roomNumber}` : existing.roomId;
    const activityType = status === 'APPROVED' ? 'BOOKING_APPROVED' : 'BOOKING_REJECTED';
    data.activities = this.appendActivity(
      data.activities,
      activityType,
      `Booking ${bookingId} for ${roomLabel} (${existing.date} ${existing.startTime}–${existing.endTime}) marked ${status}.`,
      'DEMO',
    );
    this.repo.save(data);
    return updated;
  }

  async createRoom(input: CreateRoomInput): Promise<Room> {
    const data = this.repo.load();
    const normalizedBlock = input.blockId.trim().toUpperCase();
    const normalizedNumber = input.roomNumber.trim().toUpperCase();

    const duplicate = data.rooms.some(
      (r) => r.blockId === normalizedBlock && r.roomNumber === normalizedNumber,
    );
    if (duplicate) {
      throw new Error(`Room ${normalizedBlock} / ${normalizedNumber} already exists.`);
    }

    const room: Room = {
      roomId: generateDemoId('room'),
      blockId: normalizedBlock,
      floor: input.floor,
      roomNumber: normalizedNumber,
      capacity: input.capacity,
      facilities: [...input.facilities],
      active: input.active,
      dataSource: 'DEMO',
    };

    data.rooms = [...data.rooms, room];
    data.activities = this.appendActivity(
      data.activities,
      'ROOM_UPDATED',
      `Added classroom ${room.blockId} / ${room.roomNumber} (Capacity: ${room.capacity}).`,
      'DEMO',
    );
    this.repo.save(data);
    return room;
  }

  async updateRoom(roomId: string, input: UpdateRoomInput): Promise<Room> {
    const data = this.repo.load();
    const index = data.rooms.findIndex((r) => r.roomId === roomId);
    if (index === -1) {
      throw new Error('Classroom not found.');
    }

    const existing = data.rooms[index]!;
    const nextBlock = (input.blockId ?? existing.blockId).trim().toUpperCase();
    const nextNumber = (input.roomNumber ?? existing.roomNumber).trim().toUpperCase();

    const duplicate = data.rooms.some(
      (r) => r.roomId !== roomId && r.blockId === nextBlock && r.roomNumber === nextNumber,
    );
    if (duplicate) {
      throw new Error(`Another classroom with identifier ${nextBlock} / ${nextNumber} already exists.`);
    }

    const updated: Room = {
      ...existing,
      ...input,
      blockId: nextBlock,
      roomNumber: nextNumber,
      facilities: input.facilities ? [...input.facilities] : existing.facilities,
      dataSource: 'DEMO',
    };

    data.rooms[index] = updated;
    data.activities = this.appendActivity(
      data.activities,
      'ROOM_UPDATED',
      `Updated ${updated.blockId} / ${updated.roomNumber} (${updated.active ? 'Active' : 'Inactive'}, ${updated.capacity} seats).`,
      'DEMO',
    );
    this.repo.save(data);
    return updated;
  }

  async upsertTimetableEntry(input: UpsertTimetableInput): Promise<TimetableEntry> {
    if (!isValidDateString(input.date)) {
      throw new Error('Timetable date must be a valid YYYY-MM-DD date.');
    }
    if (!isValidTimeRange(input.startTime, input.endTime)) {
      throw new Error('Timetable start time must be earlier than end time.');
    }

    const data = this.repo.load();
    const room = data.rooms.find((r) => r.roomId === input.roomId);
    if (!room) {
      throw new Error('Selected classroom does not exist.');
    }

    const overlaps = findOverlappingTimetableEntries(
      data.timetable,
      {
        roomId: input.roomId,
        date: input.date,
        startTime: input.startTime,
        endTime: input.endTime,
      },
      input.scheduleId,
    );

    if (overlaps.length > 0) {
      const conflictSummary = overlaps
        .map((o) => `${o.subject} (${o.startTime}–${o.endTime})`)
        .join(', ');
      throw new Error(
        `Overlapping timetable entry detected for ${room.blockId} / ${room.roomNumber} on ${input.date}: ${conflictSummary}.`,
      );
    }

    let savedEntry: TimetableEntry;
    if (input.scheduleId) {
      const index = data.timetable.findIndex((t) => t.scheduleId === input.scheduleId);
      if (index === -1) {
        throw new Error('Timetable entry to edit was not found.');
      }
      savedEntry = {
        scheduleId: input.scheduleId,
        roomId: input.roomId,
        date: input.date,
        startTime: input.startTime,
        endTime: input.endTime,
        subject: input.subject.trim(),
        dataSource: 'DEMO',
      };
      data.timetable[index] = savedEntry;
    } else {
      savedEntry = {
        scheduleId: generateDemoId('tt'),
        roomId: input.roomId,
        date: input.date,
        startTime: input.startTime,
        endTime: input.endTime,
        subject: input.subject.trim(),
        dataSource: 'DEMO',
      };
      data.timetable = [...data.timetable, savedEntry];
    }

    data.activities = this.appendActivity(
      data.activities,
      'TIMETABLE_UPDATED',
      `${input.scheduleId ? 'Updated' : 'Added'} timetable slot for ${room.blockId} / ${room.roomNumber}: ${savedEntry.subject} (${savedEntry.date} ${savedEntry.startTime}–${savedEntry.endTime}).`,
      'DEMO',
    );
    this.repo.save(data);
    return savedEntry;
  }

  async deleteTimetableEntry(scheduleId: string): Promise<void> {
    const data = this.repo.load();
    const target = data.timetable.find((t) => t.scheduleId === scheduleId);
    if (!target) {
      throw new Error('Timetable entry not found.');
    }
    const room = data.rooms.find((r) => r.roomId === target.roomId);
    data.timetable = data.timetable.filter((t) => t.scheduleId !== scheduleId);
    data.activities = this.appendActivity(
      data.activities,
      'TIMETABLE_UPDATED',
      `Removed timetable slot "${target.subject}" for ${room ? `${room.blockId} / ${room.roomNumber}` : target.roomId}.`,
      'DEMO',
    );
    this.repo.save(data);
  }

  async createRestriction(input: CreateRestrictionInput): Promise<RoomRestriction> {
    if (!isValidDateString(input.date)) {
      throw new Error('Restriction date must be a valid YYYY-MM-DD date.');
    }
    if (!isValidTimeRange(input.startTime, input.endTime)) {
      throw new Error('Restriction start time must be earlier than end time.');
    }

    const data = this.repo.load();
    const room = data.rooms.find((r) => r.roomId === input.roomId);
    if (!room) {
      throw new Error('Selected classroom does not exist.');
    }

    const restriction: RoomRestriction = {
      restrictionId: generateDemoId('res'),
      roomId: input.roomId,
      date: input.date,
      startTime: input.startTime,
      endTime: input.endTime,
      reason: input.reason.trim(),
      dataSource: 'DEMO',
    };

    data.restrictions = [...data.restrictions, restriction];
    data.activities = this.appendActivity(
      data.activities,
      'RESTRICTION_ADDED',
      `Added restriction on ${room.blockId} / ${room.roomNumber} (${restriction.date} ${restriction.startTime}–${restriction.endTime}): ${restriction.reason}.`,
      'DEMO',
    );
    this.repo.save(data);
    return restriction;
  }

  async deleteRestriction(restrictionId: string): Promise<void> {
    const data = this.repo.load();
    const target = data.restrictions.find((r) => r.restrictionId === restrictionId);
    if (!target) {
      throw new Error('Restriction not found.');
    }
    data.restrictions = data.restrictions.filter((r) => r.restrictionId !== restrictionId);
    data.activities = this.appendActivity(
      data.activities,
      'RESTRICTION_ADDED',
      `Removed restriction ${restrictionId}.`,
      'DEMO',
    );
    this.repo.save(data);
  }

  async resetDemoData(): Promise<void> {
    this.repo.reset();
  }
}

export const classSpaceService: IClassSpaceService = new MockClassSpaceService();
