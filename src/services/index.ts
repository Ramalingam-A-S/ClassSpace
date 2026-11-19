import { AwsClassSpaceService } from './awsClassSpaceService';
import type { IClassSpaceService } from './contracts';
import { MockClassSpaceService } from './mockClassSpaceService';

export type AppServiceMode = 'DEMO' | 'LIVE';

export const mockClassSpaceService: IClassSpaceService = new MockClassSpaceService();
export const awsClassSpaceService: IClassSpaceService = new AwsClassSpaceService();

let activeMode: AppServiceMode = 'DEMO';

export function getActiveServiceMode(): AppServiceMode {
  return activeMode;
}

export function setActiveServiceMode(mode: AppServiceMode): void {
  activeMode = mode;
}

function activeDelegate(): IClassSpaceService {
  return activeMode === 'LIVE' ? awsClassSpaceService : mockClassSpaceService;
}

/**
 * Runtime service boundary delegating dynamically between Phase 1 Demo Mode
 * (MockClassSpaceService) and Phase 2 Live AWS Mode (AwsClassSpaceService).
 */
export const classSpaceService: IClassSpaceService = {
  listRooms: () => activeDelegate().listRooms(),
  getAvailableRooms: (query) => activeDelegate().getAvailableRooms(query),
  getRoomDetails: (roomId, date) => activeDelegate().getRoomDetails(roomId, date),
  createBooking: (input) => activeDelegate().createBooking(input),
  getMyBookings: (studentId) => activeDelegate().getMyBookings(studentId),
  listAllBookings: () => activeDelegate().listAllBookings(),
  listTimetableEntries: () => activeDelegate().listTimetableEntries(),
  listRestrictions: () => activeDelegate().listRestrictions(),
  getAdminSnapshot: (date, startTime, endTime) =>
    activeDelegate().getAdminSnapshot(date, startTime, endTime),
  updateBookingStatus: (bookingId, status) =>
    activeDelegate().updateBookingStatus(bookingId, status),
  createRoom: (input) => activeDelegate().createRoom(input),
  updateRoom: (roomId, input) => activeDelegate().updateRoom(roomId, input),
  upsertTimetableEntry: (input) => activeDelegate().upsertTimetableEntry(input),
  deleteTimetableEntry: (scheduleId) => activeDelegate().deleteTimetableEntry(scheduleId),
  createRestriction: (input) => activeDelegate().createRestriction(input),
  deleteRestriction: (restrictionId) => activeDelegate().deleteRestriction(restrictionId),
  resetDemoData: () => activeDelegate().resetDemoData(),
};

export * from './contracts';
export * from './availabilityEngine';
export * from './mockRepository';
export * from './cognitoAuth';
export { MockClassSpaceService } from './mockClassSpaceService';
export { AwsClassSpaceService } from './awsClassSpaceService';
