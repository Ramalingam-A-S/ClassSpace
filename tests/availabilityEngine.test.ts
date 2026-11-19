import { describe, expect, it } from 'vitest';
import { createDemoSeedData } from '../src/data/demoData';
import {
  AvailabilityValidationError,
  evaluateRoomAvailability,
  findOverlappingTimetableEntries,
  queryRoomAvailability,
} from '../src/services/availabilityEngine';
import { intervalsOverlap, isValidTimeRange } from '../src/utils/datetime';

const TEST_DATE = '2026-11-19';

describe('Availability Engine', () => {
  it('detects overlapping intervals accurately', () => {
    expect(intervalsOverlap('10:00', '11:00', '10:30', '11:30')).toBe(true);
    expect(intervalsOverlap('10:00', '12:00', '10:30', '11:00')).toBe(true);
    expect(intervalsOverlap('09:30', '10:01', '10:00', '11:00')).toBe(true);
  });

  it('allows adjacent non-overlapping time slots (10:00-11:00 and 11:00-12:00)', () => {
    expect(intervalsOverlap('10:00', '11:00', '11:00', '12:00')).toBe(false);
    expect(intervalsOverlap('11:00', '12:00', '10:00', '11:00')).toBe(false);

    const seed = createDemoSeedData(TEST_DATE);
    const ece201 = seed.rooms.find((r) => r.roomId === 'room-ece-201')!;
    // ece-201 has timetable 09:00-10:00 on TEST_DATE
    const result = evaluateRoomAvailability(
      ece201,
      { date: TEST_DATE, startTime: '10:00', endTime: '11:00', minCapacity: 1 },
      seed,
    );
    expect(result.isAvailable).toBe(true);
    expect(result.status).toBe('SCHEDULE_VACANT');
  });

  it('rejects invalid time ranges and start times not earlier than end times', () => {
    expect(isValidTimeRange('11:00', '10:00')).toBe(false);
    expect(isValidTimeRange('10:00', '10:00')).toBe(false);
    expect(isValidTimeRange('25:00', '26:00')).toBe(false);

    const seed = createDemoSeedData(TEST_DATE);
    expect(() =>
      queryRoomAvailability(
        { date: TEST_DATE, startTime: '12:00', endTime: '11:00', minCapacity: 10 },
        seed,
      ),
    ).toThrow(AvailabilityValidationError);

    expect(() =>
      queryRoomAvailability(
        { date: '2026-02-30', startTime: '10:00', endTime: '11:00', minCapacity: 10 },
        seed,
      ),
    ).toThrow(AvailabilityValidationError);
  });

  it('excludes rooms below minimum requested capacity', () => {
    const seed = createDemoSeedData(TEST_DATE);
    const results = queryRoomAvailability(
      { date: TEST_DATE, startTime: '12:00', endTime: '13:00', minCapacity: 100 },
      seed,
    );
    const availableIds = results.filter((r) => r.isAvailable).map((r) => r.room.roomId);
    expect(availableIds).toEqual(['room-sem-301']);

    const ece201Result = results.find((r) => r.room.roomId === 'room-ece-201')!;
    expect(ece201Result.isAvailable).toBe(false);
    expect(ece201Result.status).toBe('INSUFFICIENT_CAPACITY');
  });

  it('flags timetable conflicts and detects overlapping timetable entries for the same room', () => {
    const seed = createDemoSeedData(TEST_DATE);
    const cse101 = seed.rooms.find((r) => r.roomId === 'room-cse-101')!;
    // cse-101 has timetable 10:00-11:30
    const result = evaluateRoomAvailability(
      cse101,
      { date: TEST_DATE, startTime: '10:30', endTime: '11:30', minCapacity: 10 },
      seed,
    );
    expect(result.isAvailable).toBe(false);
    expect(result.status).toBe('OCCUPIED_TIMETABLE');
    expect(result.conflicts.timetable).toHaveLength(1);

    const overlaps = findOverlappingTimetableEntries(seed.timetable, {
      roomId: 'room-cse-101',
      date: TEST_DATE,
      startTime: '11:00',
      endTime: '12:00',
    });
    expect(overlaps).toHaveLength(1);

    const noOverlaps = findOverlappingTimetableEntries(seed.timetable, {
      roomId: 'room-cse-101',
      date: TEST_DATE,
      startTime: '11:30',
      endTime: '12:30',
    });
    expect(noOverlaps).toHaveLength(0);
  });

  it('blocks availability when an approved booking overlaps', () => {
    const seed = createDemoSeedData(TEST_DATE);
    const mech204 = seed.rooms.find((r) => r.roomId === 'room-mech-204')!;
    // mech-204 has APPROVED booking 10:00-11:00
    const result = evaluateRoomAvailability(
      mech204,
      { date: TEST_DATE, startTime: '10:15', endTime: '10:45', minCapacity: 10 },
      seed,
    );
    expect(result.isAvailable).toBe(false);
    expect(result.status).toBe('OCCUPIED_BOOKING');
    expect(result.conflicts.approvedBookings).toHaveLength(1);
  });

  it('does NOT count pending or rejected bookings as blocking availability', () => {
    const seed = createDemoSeedData(TEST_DATE);
    const ece201 = seed.rooms.find((r) => r.roomId === 'room-ece-201')!;
    // ece-201 has PENDING booking 11:00-12:00
    const result = evaluateRoomAvailability(
      ece201,
      { date: TEST_DATE, startTime: '11:00', endTime: '12:00', minCapacity: 20 },
      seed,
    );
    expect(result.isAvailable).toBe(true);
    expect(result.status).toBe('SCHEDULE_VACANT');
    expect(result.pendingBookingsCount).toBe(1);
  });

  it('excludes restricted rooms with explicit restriction reason', () => {
    const seed = createDemoSeedData(TEST_DATE);
    const ece202 = seed.rooms.find((r) => r.roomId === 'room-ece-202')!;
    // ece-202 restricted 10:00-12:30
    const result = evaluateRoomAvailability(
      ece202,
      { date: TEST_DATE, startTime: '11:00', endTime: '12:00', minCapacity: 10 },
      seed,
    );
    expect(result.isAvailable).toBe(false);
    expect(result.status).toBe('RESTRICTED');
    expect(result.explanation).toContain('Restricted');
  });

  it('excludes inactive rooms', () => {
    const seed = createDemoSeedData(TEST_DATE);
    const arc105 = seed.rooms.find((r) => r.roomId === 'room-arc-105')!;
    const result = evaluateRoomAvailability(
      arc105,
      { date: TEST_DATE, startTime: '11:00', endTime: '12:00', minCapacity: 10 },
      seed,
    );
    expect(result.isAvailable).toBe(false);
    expect(result.status).toBe('INACTIVE');
  });

  it('filters by block, floor, and multiple facilities', () => {
    const seed = createDemoSeedData(TEST_DATE);
    const results = queryRoomAvailability(
      {
        date: TEST_DATE,
        startTime: '12:00',
        endTime: '13:00',
        minCapacity: 30,
        blockId: 'BLOCK-A',
        floor: 1,
        facilities: ['Air Conditioning', 'Smart Board'],
      },
      seed,
    );
    expect(results).toHaveLength(1);
    expect(results[0]?.room.roomNumber).toBe('CSE-101');
    expect(results[0]?.isAvailable).toBe(true);
  });
});
