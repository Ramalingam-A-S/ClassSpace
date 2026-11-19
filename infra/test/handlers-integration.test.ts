import { createAvailabilityHandler } from '../lambda/handlers/availability';
import { createBookingsHandler } from '../lambda/handlers/bookings';
import { createRoomsHandler } from '../lambda/handlers/rooms';
import { createSchedulesHandler } from '../lambda/handlers/schedules';
import { createInMemoryRepositoryContext } from '../lambda/repositories/memory/in-memory-context';
import type { ApiGatewayHttpV2Event } from '../lambda/shared/api-types';

function makeAuthEvent(
  routeKey: string,
  options: {
    sub?: string;
    groups?: string[];
    scopes?: string[];
    body?: unknown;
    query?: Record<string, string>;
    pathParams?: Record<string, string>;
    headers?: Record<string, string>;
  } = {},
): ApiGatewayHttpV2Event {
  const [method, rawPath] = routeKey.split(' ');
  const claims: Record<string, unknown> = options.sub
    ? {
        sub: options.sub,
        ...(options.groups ? { 'cognito:groups': options.groups } : {}),
        ...(options.scopes ? { scope: options.scopes.join(' ') } : {}),
      }
    : {};

  return {
    routeKey,
    rawPath,
    headers: options.headers,
    queryStringParameters: options.query,
    pathParameters: options.pathParams,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    requestContext: {
      requestId: 'test-req-123',
      routeKey,
      http: { method, path: rawPath },
      authorizer: options.sub
        ? {
            jwt: {
              claims,
              scopes: options.scopes ?? null,
            },
          }
        : undefined,
    },
  };
}

