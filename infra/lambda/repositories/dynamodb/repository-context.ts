import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  BatchGetCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { calculateTransactionActionCount } from '../../../lib/concurrency/slot-locks';
import { conflictError, notFoundError } from '../../shared/api-error';
import type { BookingRepository, UpdateBookingStatusInput } from '../interfaces/booking.repository';
import type {
  BookingRecord,
  BookingStatus,
  PaginatedResult,
  PaginationOptions,
  RoomRecord,
  ScheduleRecord,
  ScheduleRecordType,
  SlotLockRecord,
} from '../interfaces/domain-models';
import type {
  AtomicApproveBookingInput,
  AtomicCancelApprovedBookingInput,
  AtomicDeleteScheduleInput,
  AtomicOperations,
  AtomicUpsertScheduleInput,
  RepositoryContext,
} from '../interfaces/repository-context';
import type { ListByBlockOptions, RoomRepository } from '../interfaces/room.repository';
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

function encodeNextToken(lastEvaluatedKey: Record<string, unknown> | undefined): string | undefined {
  if (!lastEvaluatedKey) return undefined;
  return Buffer.from(JSON.stringify(lastEvaluatedKey), 'utf8').toString('base64url');
}

function decodeNextToken(token: string | undefined): Record<string, unknown> | undefined {
  if (!token) return undefined;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Invalid opaque token falls back cleanly via validation upstream
  }
  return undefined;
}

function isConditionalCheckFailure(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const name = (err as { name?: string }).name;
  return name === 'ConditionalCheckFailedException';
}

function mapTransactionError(err: unknown, conflictMessage: string): never {
  if (err && typeof err === 'object') {
    const typed = err as {
      name?: string;
      CancellationReasons?: Array<{ Code?: string }>;
    };
    if (typed.name === 'TransactionCanceledException') {
      const reasons = (typed.CancellationReasons ?? []).map((r) => r.Code ?? 'Unknown');
      throw conflictError(conflictMessage, {
        reasons: reasons.filter((r) => r !== 'None'),
      });
    }
  }
  throw err;
}

function toScheduleItem(record: ScheduleRecord): Record<string, unknown> {
  return {
    ...record,
    roomDateKey: DynamoDbKeys.roomDateKey(record.roomId, record.date),
    scheduleKey: DynamoDbKeys.scheduleKey(record.startTime, record.recordType, record.scheduleId),
  };
}

function toBookingItem(booking: BookingRecord): Record<string, unknown> {
  return {
    ...booking,
    roomDateKey: DynamoDbKeys.roomDateKey(booking.roomId, booking.date),
    statusStartKey: DynamoDbKeys.statusStartKey(
      booking.status,
      booking.startTime,
      booking.bookingId,
    ),
  };
}

