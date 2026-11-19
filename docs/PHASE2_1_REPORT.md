# ClassSpace — Phase 2.1 Audit & Architecture Readiness Report

**Date:** 2026-11-19 (Asia/Kolkata)  
**Scope:** Audit, AWS readiness assessment, cost guardrails, DynamoDB schema, concurrency design, Cognito security, API/Lambda blueprint, and IaC selection.  
**Execution Status:** **ZERO AWS resources were created or modified.** Phase 1 local Demo Mode remains intact and runnable without AWS credentials.

---

## 1. Evidence Provenance Matrix

| Category | Item | Details |
| :--- | :--- | :--- |
| **Verified by Workspace & Read-Only CLI Inspection** | Phase 1 codebase & tests | Inspected `package.json`, `.env.example`, `README.md`, `docs/*`, `src/types/domain.ts`, `src/services/*`. `IClassSpaceService` and local mock repository remain intact. |
| **Verified by Read-Only CLI Inspection** | Local AWS CLI / IaC tooling | `aws`, `cdk`, and `sam` are **not installed** in the local workspace `PATH` (`CommandNotFoundException`; standard Windows `Program Files` paths returned `False`). No credential files were read. |
| **Verified via Official AWS Docs** | `ap-south-1` service availability & DynamoDB limits | Amplify Hosting, Cognito User Pools, API Gateway HTTP API, Lambda, DynamoDB, and CloudWatch are available in `ap-south-1`. DynamoDB `TransactWriteItems` supports up to **100 actions** / 4 MB per transaction; DynamoDB Always Free Tier (25 RCU/25 WCU) applies to Provisioned mode rather than On-Demand WRU/RRU billing. |
| **Supplied by the User** | Phase 1 results & target stack | React 19 + TS + Vite + Tailwind + Vitest (`20/20` tests); target stack Amplify -> Cognito -> API Gateway HTTP API -> Lambda -> DynamoDB + CloudWatch in `ap-south-1`; internal budget `$5 USD/month` (50%, 80%, 100%). |
| **Not Yet Verified (Requires User Console Check)** | AWS Account & Billing state | Account ID (to be redacted), active IAM principal/SSO role, account creation date, 12-month Free Tier eligibility, promotional/student credit balance & expiration, billing IAM access, and existing account spend/budgets. |
| **Recommended Architecture** | Core Phase 2.2 design | 4 DynamoDB tables (`ClassSpaceRooms`, `ClassSpaceSchedules`, `ClassSpaceBookings`, `ClassSpaceSlotLocks`) with unified 15-minute slot-claim `TransactWriteItems`, Cognito PKCE + `student`/`admin` groups, API Gateway HTTP API JWT authorizer, `arm64` Node 22 Lambdas outside VPC, and AWS CDK (TypeScript). |
| **Decisions Requiring User Approval** | Phase 2.2 go-ahead items | See Section 3 below before any provisioning begins. |

---

## 2. Phase 1 Regression Verification

Phase 1 code was not altered in Phase 2.1. All existing verification scripts (`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`) were executed after creating Phase 2.1 documentation to confirm zero regressions.

---

## 3. Decisions Requiring Explicit User Approval Before Phase 2.2

1. **AWS Console Readiness & Budget Setup:** Confirm account Free Tier / credit expiration and manually create the **$5/month AWS Budget** (50%, 80%, 100% actual & forecasted alerts) before deploying anything.
2. **DynamoDB Capacity Mode (`On-Demand` vs `Provisioned` <= 25 RCU/WCU):**
   - *Tradeoff:* On-Demand avoids throttling/capacity management but bills per request from request #1; Provisioned (e.g., 2–5 RCU/WCU per table across 4 tables, staying <= 25 total) can utilize DynamoDB's Always Free Tier if account-eligible. Confirm which mode to start with in `development`.
3. **Cognito User Pool Tier (`Lite` vs `Essentials`):** Confirm `Lite` or `Essentials` tier (both provide 10,000 direct MAUs free tier; disable Plus tier and SMS MFA).
4. **Booking Concurrency Rules:** Approve **15-minute slot alignment** and **4-hour maximum student booking duration** (keeps `TransactWriteItems` <= 18 items vs AWS's 100-item limit).
5. **IaC Tooling Selection:** Approve **AWS CDK (TypeScript)** (vs AWS SAM) for Phase 2.2 implementation.
6. **Frontend Hosting:** Approve **AWS Amplify Hosting** (static SPA, noting 12-month Free Tier limit on build minutes & bandwidth).
