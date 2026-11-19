export type SlotClaimType = 'TIMETABLE' | 'BOOKING' | 'RESTRICTION';

export const SLOT_MINUTES = 15;
export const MAX_BOOKING_MINUTES = 4 * 60; // 4 hours = 16 slots
export const MAX_SCHEDULE_ENTRY_MINUTES = 8 * 60; // 8 hours = 32 slots
export const DYNAMODB_MAX_TRANSACTION_ACTIONS = 100;

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function parseTimeToMinutes(timeStr: string): number {
  const match = TIME_PATTERN.exec(timeStr);
  if (!match) {
    throw new Error(`Invalid HH:mm time string: "${timeStr}"`);
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

export function formatMinutesToHHmm(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function validateAlignedBlockingInterval(
  startTime: string,
  endTime: string,
  claimType: SlotClaimType,
): { startMinutes: number; endMinutes: number; durationMinutes: number } {
  const startMinutes = parseTimeToMinutes(startTime);
  const endMinutes = parseTimeToMinutes(endTime);

  if (startMinutes >= endMinutes) {
    throw new Error(`Start time (${startTime}) must be strictly earlier than end time (${endTime}).`);
  }

  if (startMinutes % SLOT_MINUTES !== 0 || endMinutes % SLOT_MINUTES !== 0) {
    throw new Error(
      `Blocking intervals (${startTime}–${endTime}) must align to 15-minute boundaries.`,
    );
  }

  const durationMinutes = endMinutes - startMinutes;
  const maxDuration =
    claimType === 'BOOKING' ? MAX_BOOKING_MINUTES : MAX_SCHEDULE_ENTRY_MINUTES;

  if (durationMinutes > maxDuration) {
    throw new Error(
      `${claimType} duration (${durationMinutes} min) exceeds maximum allowed (${maxDuration} min).`,
    );
  }

  return { startMinutes, endMinutes, durationMinutes };
}

/**
 * Generates deterministic 15-minute half-open [start, end) slot lock keys:
 * roomId#date#slotStartHHmm
 */
export function buildSlotLockKeys(
  roomId: string,
  date: string,
  startTime: string,
  endTime: string,
  claimType: SlotClaimType,
): string[] {
  const { startMinutes, endMinutes } = validateAlignedBlockingInterval(
    startTime,
    endTime,
    claimType,
  );

  const keys: string[] = [];
  for (let m = startMinutes; m < endMinutes; m += SLOT_MINUTES) {
    keys.push(`${roomId}#${date}#${formatMinutesToHHmm(m)}`);
  }
  return keys;
}

/**
 * Computes time-first scheduleKey for ClassSpaceSchedules:
 * <startTime>#TT#<scheduleId> or <startTime>#RES#<restrictionId>
 */
export function buildScheduleSortKey(
  startTime: string,
  recordType: 'TT' | 'RES',
  recordId: string,
): string {
  parseTimeToMinutes(startTime);
  return `${startTime}#${recordType}#${recordId}`;
}

/**
 * Computes old/new slot-lock diffs for timetable updates so unchanged locks are not
 * duplicated in the same DynamoDB TransactWriteItems request.
 */
export function diffSlotLockKeys(oldKeys: readonly string[], newKeys: readonly string[]): {
  toDelete: string[];
  toInsert: string[];
  unchanged: string[];
} {
  const oldSet = new Set(oldKeys);
  const newSet = new Set(newKeys);

  return {
    toDelete: oldKeys.filter((k) => !newSet.has(k)),
    toInsert: newKeys.filter((k) => !oldSet.has(k)),
    unchanged: newKeys.filter((k) => oldSet.has(k)),
  };
}

/**
 * Calculates total DynamoDB TransactWriteItems action count and verifies it stays
 * strictly within AWS's 100-action limit.
 */
export function calculateTransactionActionCount(params: {
  slotClaimActions: number;
  scheduleOrBookingWrites: number;
  roomConditionChecks: number;
}): number {
  const total =
    params.slotClaimActions + params.scheduleOrBookingWrites + params.roomConditionChecks;
  if (total > DYNAMODB_MAX_TRANSACTION_ACTIONS) {
    throw new Error(
      `DynamoDB transaction action count (${total}) exceeds limit (${DYNAMODB_MAX_TRANSACTION_ACTIONS}).`,
    );
  }
  return total;
}