describe('ClassSpace Modular Lambda Handler Integration & Security Tests', () => {
  test('Full domain lifecycle + strict auth, group enforcement, validation, and 404/409 handling', async () => {
    const repos = createInMemoryRepositoryContext();
    const roomsHandler = createRoomsHandler(() => repos);
    const availabilityHandler = createAvailabilityHandler(() => repos);
    const bookingsHandler = createBookingsHandler(() => repos);
    const schedulesHandler = createSchedulesHandler(() => repos);

    // 1. Unauthenticated request rejected with 401
    const unauth = await roomsHandler(makeAuthEvent('GET /rooms'));
    expect(unauth.statusCode).toBe(401);
    expect(JSON.parse(unauth.body).error.code).toBe('UNAUTHORIZED');

    // 2. Non-admin holding admin scope STILL rejected with 403 by Lambda requireAdmin()
    const forgedAdmin = await roomsHandler(
      makeAuthEvent('POST /admin/rooms', {
        sub: 'student-sub-1',
        groups: ['student'],
        scopes: ['classspace/admin'],
        body: {
          blockId: 'BLOCK-A',
          floor: 1,
          roomNumber: 'A-101',
          capacity: 50,
          facilities: ['Projector'],
        },
      }),
    );
    expect(forgedAdmin.statusCode).toBe(403);
    expect(JSON.parse(forgedAdmin.body).error.code).toBe('FORBIDDEN');

    // 3. Admin creates room A-101 -> 201 Created
    const createdRoom = await roomsHandler(
      makeAuthEvent('POST /admin/rooms', {
        sub: 'admin-sub-1',
        groups: ['admin'],
        scopes: ['classspace/admin'],
        body: {
          blockId: 'BLOCK-A',
          floor: 1,
          roomNumber: 'A-101',
          roomName: 'Seminar Room A-101',
          capacity: 60,
          facilities: ['Projector', 'Smart Board'],
        },
      }),
    );
    expect(createdRoom.statusCode).toBe(201);
    const roomBody = JSON.parse(createdRoom.body);
    expect(roomBody.success).toBe(true);
    expect(roomBody.data.room.roomId).toBe('block-a-a-101');

    // 4. Admin upserts timetable entry -> 200 OK
    const ttRes = await schedulesHandler(
      makeAuthEvent('PUT /admin/timetable', {
        sub: 'admin-sub-1',
        groups: ['admin'],
        scopes: ['classspace/admin'],
        body: {
          roomId: 'block-a-a-101',
          date: '2026-11-26',
          startTime: '09:00',
          endTime: '10:00',
          subject: 'CS401 Cloud Architecture (Demo)',
        },
      }),
    );
    expect(ttRes.statusCode).toBe(200);
    const timetableId = JSON.parse(ttRes.body).data.schedule.scheduleId;

    // 5. Validation error on unaligned student search -> 400
    const badSearch = await availabilityHandler(
      makeAuthEvent('GET /rooms/available', {
        sub: 'student-sub-1',
        groups: ['student'],
        scopes: ['classspace/read'],
        query: {
          date: '2026-11-26',
          startTime: '10:07',
          endTime: '11:00',
          minCapacity: '20',
        },
      }),
    );
    expect(badSearch.statusCode).toBe(400);
    expect(JSON.parse(badSearch.body).error.code).toBe('VALIDATION_ERROR');

    // 6. Valid student availability search (09:00-10:00 blocked by timetable; 10:00-11:00 vacant)
    const occupiedCheck = await availabilityHandler(
      makeAuthEvent('GET /rooms/available', {
        sub: 'student-sub-1',
        groups: ['student'],
        scopes: ['classspace/read'],
        query: {
          date: '2026-11-26',
          startTime: '09:00',
          endTime: '10:00',
          minCapacity: '30',
        },
      }),
    );
    expect(occupiedCheck.statusCode).toBe(200);
    expect(JSON.parse(occupiedCheck.body).data.availableRooms).toHaveLength(0);

    const freeCheck = await availabilityHandler(
      makeAuthEvent('GET /rooms/available', {
        sub: 'student-sub-1',
        groups: ['student'],
        scopes: ['classspace/read'],
        query: {
          date: '2026-11-26',
          startTime: '10:00',
          endTime: '11:00',
          minCapacity: '30',
        },
      }),
    );
    expect(freeCheck.statusCode).toBe(200);
    expect(JSON.parse(freeCheck.body).data.availableRooms).toHaveLength(1);

    // 7. Student submits booking with Idempotency-Key -> 201 Created, replay -> 200 OK
    const createBookingRes = await bookingsHandler(
      makeAuthEvent('POST /bookings', {
        sub: 'student-sub-1',
        groups: ['student'],
        scopes: ['classspace/bookings/write'],
        headers: { 'Idempotency-Key': 'student-1-submit-10am' },
        body: {
          roomId: 'block-a-a-101',
          date: '2026-11-26',
          startTime: '10:00',
          endTime: '11:00',
          purpose: 'AWS ShipIt Pitch Rehearsal',
        },
      }),
    );
    expect(createBookingRes.statusCode).toBe(201);
    const bookingId = JSON.parse(createBookingRes.body).data.bookingId;

    const replayRes = await bookingsHandler(
      makeAuthEvent('POST /bookings', {
        sub: 'student-sub-1',
        groups: ['student'],
        scopes: ['classspace/bookings/write'],
        headers: { 'idempotency-key': 'student-1-submit-10am' },
        body: {
          roomId: 'block-a-a-101',
          date: '2026-11-26',
          startTime: '10:00',
          endTime: '11:00',
          purpose: 'AWS ShipIt Pitch Rehearsal',
        },
      }),
    );
    expect(replayRes.statusCode).toBe(200);
    expect(JSON.parse(replayRes.body).data.bookingId).toBe(bookingId);

    // 8. Different student tries to read/cancel student-1's booking -> 403 FORBIDDEN
    const crossRead = await bookingsHandler(
      makeAuthEvent('GET /bookings/{id}', {
        sub: 'student-sub-2',
        groups: ['student'],
        scopes: ['classspace/read'],
        pathParams: { id: bookingId },
      }),
    );
    expect(crossRead.statusCode).toBe(403);

    // 9. Admin approves booking -> 200 OK
    const approveRes = await bookingsHandler(
      makeAuthEvent('PATCH /admin/bookings/{id}', {
        sub: 'admin-sub-1',
        groups: ['admin'],
        scopes: ['classspace/admin'],
        pathParams: { id: bookingId },
        body: { status: 'APPROVED' },
      }),
    );
    expect(approveRes.statusCode).toBe(200);
    expect(JSON.parse(approveRes.body).data.status).toBe('APPROVED');

    // 10. Student cancels approved booking -> 200 OK
    const cancelRes = await bookingsHandler(
      makeAuthEvent('PATCH /bookings/{id}/cancel', {
        sub: 'student-sub-1',
        groups: ['student'],
        scopes: ['classspace/bookings/write'],
        pathParams: { id: bookingId },
      }),
    );
    expect(cancelRes.statusCode).toBe(200);
    expect(JSON.parse(cancelRes.body).data.status).toBe('CANCELLED');

    // 11. Admin deletes timetable entry -> 200 OK; missing schedule -> 404
    const deleteTtRes = await schedulesHandler(
      makeAuthEvent('DELETE /admin/schedules', {
        sub: 'admin-sub-1',
        groups: ['admin'],
        scopes: ['classspace/admin'],
        query: {
          roomId: 'block-a-a-101',
          date: '2026-11-26',
          recordType: 'TIMETABLE',
          startTime: '09:00',
          scheduleId: timetableId,
        },
      }),
    );
    expect(deleteTtRes.statusCode).toBe(200);

    const missingRoom = await roomsHandler(
      makeAuthEvent('GET /rooms/{roomId}', {
        sub: 'student-sub-1',
        groups: ['student'],
        scopes: ['classspace/read'],
        pathParams: { roomId: 'nonexistent-room' },
      }),
    );
    expect(missingRoom.statusCode).toBe(404);
  });
});
