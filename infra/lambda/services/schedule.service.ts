import { randomUUID } from 'node:crypto';
import { buildSlotLockKeys, diffSlotLockKeys } from '../../lib/concurrency/slot-locks';
import type {
  DataSource,
  ScheduleRecord,
  ScheduleRecordType,
  SlotLockRecord,
} from '../repositories/interfaces/domain-models';
import type { RepositoryContext } from '../repositories/interfaces/repository-context';
import { conflictError, notFoundError } from '../shared/api-error';

export interface UpsertTimetableInput {
  readonly scheduleId?: string;
  readonly roomId: string;
  readonly date: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly subject: string;
}

export interface CreateRestrictionInput {
  readonly roomId: string;
  readonly date: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly reason: string;
}

export interface ListSchedulesInput {
  readonly date: string;
  readonly roomId?: string;
  readonly blockId?: string;
}

export interface DeleteScheduleInput {
  readonly roomId: string;
  readonly date: string;
  readonly recordType: ScheduleRecordType;
  readonly startTime: string;
  readonly scheduleId: string;
}

export class ScheduleService {
  constructor(private readonly repos: RepositoryContext) {}

  async listSchedules(input: ListSchedulesInput): Promise<readonly ScheduleRecord[]> {
    if (input.roomId) {
      return this.repos.schedules.getForRoomDate(input.roomId, input.date);
    }

    const blockId = input.blockId ?? 'BLOCK-A';
    const roomsPage = await this.repos.rooms.listByBlock(blockId, { limit: 100 });
    const perRoom = await Promise.all(
      roomsPage.items.map((room) => this.repos.schedules.getForRoomDate(room.roomId, input.date)),
    );

    return perRoom.flat().sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      if (a.startTime !== b.startTime) return a.startTime.localeCompare(b.startTime);
      return a.roomId.localeCompare(b.roomId);
    });
  }

  async upsertTimetableEntry(
    input: UpsertTimetableInput,
    dataSource: DataSource = 'ADMIN_ENTERED',
  ): Promise<ScheduleRecord> {
    const room = await this.repos.rooms.getById(input.roomId);
    if (!room) {
      throw notFoundError(`Room "${input.roomId}" was not found.`);
    }

    const scheduleId = input.scheduleId ?? `tt-${randomUUID().slice(0, 12)}`;
    const existingForDate = await this.repos.schedules.getForRoomDate(input.roomId, input.date);
    const previousRecord = existingForDate.find(
      (item) => item.scheduleId === scheduleId && item.recordType === 'TIMETABLE',
    );

    const newLockKeys = buildSlotLockKeys(
      input.roomId,
      input.date,
      input.startTime,
      input.endTime,
      'TIMETABLE',
    );
    const oldLockKeys = previousRecord
      ? buildSlotLockKeys(
          previousRecord.roomId,
          previousRecord.date,
          previousRecord.startTime,
          previousRecord.endTime,
          'TIMETABLE',
        )
      : [];

    const { toDelete, toInsert } = diffSlotLockKeys(oldLockKeys, newLockKeys);

    if (toInsert.length > 0) {
      const existingLocks = await this.repos.slotLocks.getLocksForSlots(toInsert);
      const foreignLocks = existingLocks.filter(
        (lock) => !(lock.claimType === 'TIMETABLE' && lock.claimRefId === scheduleId),
      );
      if (foreignLocks.length > 0) {
        const claimTypes = [...new Set(foreignLocks.map((l) => l.claimType))];
        throw conflictError(
          `Timetable entry conflicts with existing ${claimTypes.join('/')} slot claim(s) for room "${input.roomId}".`,
          {
            conflictingClaimTypes: claimTypes,
            conflictingLockKeys: foreignLocks.map((l) => l.lockKey),
          },
        );
      }
    }

    const now = new Date().toISOString();
    const record: ScheduleRecord = {
      scheduleId,
      recordType: 'TIMETABLE',
      roomId: input.roomId,
      date: input.date,
      startTime: input.startTime,
      endTime: input.endTime,
      label: input.subject.trim(),
      dataSource: previousRecord?.dataSource ?? dataSource,
      createdAt: previousRecord?.createdAt ?? now,
      updatedAt: now,
    };

    const locksToInsert: SlotLockRecord[] = toInsert.map((lockKey) => ({
      lockKey,
      roomId: input.roomId,
      date: input.date,
      slotStart: lockKey.slice(lockKey.lastIndexOf('#') + 1),
      claimType: 'TIMETABLE',
      claimRefId: scheduleId,
      createdAt: now,
    }));

    return this.repos.atomic.upsertScheduleWithLocks({
      record,
      previousRecord,
      locksToInsert,
      lockKeysToDelete: toDelete,
    });
  }

  async createRestriction(
    input: CreateRestrictionInput,
    dataSource: DataSource = 'ADMIN_ENTERED',
  ): Promise<ScheduleRecord> {
    const room = await this.repos.rooms.getById(input.roomId);
    if (!room) {
      throw notFoundError(`Room "${input.roomId}" was not found.`);
    }

    const lockKeys = buildSlotLockKeys(
      input.roomId,
      input.date,
      input.startTime,
      input.endTime,
      'RESTRICTION',
    );

    const existingLocks = await this.repos.slotLocks.getLocksForSlots(lockKeys);
    if (existingLocks.length > 0) {
      const claimTypes = [...new Set(existingLocks.map((l) => l.claimType))];
      throw conflictError(
        `Restriction conflicts with existing ${claimTypes.join('/')} slot claim(s) for room "${input.roomId}".`,
        {
          conflictingClaimTypes: claimTypes,
          conflictingLockKeys: existingLocks.map((l) => l.lockKey),
        },
      );
    }

    const scheduleId = `res-${randomUUID().slice(0, 12)}`;
    const now = new Date().toISOString();

    const record: ScheduleRecord = {
      scheduleId,
      recordType: 'RESTRICTION',
      roomId: input.roomId,
      date: input.date,
      startTime: input.startTime,
      endTime: input.endTime,
      label: input.reason.trim(),
      dataSource,
      createdAt: now,
      updatedAt: now,
    };

    const locksToInsert: SlotLockRecord[] = lockKeys.map((lockKey) => ({
      lockKey,
      roomId: input.roomId,
      date: input.date,
      slotStart: lockKey.slice(lockKey.lastIndexOf('#') + 1),
      claimType: 'RESTRICTION',
      claimRefId: scheduleId,
      createdAt: now,
    }));

    return this.repos.atomic.upsertScheduleWithLocks({
      record,
      locksToInsert,
      lockKeysToDelete: [],
    });
  }

  async deleteScheduleEntry(input: DeleteScheduleInput): Promise<void> {
    const existingList = await this.repos.schedules.getForRoomDate(input.roomId, input.date);
    const existing = existingList.find(
      (s) =>
        s.scheduleId === input.scheduleId &&
        s.recordType === input.recordType &&
        s.startTime === input.startTime,
    );

    if (!existing) {
      throw notFoundError(
        `Schedule "${input.scheduleId}" (${input.recordType}) on ${input.date} at ${input.startTime} was not found.`,
      );
    }

    const claimType = existing.recordType === 'TIMETABLE' ? 'TIMETABLE' : 'RESTRICTION';
    const lockKeys = buildSlotLockKeys(
      existing.roomId,
      existing.date,
      existing.startTime,
      existing.endTime,
      claimType,
    );

    await this.repos.atomic.deleteScheduleWithLocks({
      roomId: existing.roomId,
      date: existing.date,
      recordType: existing.recordType,
      startTime: existing.startTime,
      scheduleId: existing.scheduleId,
      lockKeys,
    });
  }
}
