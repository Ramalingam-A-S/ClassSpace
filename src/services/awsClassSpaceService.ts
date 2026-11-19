import type {
  ActivityEvent,
  AvailabilityQuery,
  Booking,
  BookingStatus,
  Facility,
  Room,
  RoomAvailabilityResult,
  RoomRestriction,
  TimetableEntry,
} from '../types/domain';
import { getTodayKolkata } from '../utils/datetime';
import {
  clearAuthSession,
  getAccessToken,
  getAuthSession,
  getCognitoConfig,
} from './cognitoAuth';
import type {
  AdminDashboardSnapshot,
  CreateBookingInput,
  CreateRestrictionInput,
  CreateRoomInput,
  IClassSpaceService,
  RoomDetailsResponse,
  UpdateRoomInput,
  UpsertTimetableInput,
} from './contracts';

interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  requestId: string;
}

interface BackendRoomRecord {
  roomId: string;
  blockId: string;
  floor: number;
  roomNumber: string;
  roomName: string;
  capacity: number;
  facilities: string[];
  active: boolean;
  dataSource: 'DEMO' | 'ADMIN_ENTERED' | 'VERIFIED_INSTITUTIONAL';
}

interface BackendScheduleRecord {
  scheduleId: string;
  recordType: 'TIMETABLE' | 'RESTRICTION';
  roomId: string;
  date: string;
  startTime: string;
  endTime: string;
  label: string;
  dataSource: 'DEMO' | 'ADMIN_ENTERED' | 'VERIFIED_INSTITUTIONAL';
}

interface BackendBookingRecord {
  bookingId: string;
  roomId: string;
  studentId: string;
  studentName?: string;
  purpose?: string;
  date: string;
  startTime: string;
  endTime: string;
  status: BookingStatus;
  createdAt: string;
  dataSource: 'DEMO' | 'ADMIN_ENTERED' | 'VERIFIED_INSTITUTIONAL';
}

interface BackendAvailabilityEvaluation {
  room: BackendRoomRecord;
  isAvailable: boolean;
  status: RoomAvailabilityResult['status'];
  explanation: string;
  physicalOccupancyNotice: string;
  conflictingSchedules: BackendScheduleRecord[];
  pendingBookingsCount: number;
}

export class AwsClassSpaceService implements IClassSpaceService {
  private readonly scheduleCache = new Map<string, BackendScheduleRecord>();

