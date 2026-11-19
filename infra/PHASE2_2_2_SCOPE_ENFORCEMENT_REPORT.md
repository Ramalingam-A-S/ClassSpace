# ClassSpace — Phase 2.2.2 OAuth Scope Enforcement Report

**Date:** 2026-11-19 (Asia/Kolkata)  
**Target Region:** `ap-south-1` (Mumbai)  
**Environment:** `Development`  
**Execution Scope:** **LOCAL IMPLEMENTATION ONLY** — No AWS resources were created, deployed, or modified.

---

## 1. Confirmations

- **No AWS resources created or modified:** Confirmed (`cdk deploy`, `cdk bootstrap`, and all AWS CLI resource-creating commands were not executed).
- **No paid Cognito features introduced:** Confirmed (`UserPoolTier: LITE`, SMS MFA disabled, `UserPoolAddOns` absent, `GenerateSecret: false`).
- **Existing Phase 1 Demo Mode preserved:** Confirmed. Future frontend OAuth scope usage is documented only; Phase 1 does not currently implement Cognito login or send these scopes.

---

## 2. Cognito Resource Server & Custom Scope Design

- **CloudFormation Schema Constraint Discovered & Resolved:**
  - Cognito's `AWS::Cognito::UserPoolResourceServer` `ScopeName` pattern (`^[\x21\x23-\x2E\x30-\x5B\x5D-\x7E]+$`) excludes `/` (`\x2F`), while `Identifier` (`^[\x21\x23-\x5B\x5D-\x7E]+$`) permits `/`.
  - Defining `bookings/write` as a single `ScopeName` triggered CDK CloudFormation validation warning `CloudFormation-Validate::F3031`.
  - **Clean Resolution:** Configured two `UserPoolResourceServer` resources on `classspace-dev-users`:
    1. `classspace` -> scopes `read`, `admin` (resolves to `classspace/read`, `classspace/admin`)
    2. `classspace/bookings` -> scope `write` (resolves to `classspace/bookings/write`)
  - Synthesized CloudFormation validation (`cdk.out/validation-report.json`) reports **zero** warnings (`"pluginReports": []`).
- **Public SPA Client (`classspace-dev-web-spa`):**
  - `AllowedOAuthScopes` includes `openid`, `email`, `profile`, `classspace/read`, `classspace/bookings/write`, and `classspace/admin`.
  - Retains `GenerateSecret: false`, `AllowedOAuthFlows: ["code"]` (PKCE S256 compatible, implicit flow disabled), `classspace-dev-auth` Cognito prefix domain, and `student` / `admin` groups.

---

## 3. API Gateway Route Scope Enforcement (`BackendApiConstruct`)

All 10 HTTP API routes retain `AuthorizationType: JWT` with `CognitoJwtAuthorizer` (issuer + SPA client audience) and enforce exact `AuthorizationScopes`:

| Route | Required OAuth Scope | Additional Lambda Enforcement |
| :--- | :--- | :--- |
| `GET /rooms` | `classspace/read` | `getAuthenticatedStudentId(event)` |
| `GET /rooms/available` | `classspace/read` | `getAuthenticatedStudentId(event)` |
| `GET /rooms/{roomId}` | `classspace/read` | `getAuthenticatedStudentId(event)` |
| `GET /bookings/me` | `classspace/read` | `getAuthenticatedStudentId(event)` (`jwt.sub` isolation) |
| `POST /bookings` | `classspace/bookings/write` | `getAuthenticatedStudentId(event)` |
| `PATCH /admin/bookings/{id}` | `classspace/admin` | `requireAdmin(event)` (`cognito:groups` `admin`) |
| `POST /admin/rooms` | `classspace/admin` | `requireAdmin(event)` (`cognito:groups` `admin`) |
| `PATCH /admin/rooms/{id}` | `classspace/admin` | `requireAdmin(event)` (`cognito:groups` `admin`) |
| `PUT /admin/timetable` | `classspace/admin` | `requireAdmin(event)` (`cognito:groups` `admin`) |
| `POST /admin/restrictions` | `classspace/admin` | `requireAdmin(event)` (`cognito:groups` `admin`) |

> **Defense-in-Depth Note:** Because `classspace/admin` is allowed on the public SPA client, Lambda-side `requireAdmin(event)` (`infra/lambda/shared/authorization.ts`) remains mandatory so ordinary students cannot perform admin operations even if they request the scope.

---

## 4. Files Created & Modified

- **Created:** `D:\ClassSpace\infra\PHASE2_2_2_SCOPE_ENFORCEMENT_REPORT.md`
- **Modified:**
  - `D:\ClassSpace\infra\lib\constructs\authentication.construct.ts`
  - `D:\ClassSpace\infra\lib\constructs\backend-api.construct.ts`
  - `D:\ClassSpace\infra\test\security-guardrails.test.ts`
  - `D:\ClassSpace\infra\SECURITY_REVIEW.md`
  - `D:\ClassSpace\infra\DEPLOYMENT_BLOCKERS.md`
  - `D:\ClassSpace\infra\README.md`
  - `D:\ClassSpace\infra\cdk.out\ClassSpaceDevelopmentStack.template.json`

---

## 5. Verification Command Results

### `D:\ClassSpace\infra`
- `npm run build` (`tsc`): **Passed** (0 errors)
- `npm test` (`jest`): **Passed** — `Test Suites: 5 passed, 5 total`, `Tests: 39 passed, 39 total`
- `npx cdk synth --no-lookups`: **Passed** (`validation-report.json`: `"pluginReports": []`, 0 warnings)

### `D:\ClassSpace` (Phase 1)
- `npm run typecheck` (`tsc --noEmit`): **Passed** (0 errors)
- `npm run lint` (`eslint .`): **Passed** (0 errors, 0 warnings)
- `npm test` (`vitest run`): **Passed** — `Test Files: 3 passed (3)`, `Tests: 20 passed (20)`
- `npm run build` (`tsc -b && vite build`): **Passed** (`dist/index.html`, CSS `28.54 kB`, JS `487.23 kB`)

**Phase 2.2.2 complete — stopping here and awaiting explicit user approval before Phase 2.3.**
