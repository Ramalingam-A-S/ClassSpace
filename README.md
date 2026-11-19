# ClassSpace — Smart Free Classroom Finder

ClassSpace helps college students discover **schedule-vacant** classrooms during their free periods and equips administrators to manage rooms, timetables, maintenance/exam restrictions, and booking approvals with atomic slot-lock concurrency control.

Built for the **AWS ShipIt Challenge 2026 (Techfest IIT Bombay)** targeting `ap-south-1` (Mumbai) with `Asia/Kolkata` campus time semantics and strict ₹0-waste Free-Tier / credit-safe serverless architecture.

> **Honest Scope Disclosures:**
> - **Schedule Status Only:** `SCHEDULE_VACANT` confirms there is no overlapping scheduled class, approved booking, or restriction. It **does not verify physical room occupancy** (no IoT sensors or CCTV feeds).
> - **Institutional Data:** Seed datasets represent fictional `DEMO` / `ADMIN_ENTERED` records; no university ERP timetable feed is connected.
> - **Deployment Status:** All frontend, backend Lambda handlers, CDK infrastructure, security guardrails, concurrency tests, and CloudFormation synthesis (`cdk synth --no-lookups`) are verified locally. Cloud deployment awaits user AWS account credentials and Free Plan / credit confirmation (see [DEPLOYMENT.md](DEPLOYMENT.md) and [infra/DEPLOYMENT_BLOCKERS.md](infra/DEPLOYMENT_BLOCKERS.md)).

---

## Architecture Highlights

- **Frontend (`src/`):** React 19, TypeScript (strict), Vite, Tailwind CSS v4, React Router, React Hook Form, Zod, Vitest.
  - **Phase 1 Demo Mode:** Preserved intact using `MockClassSpaceService` + `LocalMockRepository` (`localStorage`) + Client-side Demo Role Switcher.
  - **Phase 2 Live AWS Mode:** `AwsClassSpaceService` + Amazon Cognito Authorization Code + PKCE (`S256`) (`src/services/cognitoAuth.ts`) storing tokens strictly in JS memory, transmitting `Bearer` access tokens + `Idempotency-Key`.
- **Backend & IaC (`infra/`):** AWS CDK v2 (TypeScript), 4 modular Node.js 22.x `ARM64` Lambda functions (`rooms`, `availability`, `bookings`, `schedules`), API Gateway HTTP API v2 (`10 req/s`, `20` burst) with JWT Authorizer + 3 custom OAuth scopes (`classspace/read`, `classspace/bookings/write`, `classspace/admin`), Cognito User Pool (`LITE` tier, `student`/`admin` groups, zero SMS MFA), and 4 `PAY_PER_REQUEST` DynamoDB tables (`ClassSpaceRooms`, `ClassSpaceSchedules`, `ClassSpaceBookings`, `ClassSpaceSlotLocks`).

---

## Quick Start (Local Demo Mode — ₹0 Cost)

```powershell
# 1. Install frontend dependencies and start dev server
npm install
npm run dev
```

Open `http://localhost:5173`. Demo Mode runs immediately in your browser using simulated campus data (`Asia/Kolkata`).

---

## Verification Commands

```powershell
# Frontend typecheck, lint, unit/UI tests, and production bundle
npm run typecheck
npm run lint
npm test
npm run build

# Backend CDK + Lambda compilation, unit/concurrency/guardrail tests, and CloudFormation synthesis
cd infra
npm install
npm run build
npm test
npx cdk synth --no-lookups
```

---

## Project Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) — End-to-end architecture & Mermaid diagram
- [SECURITY.md](SECURITY.md) — Cognito PKCE, OAuth scopes, `requireAdmin`, and least-privilege IAM
- [DEPLOYMENT.md](DEPLOYMENT.md) — Pre-flight cost checks, `cdk bootstrap`, `cdk deploy`, Cognito seeding, and `cdk destroy`
- [COST_ESTIMATE.md](COST_ESTIMATE.md) — Free-Tier / credit optimization and cost guardrails
- [API_REFERENCE.md](API_REFERENCE.md) — All 15 scoped HTTP API v2 endpoints & contracts
- [DATA_MODEL.md](DATA_MODEL.md) — DynamoDB 4-table + GSI + 15-min `SlotLocks` transaction design
- [DEMO_SCRIPT.md](DEMO_SCRIPT.md) — 60–90s hackathon demo video script & screenshot checklist
- [FINAL_QA_REPORT.md](FINAL_QA_REPORT.md) — Verified test, build, lint, synth, and secret scan results
- [FINAL_SUBMISSION_CHECKLIST.md](FINAL_SUBMISSION_CHECKLIST.md) — AWS ShipIt Challenge 2026 & CA Portal submission pack
- [FINAL_PROJECT_COMPLETION_REPORT.md](FINAL_PROJECT_COMPLETION_REPORT.md) — Honest status matrix and open blockers
