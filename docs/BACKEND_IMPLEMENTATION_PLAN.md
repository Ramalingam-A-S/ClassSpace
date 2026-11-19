# ClassSpace — API Gateway HTTP API & AWS Lambda Implementation Plan

**Phase Status:** Blueprint only. **No Lambda functions or API Gateway APIs have been created.**  
**Target Region:** `ap-south-1` (Asia Pacific – Mumbai)  
**Runtime:** Node.js 22.x (`arm64` Graviton2, TypeScript bundled with `esbuild`)

---

## 1. Transport Choice: API Gateway HTTP API (`apigatewayv2`)

ClassSpace selects **Amazon API Gateway HTTP API** over REST API v1 because:
- Substantially lower per-million request cost in `ap-south-1`.
- Native, zero-Lambda-cost **JWT Authorizer** for Amazon Cognito User Pools.
- Native CORS configuration and lower latency.
- None of REST API v1's extra features (AWS WAF association, request-body VTL transformations, usage-plan API keys, or edge-optimized caching) are required for Phase 2.

---

## 2. Endpoint Specifications

All endpoints return `application/json`, validate inputs with **Zod** schemas shared/aligned with [src/utils/validation.ts](file:///d:/ClassSpace/src/utils/validation.ts), and use `Asia/Kolkata` for `YYYY-MM-DD` / `HH:mm` semantics.

### Student & Discovery Endpoints

| Method & Path | Auth | Request Validation | Success Status & Body | Key Error Codes |
| :--- | :--- | :--- | :--- | :--- |
| `GET /rooms` | Cognito JWT | Optional query: `limit` (`1..100`), `nextToken` | `200 OK`: `{ items: Room[], nextToken?: string }` | `401`, `500` |
| `GET /rooms/available` | Cognito JWT | Query: `date` (`YYYY-MM-DD`), `startTime` (`HH:mm`), `endTime` (`HH:mm`, `start < end`), `minCapacity` (`1..500`), optional `blockId`, `floor`, `facilities` | `200 OK`: `{ items: RoomAvailabilityResult[], evaluatedAt: string }` | `400` (invalid range/date), `401` |
| `GET /rooms/{roomId}` | Cognito JWT | Path: `roomId`; Query: `date` (`YYYY-MM-DD`, defaults to today IST) | `200 OK`: `RoomDetailsResponse` (`room`, `date`, `timetable`, `approvedBookings`, `pendingBookingsCount` or sanitized `pendingBookings`, `restrictions`) | `400`, `401`, `404` |
| `POST /bookings` | Cognito JWT | Body: `roomId`, `date`, `startTime`, `endTime` (15-min aligned, `<= 4h`), `purpose` (`4..160` chars); Optional header: `Idempotency-Key` | `201 Created`: `Booking` (`status: "PENDING"`) | `400`, `401`, `404`, `409 Conflict` |
| `GET /bookings/me` | Cognito JWT | Optional query: `status`, `limit` (`1..50`), `nextToken`; `studentId` taken strictly from `jwt.sub` | `200 OK`: `{ items: Booking[], nextToken?: string }` | `401` |

### Administrator Endpoints (Require `admin` Cognito Group)

| Method & Path | Auth | Request Validation | Success Status & Body | Key Error Codes |
| :--- | :--- | :--- | :--- | :--- |
| `PATCH /admin/bookings/{id}` | JWT + `admin` | Path: `id`; Body: `{ status: "APPROVED" \| "REJECTED" \| "CANCELLED" }`; Optional `Idempotency-Key` | `200 OK`: Updated `Booking` | `400`, `401`, `403`, `404`, `409 Conflict` |
| `POST /admin/rooms` | JWT + `admin` | Body: `blockId`, `floor`, `roomNumber`, `capacity`, `facilities`, `active` | `201 Created`: `Room` | `400`, `401`, `403`, `409` (duplicate block+roomNumber) |
| `PATCH /admin/rooms/{id}` | JWT + `admin` | Path: `id`; Partial room fields (`blockId`, `floor`, `roomNumber`, `capacity`, `facilities`, `active`) | `200 OK`: Updated `Room` | `400`, `401`, `403`, `404`, `409` |
| `PUT /admin/timetable` | JWT + `admin` | Body: optional `scheduleId`, `roomId`, `date`, `startTime`, `endTime` (15-min aligned, `<= 8h`), `subject` | `200 OK` (update) / `201 Created` (create): `TimetableEntry` | `400`, `401`, `403`, `404`, `409 Conflict` |
| `POST /admin/restrictions` | JWT + `admin` | Body: `roomId`, `date`, `startTime`, `endTime` (15-min aligned), `reason` | `201 Created`: `RoomRestriction` | `400`, `401`, `403`, `404`, `409 Conflict` |

*(Note: Supporting admin endpoints aligned with `IClassSpaceService`—such as `GET /admin/bookings`, `GET /admin/snapshot`, `DELETE /admin/timetable/{id}`, and `DELETE /admin/restrictions/{id}`—can share the same Lambda handler modules in Phase 2.2.)*

---

## 3. Standard Response & Error Envelope (Implemented in Phase 2.3.1 Foundation)

All Lambda responses use `infra/lambda/shared/api-response.ts` and `infra/lambda/shared/error-handler.ts`:

- **Success Envelope:**
```json
{
  "success": true,
  "data": {},
  "requestId": "req-9f3a1c"
}
```
- **Error Envelope:**
```json
{
  "success": false,
  "error": {
    "code": "CONFLICT",
    "message": "The requested interval (10:00–11:00) overlaps an existing TIMETABLE claim.",
    "details": {
      "roomId": "room-ece-201",
      "date": "2026-11-19"
    }
  },
  "requestId": "req-9f3a1c"
}
```

### Standard HTTP Status Codes
- `200 OK` / `201 Created`: Operation succeeded.
- `400 Bad Request` (`VALIDATION_ERROR`): Strict Zod schema validation failure (invalid `YYYY-MM-DD`, `startTime >= endTime`, unaligned 15-min boundary, unexpected body fields, or invalid pagination bounds).
- `401 Unauthorized` (`UNAUTHORIZED`): Missing, malformed, or expired Cognito JWT (rejected at API Gateway or `AuthorizationError(401)`).
- `403 Forbidden` (`FORBIDDEN`): Authenticated user lacks exact `admin` Cognito group for `/admin/*` route (`requireAdmin()`).
- `404 Not Found` (`NOT_FOUND`): Room, booking, or timetable entry does not exist.
- `409 Conflict` (`CONFLICT`): Slot lock conflict, invalid status transition, or duplicate room identifier.
- `429 Too Many Requests` (`RATE_LIMITED`): API Gateway route throttling exceeded.
- `500 Internal Server Error` (`INTERNAL_ERROR`): Unexpected failure (logged safely with `requestId`; no stack trace or AWS SDK error returned).
- `503 Service Unavailable` (`SERVICE_UNAVAILABLE`): Deferred transactional operations in Phase 2.3.1 boundary.

---

## 4. Cross-Cutting Concerns

- **Pagination:** DynamoDB `LastEvaluatedKey` serialized as an opaque base64url `nextToken` query parameter, paired with a bounded `limit` (default `25`, max `100`).
- **Idempotency:**
  - `PUT /admin/timetable` with `scheduleId` and `PATCH /admin/rooms/{id}` are idempotent by target ID.
  - `POST /bookings` and `PATCH /admin/bookings/{id}` accept an `Idempotency-Key` header (UUIDv4) backed by a conditional check / short-TTL idempotency attribute to prevent duplicate mutations on client retries.
- **Logging:** Structured JSON logs via Lambda stdout -> CloudWatch Logs (`{ level, requestId, route, userSubRedacted, statusCode, durationMs }`). **Never** log Authorization headers, raw JWTs, email addresses, or AWS credentials. Log group retention set to **7–14 days**.
- **Rate Limiting:** Configure API Gateway HTTP API default stage throttling:
  - `ThrottlingBurstLimit`: `20` requests
  - `ThrottlingRateLimit`: `10` requests/second
  - Prevents accidental client loops or abuse from exhausting DynamoDB/Lambda budgets.
- **Lambda Sizing:** `128 MB–256 MB` memory, `10s` timeout, zero VPC attachment (avoids NAT Gateway cost), reusing DynamoDB DocumentClient across warm invocations.

---

## 5. Infrastructure as Code (IaC) Recommendation: AWS CDK (TypeScript) vs AWS SAM

| Criterion | AWS CDK (TypeScript) | AWS SAM (YAML + esbuild) |
| :--- | :--- | :--- |
| **Language alignment** | Native TypeScript; shares `src/types/domain.ts`, Zod schemas, and `availabilityEngine.ts` directly with Lambda & infra constructs. | YAML template (`template.yaml`) + separate TypeScript build config for Lambdas. |
| **Cognito + HTTP API + DynamoDB ergonomics** | Strong high-level L2 constructs (`UserPool`, `HttpApi`, `HttpJwtAuthorizer`, `NodejsFunction`, `TableV2`) with compile-time type checks. | Concise YAML for simple APIs, but HTTP API JWT authorizers + Cognito groups + multi-table IAM policies require verbose CloudFormation properties. |
| **Bootstrap footprint** | Requires one-time `cdk bootstrap` (creates `CDKToolkit` S3 bucket + IAM roles; minimal S3 storage pennies, zero idle compute). | `sam deploy --guided` creates a managed S3 staging bucket + CloudFormation stack. |
| **Local testing** | `cdk synth` validates CloudFormation output offline; Vitest tests pure domain/handler code. | `sam local start-api` (requires Docker). |

### Recommendation
Choose **AWS CDK (TypeScript)** in an isolated `infra/` directory (to be created only in **Phase 2.2** after user approval).
- **Why:** ClassSpace is already a strict TypeScript project. Using AWS CDK in TypeScript lets the team share Zod validation schemas, domain models, and `availabilityEngine.ts` between the React frontend, AWS Lambda handlers, and CDK stack definitions—eliminating schema drift.
- **Safety Gate:** No CDK stack files or `cdk deploy` commands are created or executed in Phase 2.1.
