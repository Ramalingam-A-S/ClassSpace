# ClassSpace — API Contract Specification

This document defines the REST API contract prepared for Phase 2 AWS integration (Amazon API Gateway + AWS Lambda + Amazon Cognito). In Phase 1, these contracts map 1-to-1 to `IClassSpaceService` (`src/services/contracts.ts`).

All dates use `YYYY-MM-DD` and times use `HH:mm` (24-hour) in the `Asia/Kolkata` timezone.

---

## Authentication & Authorization (Phase 2 Target)

- **Student Endpoints**: Require valid Amazon Cognito JWT (`Authorization: Bearer <id_or_access_token>`). Student identity (`studentId`) is extracted strictly from JWT `sub` claims on the server, never trusted from request body.
- **Admin Endpoints (`/admin/*`)**: Require Cognito JWT membership in the `admin` group, verified by API Gateway JWT authorizer and re-checked inside Lambda handlers.

---

## Endpoints

### 1. `GET /rooms`
Lists all campus rooms.
- **Response `200 OK`**: `Room[]`

### 2. `GET /rooms/available`
Evaluates classroom availability for a requested time window and filters.
- **Query Params**:
  - `date` (`YYYY-MM-DD`, required)
  - `startTime` (`HH:mm`, required, must be `< endTime`)
  - `endTime` (`HH:mm`, required)
  - `minCapacity` (`integer >= 1`, required)
  - `blockId` (`string`, optional)
  - `floor` (`integer`, optional)
  - `facilities` (`comma-separated Facility[]`, optional)
- **Response `200 OK`**: `RoomAvailabilityResult[]` (each item contains `room`, `isAvailable`, `status`, `explanation`, `physicalOccupancyNotice`, `conflicts`, `pendingBookingsCount`).
- **Response `400 Bad Request`**: Invalid date/time format or `startTime >= endTime`.

### 3. `GET /rooms/{roomId}`
Retrieves full room details along with timetable slots, approved bookings, pending booking counts, and restrictions for a date.
- **Query Params**: `date` (`YYYY-MM-DD`, required)
- **Response `200 OK`**: `RoomDetailsResponse`
- **Response `404 Not Found`**: Room does not exist.

### 4. `POST /bookings`
Creates a student booking request in `PENDING` status.
- **Request Body**:
  ```json
  {
    "roomId": "room-ece-201",
    "date": "2026-11-19",
    "startTime": "16:00",
    "endTime": "17:00",
    "purpose": "Algorithms study circle"
  }
  ```
- **Server Rules**: Evaluates availability; rejects with `409 Conflict` if inactive, restricted, or overlapping a timetable entry or approved booking.
- **Response `201 Created`**: `Booking` (`status: "PENDING"`).

### 5. `GET /bookings/me`
Returns bookings belonging exclusively to the authenticated student (`sub` claim in Phase 2; `student-demo-01` in Phase 1).
- **Response `200 OK`**: `Booking[]`

### 6. `PATCH /admin/bookings/{id}`
Approves, rejects, or cancels a booking request.
- **Request Body**: `{ "status": "APPROVED" | "REJECTED" | "CANCELLED" }`
- **Server Rules**: If setting `APPROVED`, re-runs availability conflict detection against timetable, restrictions, and other approved bookings; returns `409 Conflict` if a conflict now exists.
- **Response `200 OK`**: Updated `Booking`.

### 7. `POST /admin/rooms`
Creates (or updates via `PATCH /admin/rooms/{roomId}`) a classroom record.
- **Request Body**:
  ```json
  {
    "blockId": "BLOCK-A",
    "floor": 2,
    "roomNumber": "ECE-205",
    "capacity": 45,
    "facilities": ["Projector", "Whiteboard"],
    "active": true
  }
  ```
- **Response `201 Created`**: `Room`.

### 8. `PUT /admin/timetable`
Creates or updates a timetable entry (`scheduleId` optional for creation, required for update).
- **Server Rules**: Checks same-room, same-date interval overlaps (`requestedStart < existingEnd && requestedEnd > existingStart`). Returns `409 Conflict` on overlap.
- **Response `200 OK` / `201 Created`**: `TimetableEntry`.

### 9. `POST /admin/restrictions`
Creates a room restriction window (`roomId`, `date`, `startTime`, `endTime`, `reason`).
- **Response `201 Created`**: `RoomRestriction`.
