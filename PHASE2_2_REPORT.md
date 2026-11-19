# ClassSpace — Phase 2.2 Completion Report: AWS Infrastructure Foundation

**Date:** 2026-11-19 (Asia/Kolkata)  
**Target Region:** `ap-south-1` (Mumbai)  
**Environment:** `Development` (`Project=ClassSpace`, `Environment=Development`, `Owner=StudentProject`)  
**Execution Scope:** **LOCAL IMPLEMENTATION ONLY** — No AWS resources were provisioned, deployed, or modified.

---

## 1. Confirmations (Compliance & Safety)

- **No AWS resources were provisioned:** Confirmed. Neither `cdk bootstrap`, `cdk deploy`, `sam deploy`, nor any AWS CLI resource-creating command was executed.
- **No AWS account upgrade occurred:** Confirmed. Account remains on the user-reported AWS Free plan.
- **No credentials were accessed:** Confirmed. No credential files, access keys, secret keys, payment details, or browser authentication tokens were inspected, printed, or requested.
- **Phase 1 preserved:** Confirmed. Phase 1 React application, `IClassSpaceService`, `MockClassSpaceService`, and `LocalMockRepository` remain completely functional without AWS credentials.

---

## 2. Files Created & Modified

### Files Created (`D:\ClassSpace\infra` & Root)
- `D:\ClassSpace\infra\package.json` (pinned CDK v2.277.0, constructs 10.8.1, esbuild 0.28.2, Jest 29.7.0, ts-jest 29.4.15, TypeScript 5.7.3)
- `D:\ClassSpace\infra\package-lock.json`
- `D:\ClassSpace\infra\tsconfig.json`
- `D:\ClassSpace\infra\jest.config.js`
- `D:\ClassSpace\infra\cdk.json`
- `D:\ClassSpace\infra\config\development.ts`
- `D:\ClassSpace\infra\bin\classspace.ts`
- `D:\ClassSpace\infra\lib\classspace-stack.ts`
- `D:\ClassSpace\infra\lib\constructs\database.construct.ts`
- `D:\ClassSpace\infra\lib\constructs\authentication.construct.ts`
- `D:\ClassSpace\infra\lib\constructs\monitoring.construct.ts`
- `D:\ClassSpace\infra\lib\constructs\backend-api.construct.ts`
- `D:\ClassSpace\infra\lib\concurrency\slot-locks.ts`
- `D:\ClassSpace\infra\lambda\health\index.ts`
- `D:\ClassSpace\infra\lambda\shared\authorization.ts`
- `D:\ClassSpace\infra\test\test-helper.ts`
- `D:\ClassSpace\infra\test\infrastructure.test.ts`
- `D:\ClassSpace\infra\test\security-guardrails.test.ts`
- `D:\ClassSpace\infra\test\cost-guardrails.test.ts`
- `D:\ClassSpace\infra\test\concurrency-rules.test.ts`
- `D:\ClassSpace\infra\test\authorization.test.ts`
- `D:\ClassSpace\infra\README.md`
- `D:\ClassSpace\infra\SECURITY_REVIEW.md`
- `D:\ClassSpace\infra\COST_REVIEW.md`
- `D:\ClassSpace\infra\DEPLOYMENT_BLOCKERS.md`
- `D:\ClassSpace\infra\PHASE2_2_1_HARDENING_REPORT.md`
- `D:\ClassSpace\infra\cdk.out\ClassSpaceDevelopmentStack.template.json` (plus CDK manifest/assets)
- `D:\ClassSpace\PHASE2_2_REPORT.md`

### Files Modified
- `D:\ClassSpace\docs\DYNAMODB_ARCHITECTURE.md`: Updated Table 2 (`ClassSpaceSchedules`) sort key to the time-first `scheduleKey` format (`<startTime>#TT#<scheduleId>` and `<startTime>#RES#<restrictionId>`) and documented that TTL on `ClassSpaceSlotLocks` is disabled unless formal expiry safety is proved.

---

## 3. Architecture Implemented

