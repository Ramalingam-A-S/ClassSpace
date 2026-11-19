import type { PaginatedResult, PaginationOptions, RoomRecord } from './domain-models';

export interface ListByBlockOptions extends PaginationOptions {
  readonly floor?: number;
  readonly activeOnly?: boolean;
}

export interface RoomRepository {
  getById(roomId: string): Promise<RoomRecord | null>;
  listByBlock(blockId: string, options?: ListByBlockOptions): Promise<PaginatedResult<RoomRecord>>;
  create(room: RoomRecord): Promise<RoomRecord>;
  update(roomId: string, patch: Partial<Omit<RoomRecord, 'roomId'>>): Promise<RoomRecord>;
  deactivate(roomId: string, updatedAt: string): Promise<RoomRecord>;
}
