# ClassSpace — Phase 2.3.1 Backend Foundation Review

**Scope:** Local backend application foundation inside `D:\ClassSpace\infra\lambda\` (zero AWS deployments, zero business logic yet).

---

## 1. Standard Response & Error Contract

- **Success Envelope (`api-response.ts`):**
  ```json
  { "success": true, "data": {}, "requestId": "..." }
  ```
- **Error Envelope (`api-response.ts` & `error-handler.ts`):**
  ```json
  { "success": false, "error": { "code": "...", "message": "...", "details": {} }, "requestId": "..." }
  ```
- **Error Mapping (`api-error.ts` & `error-handler.ts`):**
  - `VALIDATION_ERROR`: `400` (including `ZodError` mapped to safe field-level `{ path, message }` issues)
  - `UNAUTHORIZED`: `401` (`AuthorizationError(401)` — missing/malformed JWT `sub` or missing authorizer context)
  - `FORBIDDEN`: `403` (`AuthorizationError(403)` — missing exact `admin` group in `cognito:groups`)
  - `NOT_FOUND`: `404`
  - `CONFLICT`: `409`
  - `RATE_LIMITED`: `429`
  - `INTERNAL_ERROR`: `500` (unknown exceptions; zero stack traces or AWS SDK error strings exposed)
  - `SERVICE_UNAVAILABLE`: `503`

---

## 2. Input Validation (`schemas/` & `shared/validation.ts`)

- Strict `.strict()` Zod schemas reject unexpected client fields (preventing client-supplied `studentId`, `role`, or `ExclusiveStartKey` injection).
- `dateSchema`: `YYYY-MM-DD` with strict calendar date validation (rejects `2026-02-30`).
- `timeSchema` & `timeRangeSchema`: 24-hour `HH:mm` with `startTime < endTime`.
- `paginationQuerySchema`: `limit` positive integer `1..50` (default `25`, max `50`); `nextToken` opaque base64url token only.

---

## 3. Authentication vs Authorization Distinction (`shared/request-context.ts`)

- `authorizeRouteCaller(event, contract)` enforces:
  1. `AUTHENTICATED_USER`: extracts `studentId` strictly from verified JWT `sub` via `getAuthenticatedStudentId(event)`.
  2. `ADMIN_GROUP_REQUIRED`: enforces `requireAdmin(event)` (`cognito:groups` includes exact lowercase `'admin'`).
- **Scope vs Group Guarantee:** API Gateway validates OAuth scopes (`classspace/read`, `classspace/bookings/write`, `classspace/admin`), while Lambda independently enforces `cognito:groups` `'admin'` membership. A student holding `classspace/admin` scope without the `'admin'` group is rejected with `403 FORBIDDEN`.

---

## 4. Structured JSON Logging & Redaction (`shared/logger.ts`)

- Emits single-line JSON (`timestamp`, `level`, `requestId`, `route`, `message`, optional `metadata`).
- Recursively redacts sensitive keys (`authorization`, `accessToken`, `refreshToken`, `idToken`, `password`, `clientSecret`, `secret`, `token`, `cookie`, `x-api-key`, `credential`) to `'[REDACTED]'` and Bearer/JWT strings (`eyJ...`) to `'[REDACTED_TOKEN]'`.
- Never logs raw request headers, JWT claims wholesale, or request bodies by default.

---

## 5. Repository Abstraction & DynamoDB Adapter Boundary

- **Interfaces (`lambda/repositories/interfaces/`):** `RoomRepository`, `ScheduleRepository`, `BookingRepository`, `SlotLockRepository`, and `RepositoryContext`.
- **DynamoDB Adapter (`lambda/repositories/dynamodb/repository-context.ts`):**
  - Uses AWS SDK v3 (`@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb`).
  - Accepts injected `DynamoDBDocumentClient` via factory; creates zero AWS clients at module import time.
  - Uses `ConsistentRead: true` on `ClassSpaceSlotLocks` `BatchGetCommand` and aligns with the 4-table key design (`GSI_BlockFloor`, `GSI_StudentBookings`, `GSI_RoomDateBookings`, time-first `scheduleKey`, `lockKey`).
  - Transactional write methods (`TransactWriteItems`) are explicitly deferred to Phase 2.3.2 (`503 SERVICE_UNAVAILABLE`).
- **In-Memory Repository (`lambda/repositories/memory/in-memory-context.ts`):** Isolated per-instance store for unit testing; does not replace Phase 1 `MockClassSpaceService` and does not claim to prove DynamoDB transaction correctness.
