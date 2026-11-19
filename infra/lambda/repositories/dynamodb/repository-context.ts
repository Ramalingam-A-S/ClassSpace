import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  BatchGetCommand,
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { ApiError } from '../../shared/api-error';
import type { BookingRepository } from '../interfaces/booking.repository';
import type {
  BookingRecord,
  BookingStatus,
  RoomRecord,
  ScheduleRecord,
  ScheduleRecordType,
  SlotLockRecord,
} from '../interfaces/domain-models';
import type { RepositoryContext } from '../interfaces/repository-context';
import type { RoomRepository } from '../interfaces/room.repository';
import type { ScheduleRepository } from '../interfaces/schedule.repository';
import type { SlotLockRepository } from '../interfaces/slot-lock.repository';

export interface DynamoDbTableNames {
  readonly roomsTable: string;
  readonly schedulesTable: string;
  readonly bookingsTable: string;
  readonly slotLocksTable: string;
}

export interface DynamoDbRepositoryContextOptions {
  readonly client: DynamoDBDocumentClient;
  readonly tables: DynamoDbTableNames;
}

/**
 * Key-mapping helpers aligned strictly with the 4-table DynamoDB architecture:
 * - ClassSpaceRooms: PK roomId, GSI_BlockFloor (blockId / floorRoomKey)
 * - ClassSpaceSchedules: PK roomDateKey, SK scheduleKey (<startTime>#TT#<id> / <startTime>#RES#<id>)
 * - ClassSpaceBookings: PK bookingId, GSI_StudentBookings, GSI_RoomDateBookings
 * - ClassSpaceSlotLocks: PK lockKey (roomId#date#slotStartHHmm)
 */
export const DynamoDbKeys = {
  floorRoomKey: (floor: number, roomNumber: string): string =>
    `${String(floor).padStart(2, '0')}#${roomNumber}`,
  roomDateKey: (roomId: string, date: string): string => `${roomId}#${date}`,
  scheduleKey: (
    startTime: string,
    recordType: ScheduleRecordType,
    scheduleId: string,
  ): string => `${startTime}#${recordType === 'TIMETABLE' ? 'TT' : 'RES'}#${scheduleId}`,
  statusStartKey: (status: BookingStatus, startTime: string, bookingId: string): string =>
    `${status}#${startTime}#${bookingId}`,
  lockKey: (roomId: string, date: string, slotStartHHmm: string): string =>
    `${roomId}#${date}#${slotStartHHmm}`,
} as const;

/**
 * Creates a DynamoDBDocumentClient lazily only when invoked at Lambda runtime.
 * Never called during module import so unit tests never trigger credential resolution.
 */
export function createLazyDynamoDbDocumentClient(region: string): DynamoDBDocumentClient {
  const baseClient = new DynamoDBClient({ region });
  return DynamoDBDocumentClient.from(baseClient, {
    marshallOptions: { removeUndefinedValues: true },
  });
}

function notImplementedInPhase231(operation: string): never {
  throw new ApiError(
    'SERVICE_UNAVAILABLE',
    `${operation} transactional write implementation is deferred to Phase 2.3.2.`,
  );
}

/**
 * Phase 2.3.1 DynamoDB adapter boundary.
 * Accepts injected DynamoDBDocumentClient; never creates AWS clients at import time.
 */
