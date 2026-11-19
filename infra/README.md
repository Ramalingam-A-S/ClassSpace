# ClassSpace — AWS CDK v2 Infrastructure (`infra/`)

Standalone AWS CDK v2 (TypeScript) infrastructure foundation for **ClassSpace** (`ap-south-1`, Development environment).

> **LOCAL IMPLEMENTATION ONLY:**
> Do **not** run `cdk bootstrap` or `cdk deploy` until Phase 2.1/2.2 deployment blockers are resolved and explicit approval is given. All tests and CloudFormation synthesis run completely offline without AWS credentials.

---

## Directory Structure

```text
infra/
  bin/classspace.ts                     # CDK app entrypoint (account unresolved, region ap-south-1)
  config/development.ts                 # Environment, Cognito prefix, & guardrail constants
  lambda/
    health/index.ts                     # Lightweight standardized health handler (no AWS calls)
    shared/
      authorization.ts                  # Reusable JWT sub & admin-group authorization contract
      api-types.ts                      # Strict HTTP API v2 event/response types
      api-error.ts                      # Typed ApiError hierarchy (400..503)
      api-response.ts                   # Standard { success, data/error, requestId } envelopes
      error-handler.ts                  # Safe error mapper (no stack traces / AWS SDK leaks)
      logger.ts                         # Structured JSON logger with sensitive key/JWT redaction
      request-context.ts                # RequestId extraction & route auth contract
      validation.ts                     # Strict Zod body/query/path parsers
      middleware.ts                     # Composable withApiHandler wrapper
    schemas/
      common.schema.ts                  # Strict date, time, timeRange, roomId, bookingId schemas
      pagination.schema.ts              # Bounded limit (1..50) & opaque nextToken schema
    repositories/
      interfaces/                       # Storage-independent Room/Schedule/Booking/SlotLock contracts
      dynamodb/repository-context.ts    # AWS SDK v3 DynamoDB boundary (lazy/injected client)
      memory/in-memory-context.ts       # Isolated in-memory repository for unit tests
  lib/
    classspace-stack.ts                 # Root stack + tags + outputs
    constructs/
      database.construct.ts             # 4 DynamoDB tables + 3 GSIs
      authentication.construct.ts       # Cognito User Pool, prefix domain, groups, public SPA client
      backend-api.construct.ts          # API Gateway HTTP API, JWT authorizer, throttling, Lambda, scoped IAM
      monitoring.construct.ts           # Dedicated 7-day CloudWatch LogGroup
    concurrency/
      slot-locks.ts                     # 15-min slot lock key builder, scheduleKey helper, transaction counter
  test/
    infrastructure.test.ts              # DynamoDB, Cognito domain, Lambda, API Gateway, TTL assertions
    security-guardrails.test.ts         # Cognito MFA/tier, JWT authorizer, least-privilege IAM (no Scan)
    cost-guardrails.test.ts             # PAY_PER_REQUEST, no PITR/Streams/NAT/EC2/RDS/KMS, tags
    concurrency-rules.test.ts           # Half-open intervals, 4h/8h caps, diff logic, <=100 action count
    authorization.test.ts               # 12 unit tests for JWT sub & admin-group authorization contract
  cdk.out/                              # Synthesized CloudFormation template output directory
```

---

## Local Commands (Safe — No AWS Account Access)

```bash
cd D:\ClassSpace\infra

# Install pinned dependencies
npm install

# Compile TypeScript
npm run build

# Run infrastructure, security, cost, and concurrency tests
npm test

# Synthesize CloudFormation locally without AWS credentials
npx cdk synth --no-lookups
```

Synthesized CloudFormation template output is written to:
`D:\ClassSpace\infra\cdk.out\ClassSpaceDevelopmentStack.template.json`

---

## Intended Frontend Hosting Architecture (Deferred — Not Provisioned)

- **Hosting Target:** AWS Amplify Hosting (static Vite React SPA output from root `dist/`).
- **No SSR / No Compute:** Pure static asset hosting only; no Amplify SSR compute charges.
- **No Auto-Connect Yet:** No GitHub repository token or Amplify app is provisioned or connected in Phase 2.2.
- **No Secrets in Frontend:** Only public Cognito identifiers (`VITE_COGNITO_USER_POOL_ID`, `VITE_COGNITO_CLIENT_ID`, `VITE_API_BASE_URL`) will be supplied in future phases; client secrets are disabled (`GenerateSecret: false`).
- **Future Frontend OAuth Scopes (Phase 2.3+):** When Cognito PKCE login is wired into the React frontend, the client must request `openid`, `email`, `profile`, `classspace/read`, `classspace/bookings/write`, and (where applicable) `classspace/admin` and supply the resulting Access Token to API Gateway routes. The Phase 1 frontend does not yet implement Cognito authentication or send these scopes.