`ClassSpaceDevelopmentStack` (`ap-south-1`, AWS account intentionally unresolved for local credential-free synthesis) composes four modular constructs:
1. `DatabaseConstruct`: 4 DynamoDB tables (`Standard` class, `PAY_PER_REQUEST`, PITR disabled, Streams disabled, default AWS-owned encryption).
2. `AuthenticationConstruct`: Cognito User Pool `classspace-dev-users` (`LITE` tier, email sign-up, `student` and `admin` groups, SMS MFA disabled) + public SPA client `classspace-dev-web-spa` (`GenerateSecret: false`, OAuth2 Authorization Code flow + PKCE S256).
3. `MonitoringConstruct`: Dedicated CloudWatch LogGroup `/aws/lambda/classspace-dev-api` with 7-day retention and no custom KMS key.
4. `BackendApiConstruct`: API Gateway HTTP API (`classspace-dev-http-api`), Cognito `HttpJwtAuthorizer`, stage throttling (`10 req/s`, `20` burst), 10 planned route definitions, least-privilege IAM role, and placeholder ARM64 Node.js 22.x Lambda (`classspace-dev-api`).

---

## 4. DynamoDB Table & GSI Definitions

| Table Name | Partition Key | Sort Key | GSIs | Capacity & Safeguards |
| :--- | :--- | :--- | :--- | :--- |
| `ClassSpaceRooms` | `roomId` (`S`) | — | `GSI_BlockFloor` (`blockId` / `floorRoomKey`) | Standard, `PAY_PER_REQUEST`, PITR off, Streams off |
| `ClassSpaceSchedules` | `roomDateKey` (`S`) | `scheduleKey` (`S`: `<startTime>#TT#<id>` / `<startTime>#RES#<id>`) | — | Standard, `PAY_PER_REQUEST`, PITR off, Streams off |
| `ClassSpaceBookings` | `bookingId` (`S`) | — | `GSI_StudentBookings` (`studentId` / `createdAt`), `GSI_RoomDateBookings` (`roomDateKey` / `statusStartKey`) | Standard, `PAY_PER_REQUEST`, PITR off, Streams off |
| `ClassSpaceSlotLocks` | `lockKey` (`S`: `roomId#date#slotStartHHmm`) | — | — | Standard, `PAY_PER_REQUEST`, PITR off, Streams off, **TTL disabled** |

---

## 5. Cognito Configuration

- **User Pool:** `classspace-dev-users` (`FeaturePlan.LITE`, email self-registration, email recovery only, `Mfa.OPTIONAL` with `sms: false, otp: true`).
- **AWS-Managed Prefix Domain:** `classspace-dev-auth` (`AWS::Cognito::UserPoolDomain`, no custom domain, ACM cert, or Route 53; deployment-time uniqueness must be verified in `ap-south-1`).
- **Groups:** `student` (precedence 10) and `admin` (precedence 1). No public admin signup or self-promotion.
- **Public SPA Client:** `classspace-dev-web-spa` (`GenerateSecret: false`, Authorization Code OAuth flow, scopes `openid`, `email`, `profile`, `http://localhost:5173/auth/callback` + documented Amplify placeholder).
- **Mandatory Backend Rule:** API handlers must use `infra/lambda/shared/authorization.ts` (`getAuthenticatedStudentId`, `requireAdmin`) to derive `studentId` from verified JWT `sub` and verify `cognito:groups` contains `admin` for `/admin/*` endpoints.

---

## 6. API, Lambda & IAM Audit

