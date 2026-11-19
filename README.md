# ClassSpace — Campus Classroom Availability Discovery (Phase 1)

ClassSpace helps college students discover **schedule-vacant** classrooms during their free periods and provides administrators with tools to manage rooms, timetables, restrictions, and booking approvals.

> **Important Disclosure (Phase 1 Demo Mode):**
> All classrooms, schedules, bookings, and restrictions in Phase 1 are fictional **DEMO** records. ClassSpace evaluates **schedule availability only** and **never claims real-time physical occupancy verification**.

---

## Technology Stack

- **Frontend:** React 19, TypeScript (strict mode), Vite, Tailwind CSS v4, React Router
- **Forms & Validation:** React Hook Form, Zod (`@hookform/resolvers`)
- **Icons:** Lucide React
- **Testing & Quality:** Vitest, React Testing Library, ESLint, TypeScript (`tsc`)

---

## Prerequisites

- **Node.js:** v20+ or v22+ (verified on Node v22.20.0)
- **npm:** v10+

---

## Installation & Running Locally

```bash
# 1. Install dependencies
npm install

# 2. Start the local development server
npm run dev
```

Open the local URL printed by Vite (typically `http://localhost:5173`).

---

## Verification Commands

```bash
# TypeScript strict type checking
npm run typecheck

# ESLint check
npm run lint

# Automated unit and UI integration tests (Vitest + React Testing Library)
npm test

# Production build
npm run build
```

---

## Demo Mode Explanation

- **Explicit Demo Mode Indicator:** A persistent top banner identifies `DEMO MODE` and the active demo persona.
- **Role Switcher:** Use the `Demo Role` selector in the navigation bar to switch between **Student Demo** (`Aarav Nair`) and **Admin Demo** (`Dr. Kavitha Rao`). This is a Phase 1 UI simulation, not real authentication.
- **Local Persistence:** Changes (booking requests, approvals, new rooms, timetable edits, restrictions) persist across browser refreshes via `localStorage` (`LocalMockRepository`). Use **Reset Demo Data** in the footer at any time to restore the initial seed dataset.
- **Campus Timezone:** All dates and times use `Asia/Kolkata` (IST).

---

## Key Features

- **Availability Engine (`src/services/availabilityEngine.ts`):**
  - Distinguishes `SCHEDULE_VACANT`, `OCCUPIED_TIMETABLE`, `OCCUPIED_BOOKING`, `RESTRICTED`, `INACTIVE`, and `INSUFFICIENT_CAPACITY`.
  - Uses strict half-open interval overlap (`requestedStart < existingEnd && requestedEnd > existingStart`), allowing adjacent slots (`10:00–11:00` and `11:00–12:00`).
  - Pending requests never block availability until approved by an administrator.
- **Student Views:** Landing Page (`/`), Student Dashboard (`/student`), Room Details (`/rooms/:roomId`), My Bookings (`/bookings`).
- **Admin Views:** Admin Dashboard (`/admin`), Room Management (`/admin/rooms`), Timetable & Restrictions (`/admin/timetable`).

---

## Known Limitations

- Single academic block (`BLOCK-A`) demonstration dataset only.
- No institutional timetable feed connection yet.
- No physical room occupancy sensors; schedule-vacant rooms may still be occupied by unscheduled users.
- Data is stored per-browser in `localStorage` rather than a centralized server database.

---

## Future AWS Architecture (Phase 2)

All UI views communicate with `IClassSpaceService` (`src/services/contracts.ts`). In Phase 2:
- **Authentication:** Amazon Cognito (User Pool + `student` / `admin` groups).
- **API Layer:** Amazon API Gateway + AWS Lambda enforcing JWT authorization and server-side conflict checks.
- **Database:** Amazon DynamoDB or Amazon Aurora PostgreSQL (see [docs/DATABASE_SCHEMA.md](docs/DATABASE_SCHEMA.md) and [docs/API_CONTRACT.md](docs/API_CONTRACT.md)).
- **Hosting:** Amazon S3 + Amazon CloudFront (or AWS Amplify Hosting).

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/PHASE1_REPORT.md](docs/PHASE1_REPORT.md) for full details.
