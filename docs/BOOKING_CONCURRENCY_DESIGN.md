# ClassSpace — Booking Concurrency & Conflict Prevention Design

**Phase Status:** Architecture specification only. Not yet implemented in code.  
**Core Invariant:** No two overlapping `TIMETABLE`, `APPROVED BOOKING`, or `RESTRICTION` claims may ever exist for the same `(roomId, date)` interval.

---

## 1. Why Query-Then-Write Fails

In a serverless Lambda + DynamoDB backend, a naive "query `ClassSpaceSchedules` & `ClassSpaceBookings`, check overlap in memory, then `PutItem`/`UpdateItem`" sequence suffers from a **Time-of-Check to Time-of-Use (TOCTOU)** race condition:

1. Admin A approves Student 1's booking for `ECE-201` (`10:00–11:00`).
2. Milliseconds earlier/concurrently, Admin B approves Student 2's booking for `ECE-201` (`10:30–11:30`), or adds a `10:15–11:15` timetable entry.
3. Both Lambdas read zero conflicts, and both succeed—creating double-booked intervals.

Because DynamoDB cannot run range-overlap SQL exclusion constraints (`EXCLUDE USING gist`) across arbitrary `[startTime, endTime)` strings, ClassSpace solves this deterministically using **discrete 15-minute slot locks** in `ClassSpaceSlotLocks` combined with **`TransactWriteItems`**.

---

## 2. Unified 15-Minute Slot-Claim Strategy

All three blocking concepts share **one unified lock table** (`ClassSpaceSlotLocks`) with `claimType` in `{ TIMETABLE, BOOKING, RESTRICTION }`:

- **Slot Granularity:** All start and end times for bookings, timetable entries, and restrictions are validated to align on **15-minute boundaries** (`:00`, `:15`, `:30`, `:45`), with `startTime < endTime`.
- **Half-Open Mapping `[startTime, endTime)`:**
  - Example: `10:00–11:00` expands to 4 slot keys:
    - `<roomId>#<date>#10:00`
    - `<roomId>#<date>#10:15`
    - `<roomId>#<date>#10:30`
    - `<roomId>#<date>#10:45`
  - Adjacent booking `11:00–12:00` expands to `11:00`, `11:15`, `11:30`, `11:45` — zero key overlap, so adjacent slots always succeed!
  - Overlapping booking `10:30–11:30` attempts to claim `10:30` and `10:45`, which already exist -> transaction atomically fails with `TransactionCanceledException` (`ConditionalCheckFailed`) -> API returns `409 Conflict`.

### Why All Three Claim Types Must Share `ClassSpaceSlotLocks`
If `TIMETABLE` and `RESTRICTION` wrote only to `ClassSpaceSchedules` without claiming locks in `ClassSpaceSlotLocks`, an administrator editing a timetable could accidentally overwrite or conflict with an already-`APPROVED` student booking (or vice versa). Sharing `ClassSpaceSlotLocks` guarantees:
- Approving a booking fails if a timetable or restriction owns any overlapping 15-minute slot.
- Adding or editing a timetable entry fails if an approved booking, another timetable entry, or a restriction owns any overlapping 15-minute slot.
- Adding a restriction fails if an approved booking already owns a slot (requiring admin to cancel/reject the conflicting booking explicitly rather than silently breaking a confirmed reservation), or—if a separate emergency override workflow is added in future—forcing explicit cancellation of conflicting bookings first.

---

## 3. DynamoDB `TransactWriteItems` Limits & Duration Cap

- **Hard AWS Limit:** DynamoDB `TransactWriteItems` supports a maximum of **100 action requests** (`Put`, `Update`, `Delete`, `ConditionCheck`) per transaction, targeting distinct items with <= 4 MB aggregate size.
- **Impact on Booking Duration:**
  - Capping student bookings at a **4-hour maximum duration** (`16` slots of 15 minutes) keeps a booking approval transaction to **18 actions total**:
    - `1` `ConditionCheck` on `ClassSpaceRooms` (`active = :true`)
    - `1` `Update` on `ClassSpaceBookings` (`#status = :pending`)
    - `16` `Put` items on `ClassSpaceSlotLocks` (`attribute_not_exists(lockKey)`)
    - **18 <= 100** (leaves huge headroom below the 100-item limit).
  - For timetable entries and restrictions, an **8-hour single-entry cap** uses at most `32 + 1 = 33` actions (still well under 100). Full-day restrictions (e.g., 08:00–20:00 = 48 slots) also fit within `49 <= 100`!

---

## 4. Exact Conditional-Write Flows

### A. Student Creates Request (`POST /bookings`)
- **Status:** Enters `PENDING` (does **not** claim slot locks in `ClassSpaceSlotLocks`, preserving Phase 1 rule: pending bookings never block availability).
- **Pre-check:** Lambda verifies room is `active`, duration <= 4 hours, times are 15-min aligned, and no existing `ClassSpaceSlotLocks` keys exist for the requested slots (so students get immediate `409 Conflict` feedback rather than submitting impossible requests).
- **Idempotency:** Supports `Idempotency-Key` header (or deterministic `ClassSpaceIdempotency` / conditional `Put` on `bookingId` + client request token) to prevent duplicate `PENDING` records on network retries.

