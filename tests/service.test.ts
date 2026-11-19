import { beforeEach, describe, expect, it } from 'vitest';
import { MockClassSpaceService } from '../src/services/mockClassSpaceService';
import { LocalMockRepository } from '../src/services/mockRepository';
import { getTodayKolkata } from '../src/utils/datetime';
import { roomFormSchema } from '../src/utils/validation';

describe('MockClassSpaceService & Admin Validation', () => {
  let service: MockClassSpaceService;
  const today = getTodayKolkata();

  beforeEach(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.clear();
    }
    const repo = new LocalMockRepository();
    repo.reset();
    service = new MockClassSpaceService(repo);
  });

  it('validates admin room creation fields strictly', () => {
    const valid = roomFormSchema.safeParse({
      blockId: 'BLOCK-A',
      floor: 2,
      roomNumber: 'ECE-205',
      capacity: 45,
      facilities: ['Projector', 'Whiteboard'],
      active: true,
    });
    expect(valid.success).toBe(true);

    const invalidCapacity = roomFormSchema.safeParse({
      blockId: 'BLOCK-A',
      floor: 2,
      roomNumber: 'ECE-205',
      capacity: 0,
      facilities: ['Projector'],
      active: true,
    });
    expect(invalidCapacity.success).toBe(false);

    const missingFacilities = roomFormSchema.safeParse({
      blockId: 'BLOCK-A',
      floor: 2,
      roomNumber: 'ECE-205',
      capacity: 30,
      facilities: [],
      active: true,
    });
    expect(missingFacilities.success).toBe(false);
  });

  it('creates a pending booking request and persists it for the student', async () => {
    const created = await service.createBooking({
      roomId: 'room-ece-201',
      studentId: 'student-demo-01',
      studentName: 'Aarav Nair (Demo Student)',
      purpose: 'Algorithms study circle (Demo)',
      date: today,
      startTime: '16:00',
      endTime: '17:00',
    });

    expect(created.status).toBe('PENDING');
    expect(created.dataSource).toBe('DEMO');

    const myBookings = await service.getMyBookings('student-demo-01');
    expect(myBookings.some((b) => b.bookingId === created.bookingId)).toBe(true);
  });

  it('prevents creating a booking on an occupied or restricted slot', async () => {
    await expect(
      service.createBooking({
        roomId: 'room-ece-202',
        studentId: 'student-demo-01',
        studentName: 'Aarav Nair (Demo Student)',
        purpose: 'Invalid attempt on restricted slot',
        date: today,
        startTime: '10:30',
        endTime: '11:30',
      }),
    ).rejects.toThrow(/Restricted/i);
  });

  it('calculates admin snapshot metrics dynamically from repository data', async () => {
    const initialSnapshot = await service.getAdminSnapshot(today, '10:00', '11:00');
    expect(initialSnapshot.totalRooms).toBe(10);
    expect(initialSnapshot.pendingBookingsCount).toBe(2);

    await service.createRoom({
      blockId: 'BLOCK-A',
      floor: 2,
      roomNumber: 'ECE-299',
      capacity: 40,
      facilities: ['Projector'],
      active: true,
    });

    const afterAdd = await service.getAdminSnapshot(today, '10:00', '11:00');
    expect(afterAdd.totalRooms).toBe(11);
    expect(afterAdd.scheduleVacantCount).toBe(initialSnapshot.scheduleVacantCount + 1);
  });
});
