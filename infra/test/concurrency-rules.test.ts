import {
  buildScheduleSortKey,
  buildSlotLockKeys,
  calculateTransactionActionCount,
  diffSlotLockKeys,
} from '../lib/concurrency/slot-locks';

describe('ClassSpace DynamoDB Concurrency Rules', () => {
  test('1-2. Half-open intervals [start, end) allow adjacent bookings without lock collision', () => {
    const slotA = buildSlotLockKeys('room-ece-201', '2026-11-19', '10:00', '11:00', 'BOOKING');
    const slotB = buildSlotLockKeys('room-ece-201', '2026-11-19', '11:00', '12:00', 'BOOKING');

    expect(slotA).toEqual([
      'room-ece-201#2026-11-19#10:00',
      'room-ece-201#2026-11-19#10:15',
      'room-ece-201#2026-11-19#10:30',
      'room-ece-201#2026-11-19#10:45',
    ]);
    expect(slotB).toEqual([
      'room-ece-201#2026-11-19#11:00',
      'room-ece-201#2026-11-19#11:15',
      'room-ece-201#2026-11-19#11:30',
      'room-ece-201#2026-11-19#11:45',
    ]);

    const overlap = slotA.filter((k) => slotB.includes(k));
    expect(overlap).toHaveLength(0);
  });

  test('3. Rejects intervals not aligned to 15-minute boundaries or start >= end', () => {
    expect(() =>
      buildSlotLockKeys('room-ece-201', '2026-11-19', '10:10', '11:00', 'BOOKING'),
    ).toThrow(/15-minute boundaries/i);

    expect(() =>
      buildSlotLockKeys('room-ece-201', '2026-11-19', '11:00', '11:00', 'BOOKING'),
    ).toThrow(/strictly earlier/i);
  });

  test('3b. Time-first scheduleKey orders TT and RES records chronologically', () => {
    const keys = [
      buildScheduleSortKey('14:00', 'TT', 'tt-02'),
      buildScheduleSortKey('10:00', 'RES', 'res-01'),
      buildScheduleSortKey('09:00', 'TT', 'tt-01'),
    ].sort();

    expect(keys).toEqual([
      '09:00#TT#tt-01',
      '10:00#RES#res-01',
      '14:00#TT#tt-02',
    ]);
  });

  test('4-5. Enforces 4-hour max for student bookings and 8-hour max for timetable/restrictions', () => {
    const fourHourBooking = buildSlotLockKeys(
      'room-ece-201',
      '2026-11-19',
      '09:00',
      '13:00',
      'BOOKING',
    );
    expect(fourHourBooking).toHaveLength(16);

    expect(() =>
      buildSlotLockKeys('room-ece-201', '2026-11-19', '09:00', '13:15', 'BOOKING'),
    ).toThrow(/exceeds maximum allowed/i);

    const eightHourTimetable = buildSlotLockKeys(
      'room-ece-201',
      '2026-11-19',
      '08:00',
      '16:00',
      'TIMETABLE',
    );
    expect(eightHourTimetable).toHaveLength(32);

    expect(() =>
      buildSlotLockKeys('room-ece-201', '2026-11-19', '08:00', '16:15', 'RESTRICTION'),
    ).toThrow(/exceeds maximum allowed/i);
  });

  test('9. Timetable updates calculate exact old/new lock diffs without touching unchanged slots', () => {
    const oldSlots = buildSlotLockKeys(
      'room-ece-201',
      '2026-11-19',
      '10:00',
      '11:00',
      'TIMETABLE',
    );
    const newSlots = buildSlotLockKeys(
      'room-ece-201',
      '2026-11-19',
      '10:30',
      '11:30',
      'TIMETABLE',
    );

    const diff = diffSlotLockKeys(oldSlots, newSlots);
    expect(diff.toDelete).toEqual([
      'room-ece-201#2026-11-19#10:00',
      'room-ece-201#2026-11-19#10:15',
    ]);
    expect(diff.unchanged).toEqual([
      'room-ece-201#2026-11-19#10:30',
      'room-ece-201#2026-11-19#10:45',
    ]);
    expect(diff.toInsert).toEqual([
      'room-ece-201#2026-11-19#11:00',
      'room-ece-201#2026-11-19#11:15',
    ]);
  });

  test('29. Validates exact TransactWriteItems action counts (18 for 4h booking, 34 for 8h timetable, <=100 limit)', () => {
    const bookingSlots = buildSlotLockKeys(
      'room-ece-201',
      '2026-11-19',
      '09:00',
      '13:00',
      'BOOKING',
    );
    const bookingActions = calculateTransactionActionCount({
      slotClaimActions: bookingSlots.length,
      scheduleOrBookingWrites: 1,
      roomConditionChecks: 1,
    });
    expect(bookingActions).toBe(18);

    const timetableSlots = buildSlotLockKeys(
      'room-ece-201',
      '2026-11-19',
      '08:00',
      '16:00',
      'TIMETABLE',
    );
    const timetableActions = calculateTransactionActionCount({
      slotClaimActions: timetableSlots.length,
      scheduleOrBookingWrites: 1,
      roomConditionChecks: 1,
    });
    expect(timetableActions).toBe(34);

    expect(() =>
      calculateTransactionActionCount({
        slotClaimActions: 99,
        scheduleOrBookingWrites: 1,
        roomConditionChecks: 1,
      }),
    ).toThrow(/exceeds limit \(100\)/i);
  });
});
