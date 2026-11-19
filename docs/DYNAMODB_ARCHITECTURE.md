# ClassSpace — Target Amazon DynamoDB Architecture

**Region:** `ap-south-1` (Asia Pacific – Mumbai)  
**Table Class:** DynamoDB Standard  
**Source of Truth:** [src/types/domain.ts](file:///d:/ClassSpace/src/types/domain.ts) & [src/services/contracts.ts](file:///d:/ClassSpace/src/services/contracts.ts)  
**Cost Guardrail:** Minimal GSIs (only what access patterns strictly require); no PITR, Streams, Global Tables, or DynamoDB Backups enabled by default in Development.

---

## 1. Table Overview

| Table Name | Primary Key | GSIs | Purpose |
| :--- | :--- | :--- | :--- |
| `ClassSpaceRooms` | `PK: roomId` | `GSI_BlockFloor` (`blockId`, `floor#roomNumber`) | Room registry, metadata, capacity, facilities, active flag |
| `ClassSpaceSchedules` | `PK: roomId#date`, `SK: <startTime>#TT#<scheduleId>` / `<startTime>#RES#<restrictionId>` (`scheduleKey`) | None | Daily timetable entries (`TT`) and admin restrictions (`RES`) sorted chronologically across record types |
| `ClassSpaceBookings` | `PK: bookingId` | `GSI_StudentBookings`, `GSI_RoomDateBookings` | Student booking lifecycle (`PENDING`, `APPROVED`, `REJECTED`, `CANCELLED`) |
| `ClassSpaceSlotLocks` | `PK: lockKey` (`roomId#date#HH:mm`) | None (TTL disabled unless formal expiry proof exists) | Atomic 15-minute slot conflict claims across `TIMETABLE`, `BOOKING`, and `RESTRICTION` |

---

## 2. Detailed Table Schemas

### Table 1: `ClassSpaceRooms`
Stores canonical classroom metadata matching `Room` in `src/types/domain.ts`.

- **Partition Key (`PK`):** `roomId` (`S`) — e.g., `"room-ece-201"`
- **Attributes:**
  - `blockId` (`S`) — e.g., `"BLOCK-A"`
  - `floor` (`N`) — e.g., `2`
  - `roomNumber` (`S`) — e.g., `"ECE-201"`
  - `capacity` (`N`) — e.g., `60`
  - `facilities` (`L` of `S`) — e.g., `["Projector", "Whiteboard"]`
  - `active` (`BOOL`) — `true` / `false`
  - `dataSource` (`S`) — `'DEMO' | 'ADMIN_ENTERED' | 'VERIFIED_INSTITUTIONAL'`
  - `blockRoomUniqueKey` (`S`) — `"BLOCK-A#ECE-201"` (used for uniqueness enforcement or lookup)
  - `updatedAt` (`S`) — ISO 8601 UTC/IST timestamp
- **GSI 1 (`GSI_BlockFloor`):**
  - `PK`: `blockId` (`S`)
  - `SK`: `floorRoomKey` (`S`) — zero-padded `"02#ECE-201"`
  - Projection: `ALL` (small item size < 500 bytes; 10–100 campus rooms)
- **Access Patterns Supported:**
  - Room lookup by `roomId` -> `GetItem` on base table.
  - List all rooms -> `Scan` (acceptable only because a single block/campus has < 500 rooms; cached/bounded) or `Query` on `GSI_BlockFloor` when `blockId` is specified.
  - Search by `blockId` and `floor` -> `Query` `GSI_BlockFloor` with `begins_with(floorRoomKey, "02#")`.

---

### Table 2: `ClassSpaceSchedules`
Stores both `TimetableEntry` and `RoomRestriction` records partitioned by room and calendar date (`Asia/Kolkata`).

- **Partition Key (`PK`):** `roomDateKey` (`S`) — `"room-ece-201#2026-11-19"`
- **Sort Key (`SK`):** `scheduleKey` (`S`) — **time-first** so both timetable entries and restrictions sort chronologically in a single `Query`:
  - Timetable entries: `"<startTime>#TT#<scheduleId>"` (e.g., `"09:00#TT#tt-01"`)
  - Restrictions: `"<startTime>#RES#<restrictionId>"` (e.g., `"10:00#RES#res-01"`)
- **Attributes (Timetable):**
  - `itemType` (`S`): `"TIMETABLE"`
  - `scheduleId` (`S`), `roomId` (`S`), `date` (`S`), `startTime` (`S`), `endTime` (`S`), `subject` (`S`), `dataSource` (`S`)
- **Attributes (Restriction):**
  - `itemType` (`S`): `"RESTRICTION"`
  - `restrictionId` (`S`), `roomId` (`S`), `date` (`S`), `startTime` (`S`), `endTime` (`S`), `reason` (`S`), `dataSource` (`S`)
- **Access Patterns Supported:**
  - Combined chronological room schedule (`GET /rooms/{roomId}?date=YYYY-MM-DD`) -> Single `Query` on `PK = roomId#date` returns both `TT` and `RES` records interleaved in chronological order by `startTime`.
  - Filtering by record type in Lambda -> filter on `#TT#` vs `#RES#` segment after single chronological `Query`.
- **Availability Rule:** Do **not** rely exclusively on `GSI_RoomDateBookings` (eventually consistent) or `ClassSpaceSchedules` alone for blocking checks; `ClassSpaceSlotLocks` is the authoritative source for atomic blocking interval claims.

---

### Table 3: `ClassSpaceBookings`
Stores student booking requests matching `Booking` in `src/types/domain.ts`.

- **Partition Key (`PK`):** `bookingId` (`S`) — e.g., `"bk-0192"`
- **Attributes:**
  - `roomId` (`S`)
  - `studentId` (`S`) — Cognito JWT `sub` (never client-supplied)
  - `studentName` (`S`) — derived from JWT claims
  - `purpose` (`S`)
  - `date` (`S`) — `YYYY-MM-DD` (`Asia/Kolkata`)
  - `startTime` (`S`) — `HH:mm`
  - `endTime` (`S`) — `HH:mm`
  - `status` (`S`) — `'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'`
  - `createdAt` (`S`) — ISO 8601 timestamp
  - `updatedAt` (`S`)
  - `dataSource` (`S`) — `'ADMIN_ENTERED'` or `'DEMO'`
  - `idempotencyKey` (`S`, optional)
  - `roomDateKey` (`S`) — `"room-ece-201#2026-11-19"`
  - `statusStartKey` (`S`) — `"APPROVED#10:00#bk-0192"`
  - `adminPendingKey` (`S`, sparse attribute set **only** while `status === 'PENDING'`) — `"PENDING"`
- **GSI 1 (`GSI_StudentBookings`):**
  - `PK`: `studentId` (`S`)
  - `SK`: `createdAt` (`S`) (enables newest-first `ScanIndexForward: false` pagination for `GET /bookings/me`)
  - Projection: `ALL`
- **GSI 2 (`GSI_RoomDateBookings`):**
  - `PK`: `roomDateKey` (`S`) — `"room-ece-201#2026-11-19"`
  - `SK`: `statusStartKey` (`S`) — `"APPROVED#10:00#bk-0192"`
  - Projection: `ALL`
  - Supports querying all bookings for a room+date, or specifically `begins_with(statusStartKey, "APPROVED#")` for availability checks and `GET /rooms/{roomId}`.
- **Admin Pending Queue Note:** Rather than adding a 3rd GSI immediately (which increases write cost), pending count/queue at campus-block scale can use a filtered `Query` on `GSI_RoomDateBookings` for target dates or a small `ClassSpaceBookings` scan while total bookings < 1,000; if pending bookings grow, a sparse GSI on `(adminPendingKey, createdAt)` can be evaluated with explicit cost approval.

---

### Table 4: `ClassSpaceSlotLocks`
Enforces atomic, race-free 15-minute interval exclusivity across all three blocking claim types (`TIMETABLE`, `BOOKING`, `RESTRICTION`).

- **Partition Key (`PK`):** `lockKey` (`S`) — `"<roomId>#<date>#<slotStartHHmm>"`, e.g., `"room-ece-201#2026-11-19#10:00"`
- **Attributes:**
  - `roomId` (`S`)
  - `date` (`S`)
  - `slotStart` (`S`) — `"10:00"` (represents `[10:00, 10:15)`)
  - `claimType` (`S`) — `'TIMETABLE' | 'BOOKING' | 'RESTRICTION'`
  - `claimRefId` (`S`) — `scheduleId`, `bookingId`, or `restrictionId`
  - `createdAt` (`S`)
  - **TTL Status:** **Disabled** in Phase 2.2 (no `TimeToLiveSpecification` configured) because DynamoDB TTL deletion is asynchronous and must not be enabled unless runtime logic formally proves historical locks cannot expire before their scheduled `Asia/Kolkata` end time.

---

## 3. How Access Patterns Map to Tables

| Access Pattern | DynamoDB Operation |
| :--- | :--- |
| Room lookup (`GET /rooms/{roomId}`) | `GetItem(ClassSpaceRooms, roomId)` |
| Room search by block & floor (`GET /rooms/available`) | `Query(ClassSpaceRooms.GSI_BlockFloor)` + filter `capacity >= minCapacity`, `active === true`, `facilities` |
| Daily timetable & restrictions for room | `Query(ClassSpaceSchedules, PK = roomId#date)` |
| Approved & pending bookings for room + date | `Query(ClassSpaceBookings.GSI_RoomDateBookings, PK = roomId#date)` |
| Student booking history (`GET /bookings/me`) | `Query(ClassSpaceBookings.GSI_StudentBookings, PK = jwt.sub, ScanIndexForward=false)` |
| Availability calculation (`GET /rooms/available`) | Query active candidate rooms -> batch/parallel queries on `ClassSpaceSchedules` (`roomId#date`) and `ClassSpaceBookings.GSI_RoomDateBookings` (`roomId#date`, `APPROVED#`) -> run `evaluateRoomAvailability` logic |
| Conflict-safe approve / timetable / restriction write | `TransactWriteItems` inserting/deleting 15-min slot locks in `ClassSpaceSlotLocks` + updating `ClassSpaceBookings` or `ClassSpaceSchedules` |
