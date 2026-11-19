# ClassSpace — REST / HTTP API v2 Reference

**Protocol:** API Gateway HTTP API (v2) + JWT Authorizer (`Amazon Cognito`)  
**Response Envelope:**
- Success: `{ "success": true, "data": <T>, "requestId": "<string>" }`
- Error: `{ "success": false, "error": { "code": "<ApiErrorCode>", "message": "<string>", "details": ... }, "requestId": "<string>" }`

**Error Codes:** `VALIDATION_ERROR` (400), `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `CONFLICT` (409), `RATE_LIMITED` (429), `INTERNAL_ERROR` (500).

---

## Endpoints Summary (15 Scoped Routes)

| Method & Path | Required OAuth Scope | Lambda Policy | Handler |
| :--- | :--- | :--- | :--- |
| `GET /rooms` | `classspace/read` | Authenticated (`sub`) | `rooms.ts` |
| `GET /rooms/{roomId}` | `classspace/read` | Authenticated (`sub`) | `rooms.ts` |
| `GET /rooms/available` | `classspace/read` | Authenticated (`sub`) | `availability.ts` |
| `POST /bookings` | `classspace/bookings/write` | Authenticated (`sub`) | `bookings.ts` |
| `GET /bookings/me` | `classspace/read` | Authenticated (`sub`) | `bookings.ts` |
| `GET /bookings/{id}` | `classspace/read` | Owner OR `admin` group | `bookings.ts` |
| `PATCH /bookings/{id}/cancel` | `classspace/bookings/write` | Owner OR `admin` group | `bookings.ts` |
| `POST /admin/rooms` | `classspace/admin` | `requireAdmin` (`cognito:groups` = `admin`) | `rooms.ts` |
| `PATCH /admin/rooms/{id}` | `classspace/admin` | `requireAdmin` (`cognito:groups` = `admin`) | `rooms.ts` |
| `GET /admin/bookings` | `classspace/admin` | `requireAdmin` (`cognito:groups` = `admin`) | `bookings.ts` |
| `PATCH /admin/bookings/{id}` | `classspace/admin` | `requireAdmin` (`cognito:groups` = `admin`) | `bookings.ts` |
| `PUT /admin/timetable` | `classspace/admin` | `requireAdmin` (`cognito:groups` = `admin`) | `schedules.ts` |
| `POST /admin/restrictions` | `classspace/admin` | `requireAdmin` (`cognito:groups` = `admin`) | `schedules.ts` |
| `GET /admin/schedules` | `classspace/admin` | `requireAdmin` (`cognito:groups` = `admin`) | `schedules.ts` |
| `DELETE /admin/schedules` | `classspace/admin` | `requireAdmin` (`cognito:groups` = `admin`) | `schedules.ts` |

---

## Key Behavioral Contracts

1. **`GET /rooms/available`** (Query: `date`, `startTime`, `endTime`, `minCapacity`, optional `blockId`, `floor`, `facilities`):
   - `startTime`/`endTime` must be 15-minute aligned (`00`, `15`, `30`, `45`), `startTime < endTime`, max search span 8 hours.
   - Evaluates authoritative strongly consistent `ClassSpaceSlotLocks` (`BatchGetItem`) and returns `SCHEDULE_VACANT`, `OCCUPIED_TIMETABLE`, `OCCUPIED_BOOKING`, `RESTRICTED`, `INACTIVE`, or `INSUFFICIENT_CAPACITY`, plus `physicalOccupancyNotice`.
2. **`POST /bookings`** (Optional Header: `Idempotency-Key`, Body: `{ roomId, date, startTime, endTime, purpose }`):
   - Max booking duration 4 hours, 15-minute aligned.
   - Creates `PENDING` booking (`201 Created`). Same `Idempotency-Key` + identical payload replays the existing booking (`200 OK`); mutated payload returns `409 CONFLICT`.
   - Rejects with `409 CONFLICT` if room is inactive or overlaps any locked `TIMETABLE`, `RESTRICTION`, or `APPROVED` booking slot.
3. **`PATCH /admin/bookings/{id}`** (Body: `{ status: "APPROVED" | "REJECTED" | "CANCELLED" }`):
   - `APPROVED` runs DynamoDB `TransactWriteItems`: `ConditionCheck` on room `active = true`, `Update` booking `PENDING -> APPROVED`, conditional `Put` on every 15-minute `SlotLockRecord` (`attribute_not_exists(lockKey)`). Loser returns `409 CONFLICT`.
   - `CANCELLED` from `APPROVED` deletes ONLY locks where `claimType = 'BOOKING' AND claimRefId = bookingId`.