- **API Gateway HTTP API (`classspace-dev-http-api`):** `ProtocolType: HTTP`, default `HttpJwtAuthorizer`, stage `$default` throttling `ThrottlingRateLimit: 10`, `ThrottlingBurstLimit: 20`.
- **10 Bound Routes:** `GET /rooms`, `GET /rooms/available`, `GET /rooms/{roomId}`, `POST /bookings`, `GET /bookings/me`, `PATCH /admin/bookings/{id}`, `POST /admin/rooms`, `PATCH /admin/rooms/{id}`, `PUT /admin/timetable`, `POST /admin/restrictions`.
- **Lambda (`classspace-dev-api`):** `nodejs22.x`, `arm64`, `256 MB`, `10s` timeout, no VPC, no provisioned concurrency, minimal health stub emitting structured JSON without JWTs, passwords, headers, or PII.
- **IAM Role (`classspace-dev-api-lambda-role`):** Hardened in Phase 2.2.1 to remove `dynamodb:Scan`, scope `ConditionCheckItem` strictly to `ClassSpaceRooms`, grant `Query`-only access on the 3 GSIs, and scope table actions per table alongside `/aws/lambda/classspace-dev-api` CloudWatch logging. Zero `*` resource wildcards or managed admin/full-access policies.

---

## 7. Automated Test & Synthesis Results

### CDK Infrastructure, Security, Cost, Concurrency & Auth Tests (`D:\ClassSpace\infra`)
- `npm run build` (`tsc`): **Passed** (0 errors)
- `npm test` (`jest`): **5 test suites passed, 37 tests passed**:
  - `test/concurrency-rules.test.ts`: Passed (half-open intervals, adjacent slots, 15-min alignment, time-first `scheduleKey` sorting, 4h/8h caps, diff logic, 18-action booking & 34-action timetable transaction limits <= 100)
  - `test/authorization.test.ts`: Passed (12 unit tests covering JWT `sub`, `cognito:groups`, spoofing resistance, and case-sensitive matching)
  - `test/cost-guardrails.test.ts`: Passed (`PAY_PER_REQUEST`, Standard class, PITR/Streams/Global Tables off, no provisioned concurrency, 7-day log retention, no custom KMS/NAT/EC2/VPC/RDS/S3/Budgets, tags verified)
  - `test/security-guardrails.test.ts`: Passed (no client secret, `student`/`admin` groups, LITE + optional TOTP + SMS MFA disabled, JWT authorizer on all 10 routes, least-privilege IAM with zero `Scan`, no secrets in `.env.example` or Lambda env)
  - `test/infrastructure.test.ts`: Passed (4 tables, PK/SK schemas, 3 GSIs, Cognito prefix domain with zero ACM/Route 53, Lambda runtime/arch/memory/timeout/no-VPC, HTTP API + 10 routes + throttling, docs accuracy, TTL disabled)
- `npx cdk synth --no-lookups`: **Passed** — generated `D:\ClassSpace\infra\cdk.out\ClassSpaceDevelopmentStack.template.json` without AWS credentials.

### Existing Phase 1 Application Checks (`D:\ClassSpace`)
- `npm run typecheck` (`tsc --noEmit`): **Passed** (0 errors)
- `npm run lint` (`eslint .`): **Passed** (0 errors, 0 warnings)
- `npm test` (`vitest run`): **Passed** — 3 test files, **20/20 tests passed**
- `npm run build` (`tsc -b && vite build`): **Passed** (`dist/index.html`, CSS `28.54 kB`, JS `487.23 kB`)

---

## 8. Known Limitations & Outstanding Free Plan Questions

1. **AWS Free Plan & Credit Eligibility:** The user reports an AWS Free plan, $100 credits, and ₹0 personal budget. Exact eligibility of `PAY_PER_REQUEST` DynamoDB reads/writes, API Gateway HTTP API calls, Cognito MAUs, and Amplify Hosting under the account's current Free plan and credit rules has **not** been verified in the AWS Billing Console. `PAY_PER_REQUEST` is **not** inherently free ($0 cannot be guaranteed on a Paid account or outside eligible credits).
2. **Placeholder Backend:** `infra/lambda/health/index.ts` is a health stub only; full route handlers, `TransactWriteItems` slot-lock persistence, and frontend Cognito PKCE integration belong to Phase 2.3+.
3. **Amplify Hosting:** Not provisioned; Cognito callback/logout URLs include a documented placeholder domain alongside `http://localhost:5173/auth/callback`.

**Phase 2.2 is complete. Stopping here — awaiting explicit user approval before any Phase 2.3 implementation or deployment planning.**