  constructor(
    private readonly getBaseUrl: () => string = () => getCognitoConfig().apiBaseUrl,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async request<T>(
    path: string,
    init: RequestInit = {},
    allowNotFound = false,
  ): Promise<T | null> {
    const token = getAccessToken();
    if (!token) {
      throw new Error('Sign in with Amazon Cognito is required before using Live Mode.');
    }

    const baseUrl = this.getBaseUrl().replace(/\/+$/, '');
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${token}`);
    if (init.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    const response = await this.fetchImpl(`${baseUrl}${path}`, {
      ...init,
      headers,
    });

    if (response.status === 401) {
      clearAuthSession();
    }

    if (allowNotFound && response.status === 404) {
      return null;
    }

    const envelope = (await response.json()) as ApiEnvelope<T>;
    if (!response.ok || !envelope.success) {
      throw new Error(
        envelope.error?.message || `API request failed with HTTP ${response.status}.`,
      );
    }

    return envelope.data as T;
  }

  private mapRoom(room: BackendRoomRecord): Room {
    return {
      roomId: room.roomId,
      blockId: room.blockId,
      floor: room.floor,
      roomNumber: room.roomNumber,
      capacity: room.capacity,
      facilities: room.facilities as Facility[],
      active: room.active,
      dataSource: room.dataSource,
    };
  }

  private mapScheduleToTimetable(item: BackendScheduleRecord): TimetableEntry {
    this.scheduleCache.set(item.scheduleId, item);
    return {
      scheduleId: item.scheduleId,
      roomId: item.roomId,
      date: item.date,
      startTime: item.startTime,
      endTime: item.endTime,
      subject: item.label,
      dataSource: item.dataSource,
    };
  }

  private mapScheduleToRestriction(item: BackendScheduleRecord): RoomRestriction {
    this.scheduleCache.set(item.scheduleId, item);
    return {
      restrictionId: item.scheduleId,
      roomId: item.roomId,
      date: item.date,
      startTime: item.startTime,
      endTime: item.endTime,
      reason: item.label,
      dataSource: item.dataSource,
    };
  }

  private mapBooking(booking: BackendBookingRecord): Booking {
    return {
      bookingId: booking.bookingId,
      roomId: booking.roomId,
      studentId: booking.studentId,
      studentName: booking.studentName,
      purpose: booking.purpose,
      date: booking.date,
      startTime: booking.startTime,
      endTime: booking.endTime,
      status: booking.status,
      createdAt: booking.createdAt,
      dataSource: booking.dataSource,
    };
  }

  async listRooms(): Promise<Room[]> {
    const data = await this.request<{ items: BackendRoomRecord[] }>(
      '/rooms?includeInactive=true&limit=100',
    );
    return (data?.items ?? []).map((r) => this.mapRoom(r));
  }

  async getAvailableRooms(query: AvailabilityQuery): Promise<RoomAvailabilityResult[]> {
    const params = new URLSearchParams({
      date: query.date,
      startTime: query.startTime,
      endTime: query.endTime,
      minCapacity: String(query.minCapacity),
    });
    if (query.blockId) params.set('blockId', query.blockId);
    if (query.floor !== undefined) params.set('floor', String(query.floor));
    if (query.facilities && query.facilities.length > 0) {
      params.set('facilities', query.facilities.join(','));
    }

    const data = await this.request<{ roomResults: BackendAvailabilityEvaluation[] }>(
      `/rooms/available?${params.toString()}`,
    );

    return (data?.roomResults ?? []).map((item) => ({
      room: this.mapRoom(item.room),
      isAvailable: item.isAvailable,
      status: item.status,
      explanation: item.explanation,
      physicalOccupancyNotice: item.physicalOccupancyNotice,
      conflicts: {
        timetable: item.conflictingSchedules
          .filter((s) => s.recordType === 'TIMETABLE')
          .map((s) => this.mapScheduleToTimetable(s)),
        approvedBookings: [],
        restrictions: item.conflictingSchedules
          .filter((s) => s.recordType === 'RESTRICTION')
          .map((s) => this.mapScheduleToRestriction(s)),
      },
      pendingBookingsCount: item.pendingBookingsCount,
    }));
  }

  async getRoomDetails(roomId: string, date: string): Promise<RoomDetailsResponse | null> {
    const data = await this.request<{
      room: BackendRoomRecord;
      date: string;
      schedules: BackendScheduleRecord[];
      approvedBookings: BackendBookingRecord[];
    }>(`/rooms/${encodeURIComponent(roomId)}?date=${encodeURIComponent(date)}`, {}, true);

    if (!data) {
      return null;
    }

    return {
      room: this.mapRoom(data.room),
      date: data.date,
      timetable: data.schedules
        .filter((s) => s.recordType === 'TIMETABLE')
        .map((s) => this.mapScheduleToTimetable(s)),
      approvedBookings: data.approvedBookings.map((b) => this.mapBooking(b)),
      pendingBookings: [],
      restrictions: data.schedules
        .filter((s) => s.recordType === 'RESTRICTION')
        .map((s) => this.mapScheduleToRestriction(s)),
    };
  }

  async createBooking(input: CreateBookingInput): Promise<Booking> {
    const idempotencyKey =
      typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `bkg-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    const data = await this.request<BackendBookingRecord>('/bookings', {
      method: 'POST',
      headers: {
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({
        roomId: input.roomId,
        date: input.date,
        startTime: input.startTime,
        endTime: input.endTime,
        purpose: input.purpose,
      }),
    });

    return this.mapBooking(data!);
  }

  async getMyBookings(): Promise<Booking[]> {
    const data = await this.request<{ items: BackendBookingRecord[] }>('/bookings/me?limit=50');
    return (data?.items ?? []).map((b) => this.mapBooking(b));
  }

  async listAllBookings(): Promise<Booking[]> {
    const date = getTodayKolkata();
    const data = await this.request<{ items: BackendBookingRecord[] }>(
      `/admin/bookings?date=${encodeURIComponent(date)}&limit=100`,
    );
    return (data?.items ?? []).map((b) => this.mapBooking(b));
  }

  async listTimetableEntries(): Promise<TimetableEntry[]> {
    const date = getTodayKolkata();
    const data = await this.request<{ items: BackendScheduleRecord[] }>(
      `/admin/schedules?date=${encodeURIComponent(date)}`,
    );
    return (data?.items ?? [])
      .filter((item) => item.recordType === 'TIMETABLE')
      .map((item) => this.mapScheduleToTimetable(item));
  }

  async listRestrictions(): Promise<RoomRestriction[]> {
    const date = getTodayKolkata();
    const data = await this.request<{ items: BackendScheduleRecord[] }>(
      `/admin/schedules?date=${encodeURIComponent(date)}`,
    );
    return (data?.items ?? [])
      .filter((item) => item.recordType === 'RESTRICTION')
      .map((item) => this.mapScheduleToRestriction(item));
  }

  async getAdminSnapshot(
    date: string,
    startTime: string,
    endTime: string,
  ): Promise<AdminDashboardSnapshot> {
    const [rooms, availability, bookings] = await Promise.all([
      this.listRooms(),
      this.getAvailableRooms({ date, startTime, endTime, minCapacity: 1 }),
      this.request<{ items: BackendBookingRecord[] }>(
        `/admin/bookings?date=${encodeURIComponent(date)}&limit=100`,
      ),
    ]);

    const bookingItems = bookings?.items ?? [];
    const recentActivities: ActivityEvent[] = bookingItems.slice(0, 8).map((b) => ({
      id: b.bookingId,
      timestamp: b.createdAt,
      type:
        b.status === 'APPROVED'
          ? 'BOOKING_APPROVED'
          : b.status === 'REJECTED'
            ? 'BOOKING_REJECTED'
            : 'BOOKING_CREATED',
      message: `${b.roomId} (${b.startTime}–${b.endTime}) • ${b.purpose ?? 'Student session'}`,
      dataSource: b.dataSource,
    }));

    return {
      totalRooms: rooms.length,
      activeRooms: rooms.filter((r) => r.active).length,
      scheduleVacantCount: availability.filter((a) => a.status === 'SCHEDULE_VACANT').length,
      pendingBookingsCount: bookingItems.filter((b) => b.status === 'PENDING').length,
      approvedBookingsCount: bookingItems.filter((b) => b.status === 'APPROVED').length,
      restrictedRoomsCount: availability.filter((a) => a.status === 'RESTRICTED').length,
      recentActivities,
    };
  }

  async updateBookingStatus(
    bookingId: string,
    status: Extract<BookingStatus, 'APPROVED' | 'REJECTED' | 'CANCELLED'>,
  ): Promise<Booking> {
    const session = getAuthSession();
    if (status === 'CANCELLED' && !session?.isAdmin) {
      const cancelled = await this.request<BackendBookingRecord>(
        `/bookings/${encodeURIComponent(bookingId)}/cancel`,
        { method: 'PATCH' },
      );
      return this.mapBooking(cancelled!);
    }

    const updated = await this.request<BackendBookingRecord>(
      `/admin/bookings/${encodeURIComponent(bookingId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      },
    );
    return this.mapBooking(updated!);
  }

  async createRoom(input: CreateRoomInput): Promise<Room> {
    const data = await this.request<{ room: BackendRoomRecord }>('/admin/rooms', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return this.mapRoom(data!.room);
  }

  async updateRoom(roomId: string, input: UpdateRoomInput): Promise<Room> {
    const data = await this.request<{ room: BackendRoomRecord }>(
      `/admin/rooms/${encodeURIComponent(roomId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(input),
      },
    );
    return this.mapRoom(data!.room);
  }

  async upsertTimetableEntry(input: UpsertTimetableInput): Promise<TimetableEntry> {
    const data = await this.request<{ schedule: BackendScheduleRecord }>('/admin/timetable', {
      method: 'PUT',
      body: JSON.stringify(input),
    });
    return this.mapScheduleToTimetable(data!.schedule);
  }

  async deleteTimetableEntry(scheduleId: string): Promise<void> {
    let target = this.scheduleCache.get(scheduleId);
    if (!target) {
      await this.listTimetableEntries();
      target = this.scheduleCache.get(scheduleId);
    }
    if (!target) {
      throw new Error(`Unable to resolve schedule metadata for "${scheduleId}".`);
    }

    const params = new URLSearchParams({
      roomId: target.roomId,
      date: target.date,
      recordType: 'TIMETABLE',
      startTime: target.startTime,
      scheduleId: target.scheduleId,
    });
    await this.request(`/admin/schedules?${params.toString()}`, { method: 'DELETE' });
    this.scheduleCache.delete(scheduleId);
  }

  async createRestriction(input: CreateRestrictionInput): Promise<RoomRestriction> {
    const data = await this.request<{ schedule: BackendScheduleRecord }>('/admin/restrictions', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return this.mapScheduleToRestriction(data!.schedule);
  }

  async deleteRestriction(restrictionId: string): Promise<void> {
    let target = this.scheduleCache.get(restrictionId);
    if (!target) {
      await this.listRestrictions();
      target = this.scheduleCache.get(restrictionId);
    }
    if (!target) {
      throw new Error(`Unable to resolve restriction metadata for "${restrictionId}".`);
    }

    const params = new URLSearchParams({
      roomId: target.roomId,
      date: target.date,
      recordType: 'RESTRICTION',
      startTime: target.startTime,
      scheduleId: target.scheduleId,
    });
    await this.request(`/admin/schedules?${params.toString()}`, { method: 'DELETE' });
    this.scheduleCache.delete(restrictionId);
  }

  async resetDemoData(): Promise<void> {
    throw new Error('Demo reset is disabled in Live AWS Mode.');
  }
}
