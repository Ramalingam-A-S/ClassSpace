# ClassSpace — Hackathon Demo Video Script (60–90 Seconds) & Screenshot Checklist

## Target Recording Length: ~75 Seconds

| Timestamp | Visual / Route | Voiceover Script |
| :--- | :--- | :--- |
| **0:00 – 0:12** | Landing Page (`/`) showing hero, 4-state clarity cards, and **DEMO MODE** banner | *"College students waste 10 to 15 minutes every free period hunting floor-to-floor for an empty classroom. Existing timetables only show scheduled classes—they don't cover ad-hoc bookings, cancellations, or exam blocks. Meet **ClassSpace**."* |
| **0:12 – 0:28** | Student Dashboard (`/student`) -> search `11:00–12:00`, min capacity `30`, floor filter -> highlight `SCHEDULE_VACANT` cards + physical occupancy notice | *"In **Demo Mode** or authenticated **Live AWS Mode**, students filter classrooms by date, 15-minute slot boundaries, capacity, floor, and equipment like Projectors or Smart Boards. Notice our honest design: ClassSpace explicitly labels `Schedule-Vacant` instead of falsely claiming physical room occupancy."* |
| **0:28 – 0:42** | Room Details (`/rooms/block-a-101`) -> Submit booking request -> show `My Bookings` (`/bookings`) with `PENDING` status | *"Students can inspect a room's full daily timeline and submit a booking request. Pending requests stay non-blocking until an administrator reviews them—and every write supports idempotency keys."* |
| **0:42 – 1:00** | Switch role/view to **Admin Dashboard** (`/admin`) -> Approve pending request -> inspect **Timetable & Restrictions** (`/admin/timetable`) -> trigger overlap warning / conflict protection | *"On the backend, AWS Lambda and DynamoDB `TransactWriteItems` enforce 15-minute half-open slot locks (`ClassSpaceSlotLocks`). When an administrator approves a request, DynamoDB atomically locks those slots so no competing approval or timetable overlap can double-book the room."* |
| **1:00 – 1:15** | Quick code/architecture slide or **Live AWS** toggle + `cdk synth` / test output terminal | *"Built with React 19, TypeScript, AWS CDK v2, Cognito PKCE with `cognito:groups`, API Gateway HTTP API OAuth scopes, 4 modular ARM64 Node 22 Lambdas, and on-demand DynamoDB in `ap-south-1`—with zero NAT Gateways, zero scans, and ₹0 wasted idle cost."* |

---

## Required Submission Screenshots Checklist

1. **Screenshot 1 (`/`):** Landing Page showing value proposition, 4 room status distinctions, and Demo Disclosure Banner.
2. **Screenshot 2 (`/student`):** Student Search with filters active, `Schedule-Vacant` results, and `Schedule-Vacant ≠ Physically Verified` notice.
3. **Screenshot 3 (`/rooms/:roomId`):** Room Details timeline & Booking Request modal open.
4. **Screenshot 4 (`/admin`):** Admin Dashboard approval queue + metrics (`Schedule-Vacant`, `Pending`, `Approved`, `Restricted`).
5. **Screenshot 5 (`/admin/timetable`):** Admin Timetable & Restrictions view showing overlap / conflict validation.
6. **Screenshot 6 (Terminal / Architecture):** Passing `npm test` (both root Vitest `24/24` and infra Jest `63/63`) + `npx cdk synth --no-lookups` + `ARCHITECTURE.md` Mermaid diagram.