export function createDynamoDbRepositoryContext(
  options: DynamoDbRepositoryContextOptions,
): RepositoryContext {
  const { client, tables } = options;

  const rooms: RoomRepository = {
    async getById(roomId) {
      const res = await client.send(
        new GetCommand({
          TableName: tables.roomsTable,
          Key: { roomId },
        }),
      );
      return (res.Item as RoomRecord | undefined) ?? null;
    },
    async listByBlock(blockId, queryOpts) {
      const limit = queryOpts?.limit ?? 25;
      const keyCondition =
        queryOpts?.floor !== undefined
          ? 'blockId = :blockId AND begins_with(floorRoomKey, :floorPrefix)'
          : 'blockId = :blockId';

      const exprValues: Record<string, unknown> = { ':blockId': blockId };
      if (queryOpts?.floor !== undefined) {
        exprValues[':floorPrefix'] = `${String(queryOpts.floor).padStart(2, '0')}#`;
      }

      const res = await client.send(
        new QueryCommand({
          TableName: tables.roomsTable,
          IndexName: 'GSI_BlockFloor',
          KeyConditionExpression: keyCondition,
          ExpressionAttributeValues: exprValues,
          Limit: limit,
        }),
      );

      const items = (res.Items ?? []) as RoomRecord[];
      return {
        items: queryOpts?.activeOnly ? items.filter((r) => r.active) : items,
      };
    },
    async create() {
      return notImplementedInPhase231('RoomRepository.create');
    },
    async update() {
      return notImplementedInPhase231('RoomRepository.update');
    },
    async deactivate() {
      return notImplementedInPhase231('RoomRepository.deactivate');
    },
  };

  const schedules: ScheduleRepository = {
    async getForRoomDate(roomId, date) {
      const res = await client.send(
        new QueryCommand({
          TableName: tables.schedulesTable,
          KeyConditionExpression: 'roomDateKey = :rdk',
          ExpressionAttributeValues: {
            ':rdk': DynamoDbKeys.roomDateKey(roomId, date),
          },
        }),
      );
      return (res.Items ?? []) as ScheduleRecord[];
    },
    async listForDate() {
      return notImplementedInPhase231('ScheduleRepository.listForDate');
    },
    async create() {
      return notImplementedInPhase231('ScheduleRepository.create');
    },
    async update() {
      return notImplementedInPhase231('ScheduleRepository.update');
    },
    async delete() {
      return notImplementedInPhase231('ScheduleRepository.delete');
    },
  };

  const bookings: BookingRepository = {
    async getById(bookingId) {
      const res = await client.send(
        new GetCommand({
          TableName: tables.bookingsTable,
          Key: { bookingId },
        }),
      );
      return (res.Item as BookingRecord | undefined) ?? null;
    },
    async listByStudent(studentId, queryOpts) {
      const limit = queryOpts?.limit ?? 25;
      const res = await client.send(
        new QueryCommand({
          TableName: tables.bookingsTable,
          IndexName: 'GSI_StudentBookings',
          KeyConditionExpression: 'studentId = :sid',
          ExpressionAttributeValues: { ':sid': studentId },
          ScanIndexForward: false,
          Limit: limit,
        }),
      );
      return { items: (res.Items ?? []) as BookingRecord[] };
    },
    async listByRoomDate(roomId, date, statusFilter) {
      const keyCondition = statusFilter
        ? 'roomDateKey = :rdk AND begins_with(statusStartKey, :statusPrefix)'
        : 'roomDateKey = :rdk';
      const exprValues: Record<string, unknown> = {
        ':rdk': DynamoDbKeys.roomDateKey(roomId, date),
        ...(statusFilter ? { ':statusPrefix': `${statusFilter}#` } : {}),
      };
      const res = await client.send(
        new QueryCommand({
          TableName: tables.bookingsTable,
          IndexName: 'GSI_RoomDateBookings',
          KeyConditionExpression: keyCondition,
          ExpressionAttributeValues: exprValues,
        }),
      );
      return (res.Items ?? []) as BookingRecord[];
    },
    async create() {
      return notImplementedInPhase231('BookingRepository.create');
    },
    async updateStatus() {
      return notImplementedInPhase231('BookingRepository.updateStatus');
    },
  };

  const slotLocks: SlotLockRepository = {
    async getLocksForSlots(lockKeys) {
      if (lockKeys.length === 0) return [];
      const res = await client.send(
        new BatchGetCommand({
          RequestItems: {
            [tables.slotLocksTable]: {
              Keys: lockKeys.map((lockKey) => ({ lockKey })),
              ConsistentRead: true,
            },
          },
        }),
      );
      return (res.Responses?.[tables.slotLocksTable] ?? []) as SlotLockRecord[];
    },
    async claimSlots() {
      return notImplementedInPhase231('SlotLockRepository.claimSlots');
    },
    async releaseSlots() {
      return notImplementedInPhase231('SlotLockRepository.releaseSlots');
    },
  };

  return {
    rooms,
    schedules,
    bookings,
    slotLocks,
    supportsAtomicTransactions: true,
  };
}
