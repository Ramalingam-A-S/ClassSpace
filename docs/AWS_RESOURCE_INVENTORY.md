# ClassSpace — Planned AWS Resource Inventory (Phase 2.2 Target)

**Environment:** `development`  
**Region:** `ap-south-1` (Asia Pacific – Mumbai)  
**Standard Tags:** `Project=ClassSpace`, `Environment=Development`, `Owner=StudentProject`  
**Current Status:** **PLANNING ONLY — ZERO RESOURCES PROVISIONED.**

---

| # | Resource Name | AWS Service | Region | Purpose | Expected Cost Category | Security Configuration | Cleanup Method |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | `classspace-dev-budget` | AWS Budgets | Global (Billing) | $5/mo monthly actual & forecasted alerts (50%, 80%, 100%) | Free (first 2 action-free budgets) | Notification-only (no automated IAM actions) | Delete in Billing -> Budgets |
| 2 | `classspace-dev-amplify` | AWS Amplify Hosting | `ap-south-1` | Hosts static Vite React SPA build | 12-mo Free Tier (if eligible) / Low usage-based CDN & build minutes | HTTPS enforced; public `VITE_*` vars only; zero secrets | Delete Amplify app in Console/CLI |
| 3 | `classspace-dev-users` | Amazon Cognito User Pool | `ap-south-1` | User directory (`student` & `admin` groups), OIDC/PKCE | Free up to 10,000 direct MAUs (Lite/Essentials); SMS MFA disabled | Public SPA client (`GenerateSecret: false`), PKCE `S256`, TOTP MFA optional for admins | `cdk destroy` / delete User Pool & Domain |
| 4 | `classspace-dev-http-api` | Amazon API Gateway (HTTP API) | `ap-south-1` | Routes `/rooms*`, `/bookings*`, `/admin/*` | 12-mo Free Tier (1M calls/mo) / low per-million afterward | Cognito JWT Authorizer (`401` on invalid JWT); strict CORS; throttling `10 req/s`, burst `20` | `cdk destroy` |
| 5 | `classspace-dev-api-lambdas` | AWS Lambda (`arm64`, 256 MB, 10s) | `ap-south-1` | Business logic, Zod validation, `TransactWriteItems` | Always Free Tier (1M reqs, 400k GB-s/mo) | Least-privilege IAM role per handler (scoped to specific tables/GSIs); no VPC/NAT; verifies `jwt.sub` & `cognito:groups` | `cdk destroy` |
| 6 | `ClassSpaceRooms` | Amazon DynamoDB (Standard) | `ap-south-1` | Classroom metadata + `GSI_BlockFloor` | Low / Always Free eligible if Provisioned <= 25 RCU/WCU total; else On-Demand pennies | Encryption at rest (AWS-owned key); IAM scoped to Lambda roles only; no public access | Delete table manually if Retain policy, or `cdk destroy` |
| 7 | `ClassSpaceSchedules` | Amazon DynamoDB (Standard) | `ap-south-1` | Daily timetable entries & restrictions | Same as above | Encryption at rest; IAM scoped to Lambda roles | Delete table / `cdk destroy` |
| 8 | `ClassSpaceBookings` | Amazon DynamoDB (Standard) | `ap-south-1` | Student bookings + `GSI_StudentBookings` + `GSI_RoomDateBookings` | Same as above | Encryption at rest; student queries restricted by `jwt.sub` | Delete table / `cdk destroy` |
| 9 | `ClassSpaceSlotLocks` | Amazon DynamoDB (Standard) | `ap-south-1` | Atomic 15-min slot locks (`TIMETABLE`, `BOOKING`, `RESTRICTION`) | Same as above | Encryption at rest; mutated only via `TransactWriteItems` in Lambda | Delete table / `cdk destroy` |
| 10 | `/aws/lambda/classspace-dev-*` & `/aws/apigateway/classspace-dev` | Amazon CloudWatch Logs | `ap-south-1` | Structured error & request telemetry | Free up to 5 GB ingestion; short retention keeps storage near zero | **7–14 day retention** enforced; no PII or JWT tokens logged | `cdk destroy` / delete Log Groups |
| 11 | `CDKToolkit` (Staging) | CloudFormation / S3 / IAM | `ap-south-1` | AWS CDK deployment staging bucket & deploy role | Minimal S3 pennies (empty/small artifacts) | Private S3 bucket, SSL enforced, least-privilege bootstrap | Empty & delete `cdk-*-assets-*` S3 bucket + `CDKToolkit` stack |
