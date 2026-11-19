import type {
  ActivityEvent,
  Booking,
  DemoIdentity,
  Room,
  RoomRestriction,
  TimetableEntry,
} from '../types/domain';
import { addDaysToDateString, getTodayKolkata } from '../utils/datetime';

export const DEMO_IDENTITIES: Record<'STUDENT_DEMO' | 'ADMIN_DEMO', DemoIdentity> = {
  STUDENT_DEMO: {
    role: 'STUDENT_DEMO',
    userId: 'student-demo-01',
    displayName: 'Aarav Nair (Demo Student)',
    cognitoGroupPlaceholder: 'student',
  },
  ADMIN_DEMO: {
    role: 'ADMIN_DEMO',
    userId: 'admin-demo-01',
    displayName: 'Dr. Kavitha Rao (Demo Admin)',
    cognitoGroupPlaceholder: 'admin',
  },
};

export interface DemoDataset {
  rooms: Room[];
  timetable: TimetableEntry[];
  bookings: Booking[];
  restrictions: RoomRestriction[];
  activities: ActivityEvent[];
}

/**
 * Generates deterministic demonstration records anchored to the provided campus date (Asia/Kolkata).
 * All records are explicitly tagged with dataSource: 'DEMO' and represent fictional data only.
 */
export function createDemoSeedData(baseDate: string = getTodayKolkata()): DemoDataset {
  const tomorrow = addDaysToDateString(baseDate, 1);

  const rooms: Room[] = [
    {
      roomId: 'room-ece-201',
      blockId: 'BLOCK-A',
      floor: 2,
      roomNumber: 'ECE-201',
      capacity: 60,
      facilities: ['Projector', 'Whiteboard', 'Audio System', 'High-Speed Wi-Fi'],
      active: true,
      dataSource: 'DEMO',
    },
    {
      roomId: 'room-ece-202',
      blockId: 'BLOCK-A',
      floor: 2,
      roomNumber: 'ECE-202',
      capacity: 45,
      facilities: ['Projector', 'Whiteboard', 'Air Conditioning'],
      active: true,
      dataSource: 'DEMO',
    },
    {
      roomId: 'room-cse-101',
      blockId: 'BLOCK-A',
      floor: 1,
      roomNumber: 'CSE-101',
      capacity: 70,
      facilities: ['Smart Board', 'Air Conditioning', 'Audio System', 'Power Outlets', 'High-Speed Wi-Fi'],
      active: true,
      dataSource: 'DEMO',
    },
    {
      roomId: 'room-lab-103',
      blockId: 'BLOCK-A',
      floor: 1,
      roomNumber: 'LAB-103',
      capacity: 36,
      facilities: ['Lab Workstations', 'Projector', 'Air Conditioning', 'Power Outlets', 'High-Speed Wi-Fi'],
      active: true,
      dataSource: 'DEMO',
    },
    {
      roomId: 'room-cse-102',
      blockId: 'BLOCK-A',
      floor: 1,
      roomNumber: 'CSE-102',
      capacity: 50,
      facilities: ['Projector', 'Whiteboard', 'High-Speed Wi-Fi'],
      active: true,
      dataSource: 'DEMO',
    },
    {
      roomId: 'room-mech-204',
      blockId: 'BLOCK-A',
      floor: 2,
      roomNumber: 'MECH-204',
      capacity: 40,
      facilities: ['Whiteboard', 'Power Outlets'],
      active: true,
      dataSource: 'DEMO',
    },
    {
      roomId: 'room-sem-301',
      blockId: 'BLOCK-A',
      floor: 3,
      roomNumber: 'SEM-301',
      capacity: 120,
      facilities: ['Smart Board', 'Projector', 'Audio System', 'Air Conditioning', 'High-Speed Wi-Fi'],
      active: true,
      dataSource: 'DEMO',
    },
    {
      roomId: 'room-ece-302',
      blockId: 'BLOCK-A',
      floor: 3,
      roomNumber: 'ECE-302',
      capacity: 30,
      facilities: ['Whiteboard', 'High-Speed Wi-Fi'],
      active: true,
      dataSource: 'DEMO',
    },
    {
      roomId: 'room-lab-304',
      blockId: 'BLOCK-A',
      floor: 3,
      roomNumber: 'LAB-304',
      capacity: 32,
      facilities: ['Lab Workstations', 'Air Conditioning', 'Power Outlets'],
      active: true,
      dataSource: 'DEMO',
    },
    {
      roomId: 'room-arc-105',
      blockId: 'BLOCK-A',
      floor: 1,
      roomNumber: 'ARC-105',
      capacity: 25,
      facilities: ['Whiteboard'],
      active: false,
      dataSource: 'DEMO',
    },
  ];

  const timetable: TimetableEntry[] = [
    {
      scheduleId: 'tt-demo-01',
      roomId: 'room-ece-201',
      date: baseDate,
      startTime: '09:00',
      endTime: '10:00',
      subject: 'Signals & Systems (Demo)',
      dataSource: 'DEMO',
    },
    {
      scheduleId: 'tt-demo-02',
      roomId: 'room-ece-201',
      date: baseDate,
      startTime: '14:00',
      endTime: '15:30',
      subject: 'Analog Communication (Demo)',
      dataSource: 'DEMO',
    },
    {
      scheduleId: 'tt-demo-03',
      roomId: 'room-cse-101',
      date: baseDate,
      startTime: '10:00',
      endTime: '11:30',
      subject: 'Operating Systems Architecture (Demo)',
      dataSource: 'DEMO',
    },
    {
      scheduleId: 'tt-demo-04',
      roomId: 'room-lab-103',
      date: baseDate,
      startTime: '10:00',
      endTime: '12:00',
      subject: 'Data Structures Lab Batch B (Demo)',
      dataSource: 'DEMO',
    },
    {
      scheduleId: 'tt-demo-05',
      roomId: 'room-cse-102',
      date: baseDate,
      startTime: '13:00',
      endTime: '14:00',
      subject: 'Discrete Mathematics (Demo)',
      dataSource: 'DEMO',
    },
    {
      scheduleId: 'tt-demo-06',
      roomId: 'room-sem-301',
      date: baseDate,
      startTime: '15:00',
      endTime: '16:30',
      subject: 'Embedded Systems Guest Lecture (Demo)',
      dataSource: 'DEMO',
    },
    {
      scheduleId: 'tt-demo-07',
      roomId: 'room-ece-302',
      date: baseDate,
      startTime: '09:30',
      endTime: '10:30',
      subject: 'Digital Logic Design (Demo)',
      dataSource: 'DEMO',
    },
    {
      scheduleId: 'tt-demo-08',
      roomId: 'room-ece-201',
      date: tomorrow,
      startTime: '10:00',
      endTime: '11:00',
      subject: 'Microprocessor Interfacing (Demo)',
      dataSource: 'DEMO',
    },
  ];

  const bookings: Booking[] = [
    {
      bookingId: 'bk-demo-01',
      roomId: 'room-mech-204',
      studentId: 'student-demo-02',
      studentName: 'Priya Menon (Demo Student)',
      purpose: 'Robotics club CAD review session (Demo)',
      date: baseDate,
      startTime: '10:00',
      endTime: '11:00',
      status: 'APPROVED',
      createdAt: `${baseDate}T08:15:00+05:30`,
      dataSource: 'DEMO',
    },
    {
      bookingId: 'bk-demo-02',
      roomId: 'room-ece-201',
      studentId: 'student-demo-01',
      studentName: 'Aarav Nair (Demo Student)',
      purpose: 'DSP peer problem-solving group (Demo)',
      date: baseDate,
      startTime: '11:00',
      endTime: '12:00',
      status: 'PENDING',
      createdAt: `${baseDate}T08:45:00+05:30`,
      dataSource: 'DEMO',
    },
    {
      bookingId: 'bk-demo-03',
      roomId: 'room-sem-301',
      studentId: 'student-demo-01',
      studentName: 'Aarav Nair (Demo Student)',
      purpose: 'Coding club mock interview prep (Demo)',
      date: tomorrow,
      startTime: '14:00',
      endTime: '15:00',
      status: 'APPROVED',
      createdAt: `${baseDate}T09:05:00+05:30`,
      dataSource: 'DEMO',
    },
    {
      bookingId: 'bk-demo-04',
      roomId: 'room-cse-101',
      studentId: 'student-demo-01',
      studentName: 'Aarav Nair (Demo Student)',
      purpose: 'Department hackathon rehearsal (Demo)',
      date: baseDate,
      startTime: '10:00',
      endTime: '11:00',
      status: 'REJECTED',
      createdAt: `${baseDate}T07:50:00+05:30`,
      dataSource: 'DEMO',
    },
    {
      bookingId: 'bk-demo-05',
      roomId: 'room-ece-302',
      studentId: 'student-demo-02',
      studentName: 'Priya Menon (Demo Student)',
      purpose: 'Electronics mini-project sync (Demo)',
      date: baseDate,
      startTime: '11:00',
      endTime: '12:00',
      status: 'PENDING',
      createdAt: `${baseDate}T09:20:00+05:30`,
      dataSource: 'DEMO',
    },
  ];

  const restrictions: RoomRestriction[] = [
    {
      restrictionId: 'res-demo-01',
      roomId: 'room-ece-202',
      date: baseDate,
      startTime: '10:00',
      endTime: '12:30',
      reason: 'AV projector lamp servicing (DEMO)',
      dataSource: 'DEMO',
    },
    {
      restrictionId: 'res-demo-02',
      roomId: 'room-lab-304',
      date: baseDate,
      startTime: '09:00',
      endTime: '13:00',
      reason: 'Electrical panel safety inspection (DEMO)',
      dataSource: 'DEMO',
    },
  ];

  const activities: ActivityEvent[] = [
    {
      id: 'act-demo-01',
      timestamp: `${baseDate}T09:20:00+05:30`,
      type: 'BOOKING_CREATED',
      message: 'Pending demo request submitted for BLOCK-A / ECE-302 (11:00–12:00).',
      dataSource: 'DEMO',
    },
    {
      id: 'act-demo-02',
      timestamp: `${baseDate}T09:05:00+05:30`,
      type: 'BOOKING_APPROVED',
      message: 'Approved demo booking for BLOCK-A / SEM-301 tomorrow (14:00–15:00).',
      dataSource: 'DEMO',
    },
    {
      id: 'act-demo-03',
      timestamp: `${baseDate}T08:45:00+05:30`,
      type: 'BOOKING_CREATED',
      message: 'Pending demo request submitted for BLOCK-A / ECE-201 (11:00–12:00).',
      dataSource: 'DEMO',
    },
    {
      id: 'act-demo-04',
      timestamp: `${baseDate}T08:30:00+05:30`,
      type: 'RESTRICTION_ADDED',
      message: 'Restriction set on BLOCK-A / ECE-202 (10:00–12:30): AV projector lamp servicing (DEMO).',
      dataSource: 'DEMO',
    },
  ];

  return { rooms, timetable, bookings, restrictions, activities };
}
