# ClassSpace — Phase 2.2.1 Security Hardening Report

**Date:** 2026-11-19 (Asia/Kolkata)  
**Target Region:** `ap-south-1` (Mumbai)  
**Environment:** `Development` (`Project=ClassSpace`, `Environment=Development`, `Owner=StudentProject`)  
**Execution Scope:** **LOCAL IMPLEMENTATION ONLY**

---

## 1. Confirmations & Pre-Change Repository Check

- **Git Status Check:** Executed `git status` and `git branch -a` in `D:\ClassSpace`; workspace is not initialized as a Git repository (`fatal: not a git repository`), so no Git branch could be created. Existing Phase 1 and Phase 2.2 files were preserved without overwriting unrelated files.
- **No AWS resources were created, deployed, or modified:** Confirmed (`cdk deploy`, `cdk bootstrap`, `sam deploy`, `amplify publish`, and all AWS CLI resource-creating commands were never executed).
- **No credentials were accessed or requested:** Confirmed.
- **AWS account was not upgraded:** Confirmed. Account remains on the user-reported AWS Free plan ($100 reported promotional credits, ₹0 personal budget).

---

## 2. Files Created & Modified

### Files Created
- `D:\ClassSpace\infra\lambda\shared\authorization.ts` — Reusable Phase 2.3 Lambda JWT authorization contract (`getAuthenticatedStudentId`, `isAdmin`, `requireAdmin`, `AuthorizationError`).
- `D:\ClassSpace\infra\test\authorization.test.ts` — 12 unit tests covering JWT `sub` extraction, missing/malformed auth, `cognito:groups` checks, payload/header spoofing resistance, and case-sensitive matching.
- `D:\ClassSpace\infra\PHASE2_2_1_HARDENING_REPORT.md` — This security hardening report.

### Files Modified
- `D:\ClassSpace\infra\config\development.ts` — Added `cognitoDomainPrefix: 'classspace-dev-auth'`.
- `D:\ClassSpace\infra\lib\constructs\authentication.construct.ts` — Added `AWS::Cognito::UserPoolDomain` (`userPoolDomain`), exported `cognitoDomainPrefix` and `cognitoDomainBaseUrl`.
- `D:\ClassSpace\infra\lib\classspace-stack.ts` — Exported `CognitoDomainPrefix` and `CognitoDomainBaseUrl` `CfnOutput`s.
- `D:\ClassSpace\infra\lib\constructs\backend-api.construct.ts` — Removed `dynamodb:Scan`; replaced single broad statement with scoped per-table and per-GSI statements (retaining `dynamodb:ConditionCheckItem` only on `ClassSpaceRooms`).
- `D:\ClassSpace\infra\test\infrastructure.test.ts` — Added Fix A assertions (`AWS::Cognito::UserPoolDomain` prefix, zero ACM certificates, zero Route 53 resources).
- `D:\ClassSpace\infra\test\security-guardrails.test.ts` — Added Fix B (`dynamodb:Scan` absence, scoped `ConditionCheckItem`, GSI `Query`-only, zero Cognito/IAM admin perms) and Fix D (`UserPoolTier: LITE`, `SOFTWARE_TOKEN_MFA`, no `SMS_MFA`, no `SmsConfiguration`, no `UserPoolAddOns`) assertions.
- `D:\ClassSpace\infra\SECURITY_REVIEW.md`
- `D:\ClassSpace\infra\COST_REVIEW.md`
- `D:\ClassSpace\infra\DEPLOYMENT_BLOCKERS.md`
- `D:\ClassSpace\infra\README.md`
- `D:\ClassSpace\PHASE2_2_REPORT.md`
- `D:\ClassSpace\infra\cdk.out\ClassSpaceDevelopmentStack.template.json` (re-synthesized)

---

## 3. Hardening Changes Implemented

### Fix A — Cognito Domain Configuration
- Added `AWS::Cognito::UserPoolDomain` (`Domain: "classspace-dev-auth"`) bound to `classspace-dev-users` in `ap-south-1`.
- Kept local callback `http://localhost:5173/auth/callback` and placeholder Amplify callback `https://PLACEHOLDER-AMPLIFY-DOMAIN.amplifyapp.com/auth/callback`.
- Retained `GenerateSecret: false`, `AllowedOAuthFlows: ["code"]` (PKCE S256 compatible, implicit flow disabled), and scopes `openid`, `email`, `profile`.
- Zero custom domains, zero ACM certificates, and zero Route 53 resources.
- **Prefix Uniqueness Limitation:** Defining `classspace-dev-auth` in CDK does **not** verify global availability across Cognito's `ap-south-1` domain namespace; deployment-time uniqueness must be confirmed on first deploy (and adjusted if already claimed).

