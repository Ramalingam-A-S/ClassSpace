import type { SlotClaimType, SlotLockRecord } from './domain-models';

export interface ClaimSlotsInput {
  readonly locks: readonly SlotLockRecord[];
}

export interface ReleaseSlotsInput {
  readonly lockKeys: readonly string[];
  readonly expectedClaimType: SlotClaimType;
  readonly expectedClaimRefId: string;
}

export interface SlotClaimResult {
  readonly acquired: boolean;
  readonly conflictingLockKeys: readonly string[];
}

/**
 * Authoritative interface for 15-minute slot-lock claims across
 * TIMETABLE, BOOKING, and RESTRICTION intervals.
 */
export interface SlotLockRepository {
  getLocksForSlots(lockKeys: readonly string[]): Promise<readonly SlotLockRecord[]>;
  claimSlots(input: ClaimSlotsInput): Promise<SlotClaimResult>;
  releaseSlots(input: ReleaseSlotsInput): Promise<void>;
}
