import type { ScheduleRecord, ScheduleRecordType } from './domain-models';

export interface ScheduleRepository {
  /**
   * Retrieves timetable and restriction records for a room & date in chronological
   * order via time-first scheduleKey (<startTime>#TT#<id> / <startTime>#RES#<id>).
   */
  getForRoomDate(roomId: string, date: string): Promise<readonly ScheduleRecord[]>;
  listForDate(date: string): Promise<readonly ScheduleRecord[]>;
  create(record: ScheduleRecord): Promise<ScheduleRecord>;
  update(
    roomId: string,
    date: string,
    recordType: ScheduleRecordType,
    scheduleId: string,
    patch: Partial<Omit<ScheduleRecord, 'scheduleId' | 'recordType' | 'roomId' | 'date'>>,
  ): Promise<ScheduleRecord>;
  delete(
    roomId: string,
    date: string,
    recordType: ScheduleRecordType,
    startTime: string,
    scheduleId: string,
  ): Promise<void>;
}