### Fix B — Least-Privilege IAM & Removal of `dynamodb:Scan`
- Removed `dynamodb:Scan` completely (`GET /rooms` uses `GSI_BlockFloor` queries by `blockId` instead of scanning).
- Split permissions by exact resource role:
  - `ClassSpaceRooms`: `GetItem`, `PutItem`, `UpdateItem`, `ConditionCheckItem` (`ConditionCheckItem` retained solely for `TransactWriteItems` `active = true` checks).
  - `ClassSpaceSchedules`: `GetItem`, `Query`, `PutItem`, `UpdateItem`, `DeleteItem`.
  - `ClassSpaceBookings`: `GetItem`, `PutItem`, `UpdateItem`.
  - `ClassSpaceSlotLocks`: `GetItem`, `BatchGetItem`, `PutItem`, `DeleteItem`.
  - `ScopedGsiQueryOnlyAccess`: `Query` only on `GSI_BlockFloor`, `GSI_StudentBookings`, `GSI_RoomDateBookings`.
  - Dedicated LogGroup: `logs:CreateLogStream`, `logs:PutLogEvents` on `/aws/lambda/classspace-dev-api` only.

### Fix C — Backend Authorization Contract (`infra/lambda/shared/authorization.ts`)
- Implemented `getAuthenticatedStudentId(event)`, `isAdmin(event)`, `requireAdmin(event)`, and `AuthorizationError`.
- Reads `sub` and `cognito:groups` strictly from `event.requestContext.authorizer.jwt.claims`.
- Rejects missing authorizer/claims/sub or malformed `sub` with `401 Unauthorized`; rejects non-admin, case-mismatched (`'Admin'`, `'ADMIN'`), or malformed `cognito:groups` claims with `403 Forbidden`.
- Ignores `body`, `queryStringParameters`, and `headers`; never logs JWTs or authorization headers.

### Fix D — Cognito MFA & Tier Compatibility Review
- Audited synthesized `AWS::Cognito::UserPool`:
  - `UserPoolTier: "LITE"`, `MfaConfiguration: "OPTIONAL"`, `EnabledMfas: ["SOFTWARE_TOKEN_MFA"]`.
  - `SmsConfiguration` and `UserPoolAddOns` are **absent**; `AccountRecoverySetting` is `verified_email` only.
  - Verified against AWS Cognito documentation: `LITE` tier natively supports `SOFTWARE_TOKEN_MFA` (TOTP) and classic Hosted UI / OAuth2 PKCE without requiring `ESSENTIALS` or `PLUS` tiers. (Note: `VerificationMessageTemplate` includes CloudFormation's default `SmsMessage` string property even when `SMS_MFA` and `SmsConfiguration` are absent; no SMS capability is configured or enabled.)

---

## 4. Automated Test & Synthesis Audit Results

### `D:\ClassSpace\infra`
- `npm run build` (`tsc`): **Passed** (0 errors)
- `npm test` (`jest`): **5 test suites passed, 37 tests passed**
  - `test/concurrency-rules.test.ts`: Passed
  - `test/authorization.test.ts`: Passed (all 12 contract tests)
  - `test/infrastructure.test.ts`: Passed
  - `test/security-guardrails.test.ts`: Passed
  - `test/cost-guardrails.test.ts`: Passed
- `npx cdk synth --no-lookups`: **Passed** — regenerated `D:\ClassSpace\infra\cdk.out\ClassSpaceDevelopmentStack.template.json` without AWS credentials.
- **Synthesized CloudFormation Audit:** Confirmed `AWS::Cognito::UserPoolDomain` present (`classspace-dev-auth`), 0 ACM/Route 53/NAT/EC2/RDS/KMS/S3/Budget resources, 0 `dynamodb:Scan`, `ConditionCheckItem` scoped to `ClassSpaceRooms` only, JWT authorizer on all 10 routes, 7-day log retention, `PAY_PER_REQUEST`, PITR/Streams/TTL disabled.

### `D:\ClassSpace` (Phase 1 Regression Suite)
- `npm run typecheck` (`tsc --noEmit`): **Passed** (0 errors)
- `npm run lint` (`eslint .`): **Passed** (0 errors, 0 warnings)
- `npm test` (`vitest run`): **Passed** — 3 test files, **20/20 tests passed**
- `npm run build` (`tsc -b && vite build`): **Passed** (`dist/index.html`, CSS `28.54 kB`, JS `487.23 kB`)

---

## 5. Remaining Blockers & Free Plan Unresolved Questions

1. **AWS Free Plan & $100 Credit Coverage:** DynamoDB `PAY_PER_REQUEST` WRUs/RRUs and API Gateway HTTP API requests are not covered by DynamoDB's 25 RCU/WCU Provisioned Always Free Tier; verify exact Free plan eligibility and credit applicability in the AWS Billing Console before any future deployment.
2. **Cognito Domain Prefix Uniqueness:** `classspace-dev-auth` must be verified as unclaimed in `ap-south-1` at deployment time.
3. **Unauthenticated CLI & Missing $5/mo Budget Alert:** Authenticate non-root IAM/SSO access and set up billing alerts before any future `cdk bootstrap` / `cdk deploy`.

**Stopping here after Phase 2.2.1 — awaiting explicit user approval before Phase 2.3.**
