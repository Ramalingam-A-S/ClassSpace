import { BatchGetCommand, GetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { createDynamoDbRepositoryContext } from '../lambda/repositories/dynamodb/repository-context';
import { createInMemoryRepositoryContext } from '../lambda/repositories/memory/in-memory-context';
import { AvailabilityService } from '../lambda/services/availability.service';
import { BookingService } from '../lambda/services/booking.service';
import { RoomService } from '../lambda/services/room.service';
import { ScheduleService } from '../lambda/services/schedule.service';
import { ApiError } from '../lambda/shared/api-error';

describe('ClassSpace Backend Concurrency, Slot Locks & DynamoDB Transactions', () => {
  async function seedRoom(repos: ReturnType<typeof createInMemoryRepositoryContext>) {
    const roomService = new RoomService(repos);
    return roomService.createRoom({
      blockId: 'BLOCK-A',
      floor: 1,
      roomNumber: 'A-101',
      roomName: 'Seminar Hall A-101',
      capacity: 60,
      facilities: ['Projector', 'Air Conditioning'],
      active: true,
    });
  }

  test('1. Two concurrent PENDING student booking requests for the same slot succeed without acquiring locks', async () => {
    const repos = createInMemoryRepositoryContext();
    await seedRoom(repos);
    const bookings = new BookingService(repos);
    const availability = new AvailabilityService(repos);

    const [first, second] = await Promise.all([
      bookings.createBooking('student-1', {
        roomId: 'block-a-a-101',
        date: '2026-11-25',
        startTime: '10:00',
        endTime: '11:00',
        purpose: 'Robotics Workshop Prep',
      }),
      bookings.createBooking('student-2', {
        roomId: 'block-a-a-101',
        date: '2026-11-25',
        startTime: '10:00',
        endTime: '11:00',
        purpose: 'Algorithm Study Group',
      }),
    ]);

    expect(first.booking.status).toBe('PENDING');
    expect(second.booking.status).toBe('PENDING');

    const search = await availability.searchAvailability({
      date: '2026-11-25',
      startTime: '10:00',
      endTime: '11:00',
      minCapacity: 30,
    });
    expect(search.availableRooms).toHaveLength(1);
    expect(search.availableRooms[0]?.pendingBookingsCount).toBe(2);
  });

  test('2. Concurrent admin approvals for overlapping PENDING bookings allow only one and return 409 CONFLICT for the loser', async () => {
    const repos = createInMemoryRepositoryContext();
    await seedRoom(repos);
    const bookings = new BookingService(repos);

    const reqA = await bookings.createBooking('student-1', {
      roomId: 'block-a-a-101',
      date: '2026-11-25',
      startTime: '10:00',
      endTime: '11:00',
      purpose: 'Team A Hackathon Practice',
    });
    const reqB = await bookings.createBooking('student-2', {
      roomId: 'block-a-a-101',
      date: '2026-11-25',
      startTime: '10:30',
      endTime: '11:30',
      purpose: 'Team B Debate Rehearsal',
    });

    const settled = await Promise.allSettled([
      bookings.approveBooking(reqA.booking.bookingId),
      bookings.approveBooking(reqB.booking.bookingId),
    ]);

    const fulfilled = settled.filter((r) => r.status === 'fulfilled');
    const rejected = settled.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    const err = (rejected[0] as PromiseRejectedResult).reason;
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).code).toBe('CONFLICT');
    expect((err as ApiError).statusCode).toBe(409);
  });

  test('3. Overlapping student booking request against an APPROVED booking is rejected (409) and slot reports OCCUPIED_BOOKING', async () => {
    const repos = createInMemoryRepositoryContext();
    await seedRoom(repos);
    const bookings = new BookingService(repos);
    const availability = new AvailabilityService(repos);

    const approvedReq = await bookings.createBooking('student-1', {
      roomId: 'block-a-a-101',
      date: '2026-11-25',
      startTime: '14:00',
      endTime: '15:00',
      purpose: 'IEEE Chapter Meeting',
    });
    await bookings.approveBooking(approvedReq.booking.bookingId);

    await expect(
      bookings.createBooking('student-2', {
        roomId: 'block-a-a-101',
        date: '2026-11-25',
        startTime: '14:30',
        endTime: '15:30',
        purpose: 'Conflicting Study Jam',
      }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      statusCode: 409,
    });

    const check = await availability.searchAvailability({
      date: '2026-11-25',
      startTime: '14:00',
      endTime: '15:00',
      minCapacity: 20,
    });
    expect(check.availableRooms).toHaveLength(0);
    expect(check.roomResults[0]?.status).toBe('OCCUPIED_BOOKING');
  });

  test('4. Cancelling an APPROVED booking releases ONLY its claimed locks and allows a subsequent booking to be approved', async () => {
    const repos = createInMemoryRepositoryContext();
    await seedRoom(repos);
    const bookings = new BookingService(repos);

    const first = await bookings.createBooking('student-1', {
      roomId: 'block-a-a-101',
      date: '2026-11-25',
      startTime: '09:00',
      endTime: '10:00',
      purpose: 'Morning Club Session',
    });
    await bookings.approveBooking(first.booking.bookingId);

    const cancelled = await bookings.cancelBooking(
      { userId: 'student-1', isAdminUser: false },
      first.booking.bookingId,
    );
    expect(cancelled.status).toBe('CANCELLED');

    const second = await bookings.createBooking('student-2', {
      roomId: 'block-a-a-101',
      date: '2026-11-25',
      startTime: '09:00',
      endTime: '10:00',
      purpose: 'Replacement Coding Session',
    });
    const secondApproved = await bookings.approveBooking(second.booking.bookingId);
    expect(secondApproved.status).toBe('APPROVED');
  });

  test('5. Deactivated room blocks new bookings and prevents approval of stale PENDING requests', async () => {
    const repos = createInMemoryRepositoryContext();
    const room = await seedRoom(repos);
    const rooms = new RoomService(repos);
    const bookings = new BookingService(repos);
    const availability = new AvailabilityService(repos);

    const pending = await bookings.createBooking('student-1', {
      roomId: room.roomId,
      date: '2026-11-25',
      startTime: '11:00',
      endTime: '12:00',
      purpose: 'Seminar Rehearsal',
    });

    await rooms.updateRoom(room.roomId, { active: false });

    await expect(bookings.approveBooking(pending.booking.bookingId)).rejects.toMatchObject({
      code: 'CONFLICT',
      statusCode: 409,
    });

    await expect(
      bookings.createBooking('student-2', {
        roomId: room.roomId,
        date: '2026-11-25',
        startTime: '12:00',
        endTime: '13:00',
        purpose: 'Fresh Request On Inactive Room',
      }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      statusCode: 409,
    });

    const evalRes = await availability.searchAvailability({
      date: '2026-11-25',
      startTime: '11:00',
      endTime: '12:00',
      minCapacity: 10,
    });
    expect(evalRes.availableRooms).toHaveLength(0);
    expect(evalRes.roomResults[0]?.status).toBe('INACTIVE');
  });

  test('6. Admin restriction claims slot locks, marks room RESTRICTED, and blocks booking submissions/approvals', async () => {
    const repos = createInMemoryRepositoryContext();
    await seedRoom(repos);
    const schedules = new ScheduleService(repos);
    const bookings = new BookingService(repos);
    const availability = new AvailabilityService(repos);

    const stalePending = await bookings.createBooking('student-1', {
      roomId: 'block-a-a-101',
      date: '2026-11-25',
      startTime: '15:00',
      endTime: '16:00',
      purpose: 'Student Club Talk',
    });

    await schedules.createRestriction({
      roomId: 'block-a-a-101',
      date: '2026-11-25',
      startTime: '15:00',
      endTime: '17:00',
      reason: 'Department Examination Hall Allocation',
    });

    await expect(bookings.approveBooking(stalePending.booking.bookingId)).rejects.toMatchObject({
      code: 'CONFLICT',
      statusCode: 409,
    });

    const evalRes = await availability.searchAvailability({
      date: '2026-11-25',
      startTime: '15:00',
      endTime: '16:00',
      minCapacity: 10,
    });
    expect(evalRes.roomResults[0]?.status).toBe('RESTRICTED');
  });

  test('7 & 8. Timetable updates reject conflicting APPROVED slots (409) and keep diffed locks clean', async () => {
    const repos = createInMemoryRepositoryContext();
    await seedRoom(repos);
    const schedules = new ScheduleService(repos);
    const bookings = new BookingService(repos);

    const tt = await schedules.upsertTimetableEntry({
      roomId: 'block-a-a-101',
      date: '2026-11-25',
      startTime: '08:00',
      endTime: '09:00',
      subject: 'CS301 Operating Systems (Demo)',
    });

    const booking = await bookings.createBooking('student-1', {
      roomId: 'block-a-a-101',
      date: '2026-11-25',
      startTime: '09:00',
      endTime: '10:00',
      purpose: 'Project Demo Prep',
    });
    await bookings.approveBooking(booking.booking.bookingId);

    // Expanding timetable into 09:00–10:00 conflicts with the APPROVED booking
    await expect(
      schedules.upsertTimetableEntry({
        scheduleId: tt.scheduleId,
        roomId: 'block-a-a-101',
        date: '2026-11-25',
        startTime: '08:00',
        endTime: '10:00',
        subject: 'CS301 Extended Lab',
      }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      statusCode: 409,
    });

    // Updating timetable within free slots (e.g. shifting 08:00-09:00 -> 08:30-09:00) succeeds
    const shrunk = await schedules.upsertTimetableEntry({
      scheduleId: tt.scheduleId,
      roomId: 'block-a-a-101',
      date: '2026-11-25',
      startTime: '08:30',
      endTime: '09:00',
      subject: 'CS301 Short Tutorial',
    });
    expect(shrunk.startTime).toBe('08:30');
  });

  test('9. Idempotent booking creation replays same bookingId on retry and throws 409 if payload mutates', async () => {
    const repos = createInMemoryRepositoryContext();
    await seedRoom(repos);
    const bookings = new BookingService(repos);

    const first = await bookings.createBooking(
      'student-1',
      {
        roomId: 'block-a-a-101',
        date: '2026-11-25',
        startTime: '13:00',
        endTime: '14:00',
        purpose: 'Design Review',
      },
      'idem-req-001',
    );
    expect(first.idempotentReplay).toBe(false);

    const replay = await bookings.createBooking(
      'student-1',
      {
        roomId: 'block-a-a-101',
        date: '2026-11-25',
        startTime: '13:00',
        endTime: '14:00',
        purpose: 'Design Review',
      },
      'idem-req-001',
    );
    expect(replay.idempotentReplay).toBe(true);
    expect(replay.booking.bookingId).toBe(first.booking.bookingId);

    await expect(
      bookings.createBooking(
        'student-1',
        {
          roomId: 'block-a-a-101',
          date: '2026-11-25',
          startTime: '13:00',
          endTime: '14:00',
          purpose: 'Different Purpose With Reused Key',
        },
        'idem-req-001',
      ),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      statusCode: 409,
    });
  });

  test('10. DynamoDB repository emits exact TransactWriteCommand payloads and maps TransactionCanceledException to 409 CONFLICT', async () => {
    const sentCommands: unknown[] = [];
    const mockClient = {
      send: jest.fn(async (cmd: unknown) => {
        sentCommands.push(cmd);
        if (cmd instanceof GetCommand) {
          if (cmd.input.TableName === 'ClassSpaceBookings') {
            return {
              Item: {
                bookingId: 'bkg-1',
                roomId: 'block-a-a-101',
                studentId: 'student-1',
                purpose: 'Hackathon Team Sync',
                date: '2026-11-25',
                startTime: '10:00',
                endTime: '10:30',
                status: 'PENDING',
                createdAt: '2026-11-19T00:00:00.000Z',
                updatedAt: '2026-11-19T00:00:00.000Z',
                dataSource: 'ADMIN_ENTERED',
              },
            };
          }
          if (cmd.input.TableName === 'ClassSpaceRooms') {
            return {
              Item: {
                roomId: 'block-a-a-101',
                blockId: 'BLOCK-A',
                floor: 1,
                roomNumber: 'A-101',
                roomName: 'Room A-101',
                capacity: 60,
                facilities: ['Projector'],
                active: true,
                dataSource: 'ADMIN_ENTERED',
                createdAt: '2026-11-19T00:00:00.000Z',
                updatedAt: '2026-11-19T00:00:00.000Z',
              },
            };
          }
        }
        if (cmd instanceof BatchGetCommand) {
          return { Responses: { ClassSpaceSlotLocks: [] } };
        }
        if (cmd instanceof TransactWriteCommand) {
          return {};
        }
        return {};
      }),
    };

    const dynamoRepos = createDynamoDbRepositoryContext({
      client: mockClient as unknown as Parameters<typeof createDynamoDbRepositoryContext>[0]['client'],
      tables: {
        roomsTable: 'ClassSpaceRooms',
        schedulesTable: 'ClassSpaceSchedules',
        bookingsTable: 'ClassSpaceBookings',
        slotLocksTable: 'ClassSpaceSlotLocks',
      },
    });

    const service = new BookingService(dynamoRepos);
    const approved = await service.approveBooking('bkg-1');
    expect(approved.status).toBe('APPROVED');

    const txCmd = sentCommands.find(
      (c): c is TransactWriteCommand => c instanceof TransactWriteCommand,
    );
    expect(txCmd).toBeDefined();
    // 1 Room ConditionCheck + 1 Booking Update + 2 SlotLock Puts (10:00 and 10:15) = 4 items
    expect(txCmd?.input.TransactItems).toHaveLength(4);
    expect(txCmd?.input.TransactItems?.[0]).toMatchObject({
      ConditionCheck: {
        TableName: 'ClassSpaceRooms',
        ConditionExpression: 'attribute_exists(roomId) AND active = :trueVal',
      },
    });
    expect(txCmd?.input.TransactItems?.[1]).toMatchObject({
      Update: {
        TableName: 'ClassSpaceBookings',
        ConditionExpression: '#st = :pending',
      },
    });
    expect(txCmd?.input.TransactItems?.[2]).toMatchObject({
      Put: {
        TableName: 'ClassSpaceSlotLocks',
        ConditionExpression: 'attribute_not_exists(lockKey)',
      },
    });

    // Now simulate TransactionCanceledException on second approval attempt
    (mockClient.send as jest.Mock).mockImplementationOnce(async () => ({
      Item: {
        bookingId: 'bkg-1',
        roomId: 'block-a-a-101',
        studentId: 'student-1',
        purpose: 'Hackathon Team Sync',
        date: '2026-11-25',
        startTime: '10:00',
        endTime: '10:30',
        status: 'PENDING',
        createdAt: '2026-11-19T00:00:00.000Z',
        updatedAt: '2026-11-19T00:00:00.000Z',
        dataSource: 'ADMIN_ENTERED',
      },
    }));
    (mockClient.send as jest.Mock).mockImplementationOnce(async () => ({
      Item: {
        roomId: 'block-a-a-101',
        active: true,
      },
    }));
    (mockClient.send as jest.Mock).mockRejectedValueOnce({
      name: 'TransactionCanceledException',
      CancellationReasons: [{ Code: 'None' }, { Code: 'None' }, { Code: 'ConditionalCheckFailed' }],
    });

    await expect(service.approveBooking('bkg-1')).rejects.toMatchObject({
      code: 'CONFLICT',
      statusCode: 409,
    });
  });
});
