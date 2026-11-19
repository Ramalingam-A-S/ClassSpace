import type {
  BookingRecord,
  DataSource,
  PaginatedResult,
  RoomRecord,
  ScheduleRecord,
} from '../repositories/interfaces/domain-models';
import type { RepositoryContext } from '../repositories/interfaces/repository-context';
import { conflictError, notFoundError } from '../shared/api-error';
import { getTodayCampusDate } from '../shared/runtime-context';

export interface ListRoomsInput {
  readonly blockId?: string;
  readonly floor?: number;
  readonly minCapacity?: number;
  readonly facilities?: string;
  readonly includeInactive?: 'true' | 'false';
  readonly limit?: number;
  readonly nextToken?: string;
}

export interface RoomDetailsResult {
  readonly room: RoomRecord;
  readonly date: string;
  readonly schedules: readonly ScheduleRecord[];
  readonly approvedBookings: readonly BookingRecord[];
  readonly pendingBookingsCount: number;
  readonly physicalOccupancyNotice: string;
}

export interface CreateRoomInput {
  readonly blockId: string;
  readonly floor: number;
  readonly roomNumber: string;
  readonly roomName?: string;
  readonly capacity: number;
  readonly facilities: readonly string[];
  readonly active?: boolean;
}

export interface UpdateRoomInput {
  readonly blockId?: string;
  readonly floor?: number;
  readonly roomNumber?: string;
  readonly roomName?: string;
  readonly capacity?: number;
  readonly facilities?: readonly string[];
  readonly active?: boolean;
}

export const PHYSICAL_OCCUPANCY_NOTICE =
  'Schedule status only: physical room occupancy is not monitored or verified.';

function parseFacilitiesFilter(raw?: string): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function normalizeRoomId(blockId: string, roomNumber: string): string {
  return `${blockId}-${roomNumber}`
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

export class RoomService {
  constructor(private readonly repos: RepositoryContext) {}

  async listRooms(input: ListRoomsInput): Promise<PaginatedResult<RoomRecord>> {
    const blockId = input.blockId ?? 'BLOCK-A';
    const activeOnly = input.includeInactive !== 'true';
    const requiredFacilities = parseFacilitiesFilter(input.facilities);

    const page = await this.repos.rooms.listByBlock(blockId, {
      floor: input.floor,
      activeOnly,
      limit: input.limit,
      nextToken: input.nextToken,
    });

    const filtered = page.items.filter((room) => {
      if (input.minCapacity !== undefined && room.capacity < input.minCapacity) {
        return false;
      }
      if (
        requiredFacilities.length > 0 &&
        !requiredFacilities.every((f) => room.facilities.includes(f))
      ) {
        return false;
      }
      return true;
    });

    return {
      items: filtered,
      ...(page.nextToken ? { nextToken: page.nextToken } : {}),
    };
  }

  async getRoomDetails(roomId: string, dateInput?: string): Promise<RoomDetailsResult> {
    const room = await this.repos.rooms.getById(roomId);
    if (!room) {
      throw notFoundError(`Room "${roomId}" was not found.`);
    }

    const date = dateInput ?? getTodayCampusDate();
    const [schedules, approvedBookings, pendingBookings] = await Promise.all([
      this.repos.schedules.getForRoomDate(roomId, date),
      this.repos.bookings.listByRoomDate(roomId, date, 'APPROVED'),
      this.repos.bookings.listByRoomDate(roomId, date, 'PENDING'),
    ]);

    return {
      room,
      date,
      schedules,
      approvedBookings,
      pendingBookingsCount: pendingBookings.length,
      physicalOccupancyNotice: PHYSICAL_OCCUPANCY_NOTICE,
    };
  }

  async createRoom(input: CreateRoomInput, dataSource: DataSource = 'ADMIN_ENTERED'): Promise<RoomRecord> {
    const roomId = normalizeRoomId(input.blockId, input.roomNumber);
    const now = new Date().toISOString();

    const existingBlockRooms = await this.repos.rooms.listByBlock(input.blockId, {
      limit: 100,
    });
    const duplicateRoomNumber = existingBlockRooms.items.some(
      (r) => r.roomNumber.toUpperCase() === input.roomNumber.toUpperCase(),
    );
    if (duplicateRoomNumber) {
      throw conflictError(
        `Room "${input.roomNumber}" already exists in block "${input.blockId}".`,
      );
    }

    const record: RoomRecord = {
      roomId,
      blockId: input.blockId,
      floor: input.floor,
      roomNumber: input.roomNumber,
      roomName: input.roomName?.trim() || `${input.blockId} ${input.roomNumber}`,
      capacity: input.capacity,
      facilities: [...new Set(input.facilities)],
      active: input.active ?? true,
      dataSource,
      createdAt: now,
      updatedAt: now,
    };

    return this.repos.rooms.create(record);
  }

  async updateRoom(roomId: string, patch: UpdateRoomInput): Promise<RoomRecord> {
    const existing = await this.repos.rooms.getById(roomId);
    if (!existing) {
      throw notFoundError(`Room "${roomId}" was not found.`);
    }

    const nextBlock = patch.blockId ?? existing.blockId;
    const nextRoomNumber = patch.roomNumber ?? existing.roomNumber;

    if (nextBlock !== existing.blockId || nextRoomNumber !== existing.roomNumber) {
      const siblingRooms = await this.repos.rooms.listByBlock(nextBlock, { limit: 100 });
      const duplicate = siblingRooms.items.some(
        (r) =>
          r.roomId !== roomId &&
          r.roomNumber.toUpperCase() === nextRoomNumber.toUpperCase(),
      );
      if (duplicate) {
        throw conflictError(
          `Room "${nextRoomNumber}" already exists in block "${nextBlock}".`,
        );
      }
    }

    const now = new Date().toISOString();
    return this.repos.rooms.update(roomId, {
      ...(patch.blockId !== undefined ? { blockId: patch.blockId } : {}),
      ...(patch.floor !== undefined ? { floor: patch.floor } : {}),
      ...(patch.roomNumber !== undefined ? { roomNumber: patch.roomNumber } : {}),
      ...(patch.roomName !== undefined ? { roomName: patch.roomName.trim() } : {}),
      ...(patch.capacity !== undefined ? { capacity: patch.capacity } : {}),
      ...(patch.facilities !== undefined ? { facilities: [...new Set(patch.facilities)] } : {}),
      ...(patch.active !== undefined ? { active: patch.active } : {}),
      updatedAt: now,
    });
  }
}
