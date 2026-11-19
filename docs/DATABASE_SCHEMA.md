# ClassSpace — Logical & Phase 2 Database Schema

## 1. Phase 1 Storage Model

In Phase 1, records are stored as JSON collections inside `LocalMockRepository` (`src/services/mockRepository.ts`) with a `DemoDataset` structure:
- `rooms: Room[]`
- `timetable: TimetableEntry[]`
- `bookings: Booking[]`
- `restrictions: RoomRestriction[]`
- `activities: ActivityEvent[]`

Every demonstration record carries `dataSource: 'DEMO'` and never uses `'VERIFIED_INSTITUTIONAL'`.

---

## 2. Core Entities

### `rooms`
| Field | Type | Constraints | Notes |
| :--- | :--- | :--- | :--- |
| `roomId` | `string` (PK) | Unique, non-empty | e.g., `room-ece-201` |
| `blockId` | `string` | Uppercase alphanumeric + `-` | e.g., `BLOCK-A` |
| `floor` | `number` | Integer `0..20` | Floor number |
| `roomNumber` | `string` | Unique within `(blockId, roomNumber)` | e.g., `ECE-201` |
| `capacity` | `number` | Integer `1..500` | Seating capacity |
| `facilities` | `Facility[]` | Non-empty array | Projector, AC, Smart Board, etc. |
| `active` | `boolean` | Required | Inactive rooms excluded from search |
| `dataSource` | `DataSource` | `'DEMO' \| 'ADMIN_ENTERED' \| 'VERIFIED_INSTITUTIONAL'` | Always `'DEMO'` in Phase 1 |

### `timetable_entries`
| Field | Type | Constraints | Notes |
| :--- | :--- | :--- | :--- |
| `scheduleId` | `string` (PK) | Unique | e.g., `tt-demo-01` |
| `roomId` | `string` (FK -> `rooms.roomId`) | Required | Target room |
| `date` | `string` | `YYYY-MM-DD` (`Asia/Kolkata`) | Calendar date |
| `startTime` | `string` | `HH:mm` (`startTime < endTime`) | 24-hour IST |
| `endTime` | `string` | `HH:mm` | 24-hour IST |
| `subject` | `string` | `2..80` chars | Fictional subject label in Phase 1 |
| `dataSource` | `DataSource` | Enum | `'DEMO'` in Phase 1 |

Invariant: No two entries for the same `(roomId, date)` may satisfy `startA < endB && endA > startB`.

### `bookings`
| Field | Type | Constraints | Notes |
| :--- | :--- | :--- | :--- |
| `bookingId` | `string` (PK) | Unique | e.g., `bk-demo-01` |
| `roomId` | `string` (FK -> `rooms.roomId`) | Required | Target room |
| `studentId` | `string` | Required | Cognito `sub` in Phase 2 |
| `studentName` | `string` | Optional display name | Demo student label |
| `purpose` | `string` | `4..160` chars | Activity description |
| `date` | `string` | `YYYY-MM-DD` (`Asia/Kolkata`) | Requested date |
| `startTime` | `string` | `HH:mm` (`startTime < endTime`) | 24-hour IST |
| `endTime` | `string` | `HH:mm` | 24-hour IST |
| `status` | `BookingStatus` | `'PENDING' \| 'APPROVED' \| 'REJECTED' \| 'CANCELLED'` | Only `'APPROVED'` blocks availability |
| `createdAt` | `string` | ISO 8601 timestamp | Creation time |
| `dataSource` | `DataSource` | Enum | `'DEMO'` in Phase 1 |

### `room_restrictions`
| Field | Type | Constraints | Notes |
| :--- | :--- | :--- | :--- |
| `restrictionId` | `string` (PK) | Unique | e.g., `res-demo-01` |
| `roomId` | `string` (FK -> `rooms.roomId`) | Required | Target room |
| `date` | `string` | `YYYY-MM-DD` (`Asia/Kolkata`) | Restricted date |
| `startTime` | `string` | `HH:mm` (`startTime < endTime`) | 24-hour IST |
| `endTime` | `string` | `HH:mm` | 24-hour IST |
| `reason` | `string` | `3..160` chars | Reason for unavailability |
| `dataSource` | `DataSource` | Enum | `'DEMO'` in Phase 1 |

---

## 3. Phase 2 AWS Persistence Mapping (Amazon DynamoDB / RDS)

When migrating to AWS:
- **Option A (DynamoDB Single-Table or Multi-Table)**:
  - `ClassSpaceRooms`: PK `roomId`, GSI on `blockId#floor`
  - `ClassSpaceSchedules`: PK `ROOM#<roomId>#DATE#<YYYY-MM-DD>`, SK `TT#<startTime>#<scheduleId>` and `RES#<startTime>#<restrictionId>`
  - `ClassSpaceBookings`: PK `BOOKING#<bookingId>`, GSI1 `STUDENT#<studentId>#CREATED#<createdAt>`, GSI2 `ROOM#<roomId>#DATE#<YYYY-MM-DD>`
- **Option B (Amazon Aurora PostgreSQL)**:
  - Enforce overlap prevention directly at the database level using `EXCLUDE USING gist` with `tsrange` constraints on `(room_id, slot_range)` for timetable entries and approved bookings.
