# ClassSpace — Phase 2.2 / 2.2.1 Security Review

**Scope:** Synthesized CloudFormation template, IAM policies, Cognito configuration, and Lambda authorization contract for `ClassSpaceDevelopmentStack` (`ap-south-1`).

---

## 1. Identity & Authentication Controls (`AuthenticationConstruct`)

- **Cognito User Pool (`classspace-dev-users`):**
  - **Tier & MFA Verification (Fix D):** `UserPoolTier: LITE`, `MfaConfiguration: OPTIONAL`, `EnabledMfas: ["SOFTWARE_TOKEN_MFA"]`. CloudFormation schema and AWS Cognito LITE tier documentation confirm `SOFTWARE_TOKEN_MFA` (TOTP) is supported on the LITE tier without upgrading to ESSENTIALS or PLUS. `SMS_MFA` is disabled (`SmsConfiguration` absent), `AccountRecoverySetting` is `verified_email` only, and `UserPoolAddOns` (Advanced Security / Threat Protection) is absent.
  - **Groups:** `student` and `admin` created explicitly via `AWS::Cognito::UserPoolGroup`. No public admin registration and no self-promotion path; adding a user to `admin` requires privileged AWS IAM (`cognito-idp:AdminAddUserToGroup`) outside the app.
- **AWS-Managed Cognito Domain (`AWS::Cognito::UserPoolDomain`, Fix A):**
  - Configured with deterministic development prefix `classspace-dev-auth` in `ap-south-1`.
  - No custom domain, no ACM certificate (`AWS::CertificateManager::Certificate` count = 0), and no Route 53 resources.
  - **Limitation:** Defining a prefix in CDK does **not** prove global prefix availability in `ap-south-1`; deployment-time uniqueness verification is required on first deploy.
- **Public SPA Client (`classspace-dev-web-spa`):**
  - `GenerateSecret: false` (safe for browser SPA; zero secrets in `VITE_*` variables).
  - Authorization Code OAuth flow (`AllowedOAuthFlows: ["code"]`) with PKCE S256 (implicit flow disabled).
  - **Cognito Resource Servers (`classspace` & `classspace/bookings`):** Because AWS Cognito CloudFormation `ScopeName` forbids `/` inside the scope name itself (`^[\x21\x23-\x2E\x30-\x5B\x5D-\x7E]+$`) while allowing `/` in `Identifier`, resource server `classspace` defines `read` and `admin` and resource server `classspace/bookings` defines `write`. This yields valid CloudFormation with the exact OAuth scopes `classspace/read`, `classspace/bookings/write`, and `classspace/admin`.
  - Allowed OAuth scopes on SPA client: `openid`, `email`, `profile`, `classspace/read`, `classspace/bookings/write`, `classspace/admin`.
  - Development callback (`http://localhost:5173/auth/callback`) and documented Amplify placeholder (`https://PLACEHOLDER-AMPLIFY-DOMAIN.amplifyapp.com/auth/callback`).
  - **Frontend Integration Contract (Not Yet Implemented):** Future Phase 2.3 frontend authentication MUST request these custom OAuth scopes during Authorization Code + PKCE login and send the Cognito **Access Token** (which carries both `scope` and `cognito:groups`) to API Gateway. Phase 1 currently remains in local Demo Mode without live Cognito token exchange.

---

## 2. API & Backend Authorization Contract (`infra/lambda/shared/authorization.ts`, Fix C)

- **API Gateway HTTP API (`classspace-dev-http-api`):**
  - Native `HttpJwtAuthorizer` bound to all 10 routes validates JWT signature, Cognito issuer, and SPA client audience (`401 Unauthorized` on missing/invalid JWT).
  - **Per-Route OAuth Scope Enforcement (Phase 2.2.2):**
    - `classspace/read`: `GET /rooms`, `GET /rooms/available`, `GET /rooms/{roomId}`, `GET /bookings/me`
    - `classspace/bookings/write`: `POST /bookings`
    - `classspace/admin`: `PATCH /admin/bookings/{id}`, `POST /admin/rooms`, `PATCH /admin/rooms/{id}`, `PUT /admin/timetable`, `POST /admin/restrictions`
  - **Why Lambda-Side `requireAdmin` Remains Mandatory:** Because `classspace/admin` is listed in the public SPA client's allowed scopes, an ordinary student could attempt to request `classspace/admin` unless restricted by a Pre-Token-Generation trigger. Therefore, every `/admin/*` Lambda handler **must** still call `requireAdmin(event)` to enforce exact `cognito:groups` `admin` membership alongside `getAuthenticatedStudentId(event)`.
- **Reusable Lambda Authorization Module:**
  - `getAuthenticatedStudentId(event)`: Extracts `sub` strictly from `event.requestContext.authorizer.jwt.claims`; rejects missing authorizer, missing claims, or empty/whitespace/malformed `sub` with `401`; completely ignores `body`, `queryStringParameters`, and `headers` (cannot spoof `studentId`).
  - `isAdmin(event)` & `requireAdmin(event)`: Requires valid authentication (`401` if missing) and exact case-sensitive `'admin'` membership in `cognito:groups` array (`403` if absent or malformed); ignores caller-supplied role payloads; never logs JWTs, authorization headers, or raw claim contents.

---

## 3. IAM Least-Privilege Audit (Fix B)

- **Execution Role (`classspace-dev-api-lambda-role`):**
  - **Removed `dynamodb:Scan` completely** across all statements.
  - **Zero** AWS managed admin/full-access policies (`AdministratorAccess`, `AmazonDynamoDBFullAccess`, `IAMFullAccess` absent), zero Cognito/IAM admin permissions, and zero `Resource: "*"` wildcards.
  - **CloudWatch Logs (`WriteToDedicatedLambdaLogGroup`):** `logs:CreateLogStream`, `logs:PutLogEvents` scoped to `/aws/lambda/classspace-dev-api`.
  - **Per-Table & Per-GSI Scoped DynamoDB Permissions:**
    - `ClassSpaceRooms`: `GetItem`, `PutItem`, `UpdateItem`, `ConditionCheckItem` (`ConditionCheckItem` retained **only** here for transactional `active = true` checks during booking approval; `DeleteItem` omitted because rooms are deactivated).
    - `ClassSpaceSchedules`: `GetItem`, `Query`, `PutItem`, `UpdateItem`, `DeleteItem`.
    - `ClassSpaceBookings`: `GetItem`, `PutItem`, `UpdateItem` (`DeleteItem` omitted because bookings transition to `CANCELLED`/`REJECTED`).
    - `ClassSpaceSlotLocks`: `GetItem`, `BatchGetItem`, `PutItem`, `DeleteItem` (atomic 15-min slot claim/release and known-key batch reads).
    - `ScopedGsiQueryOnlyAccess`: `dynamodb:Query` **only** on `GSI_BlockFloor`, `GSI_StudentBookings`, and `GSI_RoomDateBookings`.

---

## 4. Logging & Data Protection

- **CloudWatch LogGroup (`/aws/lambda/classspace-dev-api`):** 7-day retention, no custom KMS key, structured JSON logging (`lambda/health/index.ts`) with no JWTs, passwords, authorization headers, or PII.
- **No Secrets in Configuration:** `.env.example` and Lambda `Environment.Variables` contain non-secret configuration only.
