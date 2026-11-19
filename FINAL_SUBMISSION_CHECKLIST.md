# ClassSpace — Final Submission Checklist (AWS ShipIt Challenge 2026)

## 1. AWS ShipIt Challenge 2026 — Submission Copy

- **Project Title:** ClassSpace — Smart Free Classroom Finder
- **Category / Problem Statement:** Campus Productivity & Serverless Cloud Architecture (AWS ShipIt Challenge 2026, Techfest IIT Bombay)
- **Target AWS Region:** `ap-south-1` (Asia Pacific - Mumbai)

### Elevator Pitch (Short)
ClassSpace eliminates the 10–15 minute free-period hunt for empty classrooms by combining schedule-vacant discovery, conflict-free 15-minute atomic booking locks in Amazon DynamoDB, and Cognito-authenticated student/admin workflows on a zero-idle-cost AWS serverless stack.

### Problem & Solution Summary
- **Problem:** Students waste free periods walking floor-to-floor looking for unoccupied rooms because static timetables ignore cancelled classes, exam/maintenance blocks, and peer club bookings.
- **Solution:** A dual-mode React 19 application backed by an API Gateway HTTP API, 4 modular ARM64 Node 22 AWS Lambda handlers, Cognito Authorization Code + PKCE (`S256`) with group-verified RBAC, and DynamoDB `TransactWriteItems` across 15-minute slot locks (`ClassSpaceSlotLocks`).
- **Honest Engineering Boundaries:** Explicitly separates **`SCHEDULE_VACANT`** from unverified physical occupancy (no fake IoT/CCTV claims) and labels demonstration vs admin-entered records cleanly.

### Tech Stack
- **Frontend:** React 19, TypeScript (strict), Vite, Tailwind CSS v4, React Router, React Hook Form, Zod, Vitest
- **Backend & IaC:** AWS CDK v2 (TypeScript), AWS Lambda (Node.js 22.x ARM64), API Gateway HTTP API v2 (OAuth scopes + JWT Authorizer), Amazon Cognito (`LITE` tier, PKCE), Amazon DynamoDB (`PAY_PER_REQUEST`, 4 tables + 3 GSIs), Amazon CloudWatch Logs (7-day retention)

---

## 2. Campus Ambassador (CA) Portal Submission Readiness

- **Project Demo Mode Link:** Runnable offline via `npm run dev` with `Student Demo` and `Admin Demo` roles pre-seeded in `BLOCK-A`.
- **Architecture Diagram:** Included in `ARCHITECTURE.md` (Mermaid flowchart).
- **Demo Video Guide:** Prepared in `DEMO_SCRIPT.md` (~75s walkthrough + 6 screenshots).

---

## 3. Pre-Submit Verification Checklist

| Item | Status | Notes |
| :--- | :--- | :--- |
| Frontend Demo Mode (`MockClassSpaceService` + 7 pages) | Ready | Verified via `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` |
| Frontend Live Mode + Cognito PKCE (`S256`, in-memory tokens) | Ready (Local) | Requires deployed API Gateway + Cognito outputs in `.env.local` for live auth test |
| Backend Domain Lambdas (`rooms`, `availability`, `bookings`, `schedules`) | Ready (Local) | Verified via Jest concurrency & handler integration suites |
| AWS CDK Stack & CloudFormation Template | Synthesized | Verified via `npx cdk synth --no-lookups` & 3 guardrail suites |
| Secret Scan | Clean | Zero AWS keys, tokens, or secrets in tracked files |
| Git Repository & Commits | Clean | Meaningful history on `main` / `feat/classspace-mvp` |
| Live AWS Account Deployment | Blocked | Awaits non-root AWS CLI credentials & ₹0 Free Plan / credit check in console |
| Screen-Recorded Demo Video & Live Portal Submission | User Action Needed | Record using `DEMO_SCRIPT.md` and submit manually on ShipIt / CA portals |
