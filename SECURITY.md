# ClassSpace — Security Architecture & Controls

ClassSpace implements defense-in-depth across the SPA client, API Gateway HTTP API v2, AWS Lambda handlers, IAM policies, and DynamoDB persistence.

---

## 1. Authentication & Token Handling (Amazon Cognito + PKCE)

- **Public SPA Client Only:** `classspace-dev-web-spa` is configured with `GenerateSecret = false`, `AllowedOAuthFlows = ['code']`, and implicit flow disabled (`AllowedOAuthFlowsUserPoolClient = true`).
- **Authorization Code + PKCE (`S256`):** Frontend generates a random 48-byte high-entropy `code_verifier`, hashes with WebCrypto `SHA-256` to `code_challenge`, and verifies CSRF `state` during the `/auth/callback` code exchange (`src/services/cognitoAuth.ts`).
- **Zero Persistent Token Storage:** Access and ID tokens are stored **only in React / JS heap memory** and never written to `localStorage` or cookies. Closing or refreshing the tab clears live tokens (`clearAuthSession()`).
- **Cognito Domain & Cost-Safe MFA:** AWS-managed prefix domain (`classspace-dev-auth`), Cognito `LITE` tier, optional TOTP MFA (`SOFTWARE_TOKEN_MFA`), SMS MFA disabled (zero SMS billing risk), and email verification/recovery enabled.

---

## 2. Dual-Layer Authorization (API Gateway Scopes + Lambda `cognito:groups`)

1. **API Gateway JWT Authorizer (`HttpJwtAuthorizer`):**
   - Validates Cognito RS256 JWT issuer (`cognito-idp.ap-south-1.amazonaws.com/<poolId>`) and SPA `client_id` audience (`jwtAudience`) before any Lambda executes.
   - Enforces route-level OAuth scopes across all 15 endpoints:
     - `classspace/read`: `GET /rooms`, `GET /rooms/available`, `GET /rooms/{roomId}`, `GET /bookings/me`, `GET /bookings/{id}`
     - `classspace/bookings/write`: `POST /bookings`, `PATCH /bookings/{id}/cancel`
     - `classspace/admin`: All `/admin/*` endpoints
2. **Lambda Enforcement (`infra/lambda/shared/authorization.ts`):**
   - `getAuthenticatedStudentId(event)` extracts verified `sub` exclusively from JWT authorizer claims — **never** from `body.studentId`, query strings, or headers.
   - `requireAdmin(event)` verifies **exact `'admin'` membership in `cognito:groups`**. Even if a caller somehow held the `classspace/admin` scope without `cognito:groups` membership, Lambda rejects with `403 FORBIDDEN`.
   - Ownership check (`BookingService.getBookingById`, `cancelBooking`): Non-admin students receive `403 FORBIDDEN` when accessing or cancelling another student's booking.

---

## 3. Input Validation, Concurrency & Data Protection

- **Strict Zod Schemas (`infra/lambda/schemas/`):** Every request body, query string, and path parameter uses `.strict()` Zod validation (15-minute slot alignment, max 4h booking, max 8h schedule/restriction, valid `YYYY-MM-DD` and `HH:mm`).
- **Transaction Integrity & Idempotency:** Deterministic `Idempotency-Key` -> SHA-256 `bookingId` prevents duplicate requests on retry while rejecting mutated replays (`409 CONFLICT`). `TransactWriteItems` prevents double booking via conditional `attribute_not_exists(lockKey)` and room active `ConditionCheck`.
- **Safe Error Handling (`infra/lambda/shared/error-handler.ts`):** Maps `AuthorizationError`, `ApiError`, and `ZodError` cleanly to sanitized envelopes without exposing stack traces, table names, or internal AWS details.
- **Redacting Structured Logger (`infra/lambda/shared/logger.ts`):** Redacts `authorization`, `password`, `secret`, `token`, `idempotency-key`, and PII patterns before CloudWatch ingestion.

---

## 4. Least-Privilege IAM & Secret Hygiene

- **Four Per-Handler IAM Roles (`infra/lib/constructs/backend-api.construct.ts`):**
  - Zero `*` actions, zero `*` resources, zero managed `AdministratorAccess` / `AmazonDynamoDBFullAccess` / `IAMFullAccess`.
  - **Zero `dynamodb:Scan`** across all roles and code paths.
  - `dynamodb:ConditionCheckItem` scoped **exclusively** to `ClassSpaceRooms` on the bookings handler role.
  - GSIs (`GSI_BlockFloor`, `GSI_StudentBookings`, `GSI_RoomDateBookings`) granted `dynamodb:Query` **only**.
- **No Secrets in Code or Env Files:** Verified by `infra/test/security-guardrails.test.ts` and repository secret scanning.