/**
 * Phase 2.3 DynamoDB adapter implementing the 4-table architecture:
 * - ClassSpaceRooms (PK roomId, GSI_BlockFloor)
 * - ClassSpaceSchedules (PK roomDateKey, SK scheduleKey)
 * - ClassSpaceBookings (PK bookingId, GSI_StudentBookings, GSI_RoomDateBookings)
 * - ClassSpaceSlotLocks (PK lockKey, ConsistentRead + TransactWriteCommand)
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
    async listByBlock(
      blockId,
      queryOpts?: ListByBlockOptions,
    ): Promise<PaginatedResult<RoomRecord>> {
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
          ExclusiveStartKey: decodeNextToken(queryOpts?.nextToken),
          Limit: limit,
        }),
      );

      const items = (res.Items ?? []) as RoomRecord[];
      const nextToken = encodeNextToken(res.LastEvaluatedKey as Record<string, unknown> | undefined);
      return {
        items: queryOpts?.activeOnly ? items.filter((r) => r.active) : items,
        ...(nextToken ? { nextToken } : {}),
      };
    },
    async create(room) {
      try {
        await client.send(
          new PutCommand({
            TableName: tables.roomsTable,
            Item: {
              ...room,
              floorRoomKey: DynamoDbKeys.floorRoomKey(room.floor, room.roomNumber),
            },
            ConditionExpression: 'attribute_not_exists(roomId)',
          }),
        );
        return room;
      } catch (err) {
        if (isConditionalCheckFailure(err)) {
          throw conflictError(`Room "${room.roomId}" already exists.`);
        }
        throw err;
      }
    },
    async update(roomId, patch) {
      const existing = await rooms.getById(roomId);
      if (!existing) {
        throw notFoundError(`Room "${roomId}" was not found.`);
      }
      const next: RoomRecord = { ...existing, ...patch, roomId };
      try {
        await client.send(
          new PutCommand({
            TableName: tables.roomsTable,
            Item: {
              ...next,
              floorRoomKey: DynamoDbKeys.floorRoomKey(next.floor, next.roomNumber),
            },
            ConditionExpression: 'attribute_exists(roomId)',
          }),
        );
        return next;
      } catch (err) {
        if (isConditionalCheckFailure(err)) {
          throw notFoundError(`Room "${roomId}" was not found.`);
        }
        throw err;
      }
    },
    async deactivate(roomId, updatedAt) {
      return rooms.update(roomId, { active: false, updatedAt });
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
    async listForDate(date) {
      // Query all rooms in BLOCK-A via GSI_BlockFloor, then query their schedules for date (zero Scan).
      const blockRooms = await rooms.listByBlock('BLOCK-A', { limit: 50 });
      const perRoom = await Promise.all(
        blockRooms.items.map((r) => schedules.getForRoomDate(r.roomId, date)),
      );
      return perRoom
        .flat()
        .sort((a, b) =>
          DynamoDbKeys.scheduleKey(a.startTime, a.recordType, a.scheduleId).localeCompare(
            DynamoDbKeys.scheduleKey(b.startTime, b.recordType, b.scheduleId),
          ),
        );
    },
    async create(record) {
      return atomic.upsertScheduleWithLocks({
        record,
        locksToInsert: [],
        lockKeysToDelete: [],
      });
    },
    async update(roomId, date, recordType, scheduleId, patch) {
      const existingList = await schedules.getForRoomDate(roomId, date);
      const existing = existingList.find(
        (s) => s.scheduleId === scheduleId && s.recordType === recordType,
      );
      if (!existing) {
        throw notFoundError(`Schedule "${scheduleId}" was not found.`);
      }
      const next: ScheduleRecord = {
        ...existing,
        ...patch,
        roomId,
        date,
        recordType,
        scheduleId,
      };
      return atomic.upsertScheduleWithLocks({
        record: next,
        previousRecord: existing,
        locksToInsert: [],
        lockKeysToDelete: [],
      });
    },
    async delete(roomId, date, recordType, startTime, scheduleId) {
      await atomic.deleteScheduleWithLocks({
        roomId,
        date,
        recordType,
        startTime,
        scheduleId,
        lockKeys: [],
      });
    },
  };

  const bookings: BookingRepository = {
    async getById(bookingId) {
      const res = await client.send(
        new GetCommand({
          TableName: tables.bookingsTable,
          Key: { bookingId },
          ConsistentRead: true,
        }),
      );
      return (res.Item as BookingRecord | undefined) ?? null;
    },
    async listByStudent(studentId, queryOpts?: PaginationOptions) {
      const limit = queryOpts?.limit ?? 25;
      const res = await client.send(
        new QueryCommand({
          TableName: tables.bookingsTable,
          IndexName: 'GSI_StudentBookings',
          KeyConditionExpression: 'studentId = :sid',
          ExpressionAttributeValues: { ':sid': studentId },
          ScanIndexForward: false,
          ExclusiveStartKey: decodeNextToken(queryOpts?.nextToken),
          Limit: limit,
        }),
      );
      const nextToken = encodeNextToken(res.LastEvaluatedKey as Record<string, unknown> | undefined);
      return {
        items: (res.Items ?? []) as BookingRecord[],
        ...(nextToken ? { nextToken } : {}),
      };
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
    async create(booking) {
      try {
        await client.send(
          new PutCommand({
            TableName: tables.bookingsTable,
            Item: toBookingItem(booking),
            ConditionExpression: 'attribute_not_exists(bookingId)',
          }),
        );
        return booking;
      } catch (err) {
        if (isConditionalCheckFailure(err)) {
          throw conflictError(`Booking "${booking.bookingId}" already exists.`);
        }
        throw err;
      }
    },
    async updateStatus(input: UpdateBookingStatusInput) {
      const existing = await bookings.getById(input.bookingId);
      if (!existing) {
        throw notFoundError(`Booking "${input.bookingId}" was not found.`);
      }
      const nextStatusStartKey = DynamoDbKeys.statusStartKey(
        input.nextStatus,
        existing.startTime,
        existing.bookingId,
      );
      try {
        await client.send(
          new UpdateCommand({
            TableName: tables.bookingsTable,
            Key: { bookingId: input.bookingId },
            ConditionExpression: '#st = :expectedStatus',
            UpdateExpression:
              'SET #st = :nextStatus, statusStartKey = :statusStartKey, updatedAt = :updatedAt',
            ExpressionAttributeNames: { '#st': 'status' },
            ExpressionAttributeValues: {
              ':expectedStatus': input.expectedCurrentStatus,
              ':nextStatus': input.nextStatus,
              ':statusStartKey': nextStatusStartKey,
              ':updatedAt': input.updatedAt,
            },
          }),
        );
        return {
          ...existing,
          status: input.nextStatus,
          updatedAt: input.updatedAt,
        };
      } catch (err) {
        if (isConditionalCheckFailure(err)) {
          throw conflictError(
            `Booking "${input.bookingId}" cannot transition from ${input.expectedCurrentStatus} to ${input.nextStatus}.`,
          );
        }
        throw err;
      }
    },
  };

  const slotLocks: SlotLockRepository = {
    async getLocksForSlots(lockKeys) {
      if (lockKeys.length === 0) return [];
      const uniqueKeys = [...new Set(lockKeys)];
      const results: SlotLockRecord[] = [];

      // DynamoDB BatchGetItem supports up to 100 keys per request
      for (let i = 0; i < uniqueKeys.length; i += 100) {
        const chunk = uniqueKeys.slice(i, i + 100);
        const res = await client.send(
          new BatchGetCommand({
            RequestItems: {
              [tables.slotLocksTable]: {
                Keys: chunk.map((lockKey) => ({ lockKey })),
                ConsistentRead: true,
              },
            },
          }),
        );
        results.push(...((res.Responses?.[tables.slotLocksTable] ?? []) as SlotLockRecord[]));
      }

      return results;
    },
    async claimSlots(input) {
      calculateTransactionActionCount({
        slotClaimActions: input.locks.length,
        scheduleOrBookingWrites: 0,
        roomConditionChecks: 0,
      });
      if (input.locks.length === 0) {
        return { acquired: true, conflictingLockKeys: [] };
      }
      try {
        await client.send(
          new TransactWriteCommand({
            TransactItems: input.locks.map((lock) => ({
              Put: {
                TableName: tables.slotLocksTable,
                Item: lock,
                ConditionExpression: 'attribute_not_exists(lockKey)',
              },
            })),
          }),
        );
        return { acquired: true, conflictingLockKeys: [] };
      } catch (err) {
        if (err && typeof err === 'object' && (err as { name?: string }).name === 'TransactionCanceledException') {
          return {
            acquired: false,
            conflictingLockKeys: input.locks.map((l) => l.lockKey),
          };
        }
        throw err;
      }
    },
    async releaseSlots(input) {
      calculateTransactionActionCount({
        slotClaimActions: input.lockKeys.length,
        scheduleOrBookingWrites: 0,
        roomConditionChecks: 0,
      });
      if (input.lockKeys.length === 0) return;
      try {
        await client.send(
          new TransactWriteCommand({
            TransactItems: input.lockKeys.map((lockKey) => ({
              Delete: {
                TableName: tables.slotLocksTable,
                Key: { lockKey },
                ConditionExpression: 'claimType = :ct AND claimRefId = :refId',
                ExpressionAttributeValues: {
                  ':ct': input.expectedClaimType,
                  ':refId': input.expectedClaimRefId,
                },
              },
            })),
          }),
        );
      } catch (err) {
        mapTransactionError(
          err,
          `Failed to release slot locks owned by ${input.expectedClaimRefId}.`,
        );
      }
    },
  };

  const atomic: AtomicOperations = {
    async approveBooking(input: AtomicApproveBookingInput): Promise<BookingRecord> {
      const { booking, slotLocks: locksToClaim, updatedAt } = input;
      calculateTransactionActionCount({
        slotClaimActions: locksToClaim.length,
        scheduleOrBookingWrites: 1,
        roomConditionChecks: 1,
      });

      const approvedStatusStartKey = DynamoDbKeys.statusStartKey(
        'APPROVED',
        booking.startTime,
        booking.bookingId,
      );

      try {
        await client.send(
          new TransactWriteCommand({
            TransactItems: [
              {
                ConditionCheck: {
                  TableName: tables.roomsTable,
                  Key: { roomId: booking.roomId },
                  ConditionExpression: 'attribute_exists(roomId) AND active = :trueVal',
                  ExpressionAttributeValues: { ':trueVal': true },
                },
              },
              {
                Update: {
                  TableName: tables.bookingsTable,
                  Key: { bookingId: booking.bookingId },
                  ConditionExpression: '#st = :pending',
                  UpdateExpression:
                    'SET #st = :approved, statusStartKey = :statusStartKey, updatedAt = :updatedAt',
                  ExpressionAttributeNames: { '#st': 'status' },
                  ExpressionAttributeValues: {
                    ':pending': 'PENDING',
                    ':approved': 'APPROVED',
                    ':statusStartKey': approvedStatusStartKey,
                    ':updatedAt': updatedAt,
                  },
                },
              },
              ...locksToClaim.map((lock) => ({
                Put: {
                  TableName: tables.slotLocksTable,
                  Item: lock,
                  ConditionExpression: 'attribute_not_exists(lockKey)',
                },
              })),
            ],
          }),
        );

        return {
          ...booking,
          status: 'APPROVED',
          updatedAt,
        };
      } catch (err) {
        mapTransactionError(
          err,
          `Booking "${booking.bookingId}" conflicts with existing slot locks, room status, or booking state.`,
        );
      }
    },

    async cancelApprovedBooking(
      input: AtomicCancelApprovedBookingInput,
    ): Promise<BookingRecord> {
      const { booking, lockKeys, updatedAt } = input;
      calculateTransactionActionCount({
        slotClaimActions: lockKeys.length,
        scheduleOrBookingWrites: 1,
        roomConditionChecks: 0,
      });

      const cancelledStatusStartKey = DynamoDbKeys.statusStartKey(
        'CANCELLED',
        booking.startTime,
        booking.bookingId,
      );

      try {
        await client.send(
          new TransactWriteCommand({
            TransactItems: [
              {
                Update: {
                  TableName: tables.bookingsTable,
                  Key: { bookingId: booking.bookingId },
                  ConditionExpression: '#st = :approved',
                  UpdateExpression:
                    'SET #st = :cancelled, statusStartKey = :statusStartKey, updatedAt = :updatedAt',
                  ExpressionAttributeNames: { '#st': 'status' },
                  ExpressionAttributeValues: {
                    ':approved': 'APPROVED',
                    ':cancelled': 'CANCELLED',
                    ':statusStartKey': cancelledStatusStartKey,
                    ':updatedAt': updatedAt,
                  },
                },
              },
              ...lockKeys.map((lockKey) => ({
                Delete: {
                  TableName: tables.slotLocksTable,
                  Key: { lockKey },
                  ConditionExpression: 'claimType = :ct AND claimRefId = :refId',
                  ExpressionAttributeValues: {
                    ':ct': 'BOOKING',
                    ':refId': booking.bookingId,
                  },
                },
              })),
            ],
          }),
        );

        return {
          ...booking,
          status: 'CANCELLED',
          updatedAt,
        };
      } catch (err) {
        mapTransactionError(
          err,
          `Failed to cancel approved booking "${booking.bookingId}" and release owned locks.`,
        );
      }
    },

    async upsertScheduleWithLocks(input: AtomicUpsertScheduleInput): Promise<ScheduleRecord> {
      const { record, previousRecord, locksToInsert, lockKeysToDelete } = input;
      const previousSk = previousRecord
        ? DynamoDbKeys.scheduleKey(
            previousRecord.startTime,
            previousRecord.recordType,
            previousRecord.scheduleId,
          )
        : undefined;
      const nextSk = DynamoDbKeys.scheduleKey(
        record.startTime,
        record.recordType,
        record.scheduleId,
      );
      const scheduleKeyChanged = previousRecord !== undefined && previousSk !== nextSk;

      calculateTransactionActionCount({
        slotClaimActions: locksToInsert.length + lockKeysToDelete.length,
        scheduleOrBookingWrites: scheduleKeyChanged ? 2 : 1,
        roomConditionChecks: 1,
      });

      const rdk = DynamoDbKeys.roomDateKey(record.roomId, record.date);

      const scheduleWriteItems = scheduleKeyChanged
        ? [
            {
              Delete: {
                TableName: tables.schedulesTable,
                Key: { roomDateKey: rdk, scheduleKey: previousSk },
                ConditionExpression: 'attribute_exists(scheduleKey)',
              },
            },
            {
              Put: {
                TableName: tables.schedulesTable,
                Item: toScheduleItem(record),
                ConditionExpression: 'attribute_not_exists(scheduleKey)',
              },
            },
          ]
        : [
            {
              Put: {
                TableName: tables.schedulesTable,
                Item: toScheduleItem(record),
                ...(previousRecord
                  ? { ConditionExpression: 'attribute_exists(scheduleKey)' }
                  : { ConditionExpression: 'attribute_not_exists(scheduleKey)' }),
              },
            },
          ];

      const expectedClaimType = record.recordType === 'TIMETABLE' ? 'TIMETABLE' : 'RESTRICTION';

      try {
        await client.send(
          new TransactWriteCommand({
            TransactItems: [
              {
                ConditionCheck: {
                  TableName: tables.roomsTable,
                  Key: { roomId: record.roomId },
                  ConditionExpression: 'attribute_exists(roomId)',
                },
              },
              ...scheduleWriteItems,
              ...lockKeysToDelete.map((lockKey) => ({
                Delete: {
                  TableName: tables.slotLocksTable,
                  Key: { lockKey },
                  ConditionExpression: 'claimType = :ct AND claimRefId = :refId',
                  ExpressionAttributeValues: {
                    ':ct': expectedClaimType,
                    ':refId': record.scheduleId,
                  },
                },
              })),
              ...locksToInsert.map((lock) => ({
                Put: {
                  TableName: tables.slotLocksTable,
                  Item: lock,
                  ConditionExpression: 'attribute_not_exists(lockKey)',
                },
              })),
            ],
          }),
        );

        return record;
      } catch (err) {
        mapTransactionError(
          err,
          `Schedule "${record.scheduleId}" conflicts with existing timetable, restriction, or booking locks.`,
        );
      }
    },

    async deleteScheduleWithLocks(input: AtomicDeleteScheduleInput): Promise<void> {
      const { roomId, date, recordType, startTime, scheduleId, lockKeys } = input;
      calculateTransactionActionCount({
        slotClaimActions: lockKeys.length,
        scheduleOrBookingWrites: 1,
        roomConditionChecks: 0,
      });

      const rdk = DynamoDbKeys.roomDateKey(roomId, date);
      const sk = DynamoDbKeys.scheduleKey(startTime, recordType, scheduleId);
      const expectedClaimType = recordType === 'TIMETABLE' ? 'TIMETABLE' : 'RESTRICTION';

      try {
        await client.send(
          new TransactWriteCommand({
            TransactItems: [
              {
                Delete: {
                  TableName: tables.schedulesTable,
                  Key: { roomDateKey: rdk, scheduleKey: sk },
                  ConditionExpression: 'attribute_exists(scheduleKey)',
                },
              },
              ...lockKeys.map((lockKey) => ({
                Delete: {
                  TableName: tables.slotLocksTable,
                  Key: { lockKey },
                  ConditionExpression: 'claimType = :ct AND claimRefId = :refId',
                  ExpressionAttributeValues: {
                    ':ct': expectedClaimType,
                    ':refId': scheduleId,
                  },
                },
              })),
            ],
          }),
        );
      } catch (err) {
        mapTransactionError(
          err,
          `Failed to delete schedule "${scheduleId}" and release owned locks.`,
        );
      }
    },
  };

  return {
    rooms,
    schedules,
    bookings,
    slotLocks,
    atomic,
    supportsAtomicTransactions: true,
  };
}