### B. Admin Approves Booking (`PATCH /admin/bookings/{id}` -> `APPROVED`)
Single `TransactWriteItems` call:
1. `ConditionCheck` on `ClassSpaceRooms` (`PK = roomId`): `attribute_exists(roomId) AND active = :true`
2. `Update` on `ClassSpaceBookings` (`PK = bookingId`):
   - `ConditionExpression: "#st = :pending"`
   - `SET #st = :approved, statusStartKey = :approvedKey, updatedAt = :now`
   - `REMOVE adminPendingKey` (if sparse index is used)
3. For each 15-min slot in `[startTime, endTime)`:
   - `Put` on `ClassSpaceSlotLocks`:
     - Item: `{ lockKey, roomId, date, slotStart, claimType: "BOOKING", claimRefId: bookingId, createdAt }`
     - `ConditionExpression: "attribute_not_exists(lockKey)"`

**Simultaneous Approvals Outcome:** If two admins approve overlapping bookings at the exact same millisecond, DynamoDB serializes the transactions: one succeeds and updates status to `APPROVED`; the second fails with `TransactionCanceledException` (`ConditionalCheckFailed` on one of the `lockKey` items), leaving the second booking untouched in `PENDING` and returning `409 Conflict`.

### C. Admin Rejects Pending Booking (`PATCH /admin/bookings/{id}` -> `REJECTED`)
Single conditional `UpdateItem` on `ClassSpaceBookings`:
- `ConditionExpression: "#st = :pending"`
- `SET #st = :rejected, statusStartKey = :rejectedKey, updatedAt = :now`
- No `ClassSpaceSlotLocks` changes needed since `PENDING` never held locks.

### D. Cancellation & Lock Release (`PATCH /admin/bookings/{id}` or student cancel -> `CANCELLED`)
- **If `PENDING`:** Single conditional `UpdateItem` on `ClassSpaceBookings` (`#st = :pending` -> `CANCELLED`). No locks to release.
- **If `APPROVED`:** Single `TransactWriteItems` call:
  1. `Update` on `ClassSpaceBookings`: `ConditionExpression: "#st = :approved"` -> `SET #st = :cancelled, statusStartKey = :cancelledKey, updatedAt = :now`
  2. For each 15-min slot in `[startTime, endTime)`:
     - `Delete` on `ClassSpaceSlotLocks`:
       - `Key: { lockKey }`
       - `ConditionExpression: "claimType = :booking AND claimRefId = :bookingId"`
  - Ensuring `claimRefId = :bookingId` guarantees a cancellation can never accidentally delete another booking's or timetable's lock.

### E. Timetable Upsert (`PUT /admin/timetable`) & Edit
- **New Entry:** `TransactWriteItems` with:
  1. `ConditionCheck` on `ClassSpaceRooms` (`attribute_exists(roomId)`)
  2. `Put` on `ClassSpaceSchedules` (`ConditionExpression: "attribute_not_exists(SK)"`)
  3. `Put` N slot locks in `ClassSpaceSlotLocks` (`claimType: "TIMETABLE"`, `claimRefId: scheduleId`, `ConditionExpression: "attribute_not_exists(lockKey)"`)
- **Edit Existing Entry:** `TransactWriteItems` computing the **diff** of 15-minute slots between old `[oldStart, oldEnd)` and new `[newStart, newEnd)` (on same `(roomId, date)`):
  - `Delete` locks in `(oldSlots - newSlots)` conditioned on `claimRefId = :scheduleId`.
  - `Put` locks in `(newSlots - oldSlots)` conditioned on `attribute_not_exists(lockKey)`.
  - Overlapping unchanged slots `(oldSlots ∩ newSlots)` are **not** touched in the same transaction (respecting DynamoDB's rule that no two actions in a transaction may target the same item!).
  - `Update` the item in `ClassSpaceSchedules` (or delete old SK + put new SK if `startTime` changed).

### F. Restriction Create (`POST /admin/restrictions`) & Delete
- **Create:** `TransactWriteItems` putting `RES#...` into `ClassSpaceSchedules` + claiming 15-min slot locks in `ClassSpaceSlotLocks` (`claimType: "RESTRICTION"`, `claimRefId: restrictionId`, `attribute_not_exists(lockKey)`).
- **Delete:** `TransactWriteItems` deleting `RES#...` from `ClassSpaceSchedules` + deleting matching locks conditioned on `claimRefId = :restrictionId`.

---

## 5. Failure Handling, Idempotency & Partial Recovery

- **Atomicity:** Because `TransactWriteItems` is all-or-nothing, partial lock creation cannot happen—either all 15-minute slots and the booking/schedule record commit together, or none do.
- **Retry & Duplicate Submissions:**
  - Read operations and `PUT /admin/timetable` (when `scheduleId` is supplied) are naturally idempotent.
  - `POST /bookings` uses a client-supplied `Idempotency-Key` (or `ClientRequestToken` stored on a lightweight idempotency record or conditional check) so double-clicks or mobile retries return the originally created `PENDING` booking instead of duplicates.
  - `PATCH /admin/bookings/{id}` uses strict state precondition (`#st = :pending` for approve/reject; `#st = :approved` or `:pending` for cancel) plus `ClientRequestToken` checking: if an already-`APPROVED` booking is approved again with the same `Idempotency-Key`, return `200 OK`; otherwise return `409 Conflict` explaining its current state.
- **Failed Transaction Diagnostics:** Inspect `CancellationReasons` returned by DynamoDB `TransactionCanceledException` inside Lambda to distinguish `ConditionalCheckFailed` (409 Conflict) from transient `TransactionConflict` (retryable with jittered exponential backoff).
