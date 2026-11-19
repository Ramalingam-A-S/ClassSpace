# ClassSpace — System Architecture (Phase 1 Foundation)

## 1. Overview

ClassSpace is a campus classroom availability discovery platform designed to help students identify **schedule-vacant** classrooms during free periods and allow administrators to manage rooms, timetables, restrictions, and booking requests.

Phase 1 delivers a fully functional, locally runnable single-block demonstration application built with React 19, TypeScript (strict mode), Vite, and Tailwind CSS, backed by an isolated local mock repository.

---

## 2. Core Domain Distinction

ClassSpace strictly enforces a four-state conceptual model so users are never misled about physical room occupancy:

| State | Meaning | Blocks Availability? |
| :--- | :--- | :--- |
| **Schedule-Vacant** | Room is active, meets capacity, and has no overlapping timetable entry, approved booking, or restriction. | No (Eligible for request) |
| **Approved Booking** | An administrator-approved student booking overlaps the requested interval. | Yes |
| **Restricted** | An administrator marked the room unavailable (maintenance, exam, event). | Yes |
| **Unknown Physical Occupancy** | Phase 1 has no occupancy sensors or CCTV integration; schedule-vacant does not guarantee the room is physically empty. | Informational notice on all results |

Pending, rejected, and cancelled booking requests **never** block availability.

---

## 3. Layered Frontend Architecture

```text
src/
  app/
    App.tsx                 # BrowserRouter, route table, reset epoch coordination
    DemoRoleProvider.tsx    # Explicit Phase 1 demo role switcher context
  components/
    layout/                 # AppShell, Logo, Footer, AdminRoleGate
    ui/                     # Reusable Button, Card, Dialog, ConfirmDialog, Badges, Banners
    rooms/                  # RoomCard, AvailabilityLegend
    bookings/               # BookingRequestModal
  pages/                    # Presentation & form wiring (no business logic)
    LandingPage.tsx
    StudentDashboardPage.tsx
    RoomDetailsPage.tsx
    MyBookingsPage.tsx
    AdminDashboardPage.tsx
    AdminRoomsPage.tsx
    AdminTimetablePage.tsx
  hooks/                    # useDemoRole, useDocumentTitle, useAsyncData
  services/
    contracts.ts            # IClassSpaceService interface (Phase 2 AWS boundary)
    availabilityEngine.ts   # Pure availability & overlap evaluation engine
    mockRepository.ts       # Isolated localStorage + memory fallback store
    mockClassSpaceService.ts# Phase 1 service implementation
  data/
    demoData.ts             # Fictional Block-A seed generator (dataSource: 'DEMO')
  types/
    domain.ts               # Strict TypeScript domain models
  utils/
    datetime.ts             # Asia/Kolkata (IST) date/time & interval math
    validation.ts           # Zod validation schemas
```

---

## 4. Service Abstraction & Phase 2 AWS Migration Path

All page components and modals interact exclusively with the `IClassSpaceService` contract (`src/services/contracts.ts`).

- **Phase 1**: `MockClassSpaceService` implements `IClassSpaceService` using `LocalMockRepository` (`localStorage` key `classspace_phase1_demo_repository_v1`).
- **Phase 2 (Planned)**: An `AwsClassSpaceService` implementation will swap in `fetch` calls to Amazon API Gateway / AWS Lambda endpoints authenticated with Amazon Cognito JWTs, without rewriting UI components or page views.

---

## 5. Security Boundaries (Phase 1 vs Phase 2)

- **No fake authentication**: Phase 1 uses an explicit `Demo Role` selector (`Student Demo` vs `Admin Demo`) stored only for UI previewing.
- **No frontend trust**: `AdminRoleGate` is purely a UX boundary in Demo Mode. In Phase 2, all `/admin/*` endpoints must verify Cognito `admin` group claims server-side inside API Gateway authorizers and Lambda handlers.
- **Student isolation**: `getMyBookings(studentId)` filters bookings to the active student identity (`student-demo-01`), preventing cross-student leakage in the simulated student view.
- **No secrets**: `.env.example` contains placeholder values only.
