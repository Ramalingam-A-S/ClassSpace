import { buildScheduleSortKey, buildSlotLockKeys } from '../lib/concurrency/slot-locks';
import {
  createDynamoDbRepositoryContext,
  DynamoDbKeys,
} from '../lambda/repositories/dynamodb/repository-context';
import { createInMemoryRepositoryContext } from '../lambda/repositories/memory/in-memory-context';
import { ApiError } from '../lambda/shared/api-error';

describe('Repository Contract, In-Memory Isolation & DynamoDB Boundary Tests', () => {
  test('16 & 17. In-memory repository enforces PK uniqueness, chronological schedules, and isolation across instances', async () => {
    const ctxA = createInMemoryRepositoryContext();
    const ctxB = createInMemoryRepositoryContext();

    await ctxA.rooms.create({
      roomId: 'room-ece-201',
      blockId: 'BLOCK-A',
      floor: 2,
      roomNumber: 'ECE-201',
      roomName: 'ECE Seminar 201',
      capacity: 60,
      facilities: ['Projector'],
      active: true,
      dataSource: 'DEMO',
      createdAt: '2026-11-19T10:00:00Z',
      updatedAt: '2026-11-19T10:00:00Z',
    });

    // Isolated instance ctxB must not see ctxA's room
    expect(await ctxB.rooms.getById('room-ece-201')).toBeNull();

    // Duplicate roomId or block+roomNumber rejected with 409 CONFLICT
    await expect(
      ctxA.rooms.create({
        roomId: 'room-ece-201',
        blockId: 'BLOCK-A',
        floor: 2,
        roomNumber: 'ECE-201',
        roomName: 'ECE Seminar 201',
        capacity: 60,
        facilities: ['Projector'],
        active: true,
        dataSource: 'DEMO',
        createdAt: '2026-11-19T10:00:00Z',
        updatedAt: '2026-11-19T10:00:00Z',
      }),
    ).rejects.toThrow(ApiError);

    // Chronological schedule ordering across TIMETABLE and RESTRICTION
    await ctxA.schedules.create({
      scheduleId: 'tt-02',
      recordType: 'TIMETABLE',
      roomId: 'room-ece-201',
      date: '2026-11-19',
      startTime: '14:00',
      endTime: '15:00',
      label: 'Analog Comm',
      dataSource: 'DEMO',
    });
    await ctxA.schedules.create({
      scheduleId: 'res-01',
      recordType: 'RESTRICTION',
      roomId: 'room-ece-201',
      date: '2026-11-19',
      startTime: '10:00',
      endTime: '11:00',
      label: 'Projector service',
      dataSource: 'DEMO',
    });

    const daySchedules = await ctxA.schedules.getForRoomDate('room-ece-201', '2026-11-19');
    expect(daySchedules.map((s) => s.scheduleId)).toEqual(['res-01', 'tt-02']);

    // SlotLock claim, conflict detection, and conditional release
    const claim1 = await ctxA.slotLocks.claimSlots({
      locks: [
        {
          lockKey: 'room-ece-201#2026-11-19#10:00',
          roomId: 'room-ece-201',
          date: '2026-11-19',
          slotStart: '10:00',
          claimType: 'BOOKING',
          claimRefId: 'bk-1',
          createdAt: '2026-11-19T09:00:00Z',
        },
      ],
    });
    expect(claim1).toEqual({ acquired: true, conflictingLockKeys: [] });

    const claim2 = await ctxA.slotLocks.claimSlots({
      locks: [
        {
          lockKey: 'room-ece-201#2026-11-19#10:00',
          roomId: 'room-ece-201',
          date: '2026-11-19',
          slotStart: '10:00',
          claimType: 'TIMETABLE',
          claimRefId: 'tt-9',
          createdAt: '2026-11-19T09:01:00Z',
        },
      ],
    });
    expect(claim2).toEqual({
      acquired: false,
      conflictingLockKeys: ['room-ece-201#2026-11-19#10:00'],
    });

    // Wrong claimRefId must NOT release lock
    await ctxA.slotLocks.releaseSlots({
      lockKeys: ['room-ece-201#2026-11-19#10:00'],
      expectedClaimType: 'BOOKING',
      expectedClaimRefId: 'bk-wrong',
    });
    expect(
      await ctxA.slotLocks.getLocksForSlots(['room-ece-201#2026-11-19#10:00']),
    ).toHaveLength(1);

    // Matching claimRefId releases lock
    await ctxA.slotLocks.releaseSlots({
      lockKeys: ['room-ece-201#2026-11-19#10:00'],
      expectedClaimType: 'BOOKING',
      expectedClaimRefId: 'bk-1',
    });
    expect(
      await ctxA.slotLocks.getLocksForSlots(['room-ece-201#2026-11-19#10:00']),
    ).toHaveLength(0);
  });

  test('18 & 19. DynamoDB adapter makes zero network calls during import/construction and aligns with slot-lock keys', async () => {
    const fakeClient = {
      send: jest.fn(async () => ({ Item: undefined, Items: [], Responses: {} })),
    };

    const dbCtx = createDynamoDbRepositoryContext({
      client: fakeClient as never,
      tables: {
        roomsTable: 'ClassSpaceRooms',
        schedulesTable: 'ClassSpaceSchedules',
        bookingsTable: 'ClassSpaceBookings',
        slotLocksTable: 'ClassSpaceSlotLocks',
      },
    });

    expect(fakeClient.send).not.toHaveBeenCalled();
    expect(dbCtx.supportsAtomicTransactions).toBe(true);

    // Verify key alignment with Phase 2.2 slot-locks contract
    expect(DynamoDbKeys.scheduleKey('09:00', 'TIMETABLE', 'tt-1')).toBe(
      buildScheduleSortKey('09:00', 'TT', 'tt-1'),
    );
    expect(DynamoDbKeys.lockKey('room-ece-201', '2026-11-19', '10:00')).toBe(
      buildSlotLockKeys('room-ece-201', '2026-11-19', '10:00', '10:15', 'BOOKING')[0],
    );

    // Empty claimSlots is a safe no-op without unnecessary DynamoDB network calls
    await expect(dbCtx.slotLocks.claimSlots({ locks: [] })).resolves.toEqual({
      acquired: true,
      conflictingLockKeys: [],
    });
    expect(fakeClient.send).not.toHaveBeenCalled();
  });
});
