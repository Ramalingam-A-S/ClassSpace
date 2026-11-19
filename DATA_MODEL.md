# ClassSpace — DynamoDB Data Model & Transaction Design

**Database:** Amazon DynamoDB (`PAY_PER_REQUEST`, Standard table class, PITR disabled, Streams disabled, `ap-south-1`).  
**Campus Time Semantics:** `Asia/Kolkata` (`YYYY-MM-DD`, `HH:mm`).  
**Query Guarantee:** Zero `dynamodb:Scan` calls anywhere in the backend.

---

## Tables & Indexes

| Table / GSI | Partition Key | Sort Key | Purpose |
| :--- | :--- | :--- | :--- |
| **`ClassSpaceRooms`** | `roomId` (`S`) | — | Authoritative room metadata (`blockId`, `floor`, `roomNumber`, `capacity`, `facilities`, `active`, `dataSource`) |
| ↳ `GSI_BlockFloor` | `blockId` (`S`) | `floorRoomKey` (`S`) | Ordered room lookup by block & floor (`01#A-101`) |
| **`ClassSpaceSchedules`** | `roomDateKey` (`S`) | `scheduleKey` (`S`) | Unified chronological timetable & restriction items (`roomId#YYYY-MM-DD`, `<startTime>#TT#<id>` or `<startTime>#RES#<id>`) |
| **`ClassSpaceBookings`** | `bookingId` (`S`) | — | Student booking lifecycle (`PENDING`, `APPROVED`, `REJECTED`, `CANCELLED`), optional `idempotencyKey` |
| ↳ `GSI_StudentBookings` | `studentId` (`S`) | `createdAt` (`S`) | Reverse-chronological booking history per student |
| ↳ `GSI_RoomDateBookings` | `roomDateKey` (`S`) | `statusStartKey` (`S`) | Room/date booking inspection by status prefix (`PENDING#10:00#...`) |
| **`ClassSpaceSlotLocks`** | `lockKey` (`S`) | — | Authoritative 15-min half-open `[start, end)` slot locks (`roomId#YYYY-MM-DD#HH:mm`, `claimType`, `claimRefId`) |

---

## Atomic Concurrency & Transaction Budget (`<= 100` DynamoDB Action Limit)

- **Granularity:** `SLOT_MINUTES = 15`.
- **Max Booking Span:** `4 hours` = `16` lock items. Total `approveBooking` transaction size: `1 Room ConditionCheck + 1 Booking Update + <=16 SlotLock Puts = <=18 actions` (well below DynamoDB's 100-item `TransactWriteItems` ceiling).
- **Max Timetable / Restriction Span:** `8 hours` = `32` lock items. Update diffs existing vs new lock keys (`diffSlotLockKeys`) so unchanged locks stay intact (`<= 66` worst-case actions).
- **Ownership Guard on Release:** Cancelling an approved booking or deleting a schedule checks `claimType = :expected AND claimRefId = :id` on every deleted `lockKey`, mapping `TransactionCanceledException` cleanly to `409 CONFLICT`.
