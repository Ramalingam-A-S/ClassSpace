# ClassSpace — Deployment Blockers & Pre-Deploy Gates

**Current Status:** Phase 2.3.7 Local Implementation Complete — Ready for Pre-Deploy Verification (`ap-south-1`)

Before running `cdk bootstrap` or `cdk deploy`, the following external/environment gates must be resolved:

---

## 1. Account, Credential & Billing Gates

1. **AWS CLI Session & Non-Root IAM Identity Not Configured Locally:**
   - `aws` CLI must be authenticated via a non-root IAM developer/deployer identity (`aws configure sso` or IAM Identity Center) before running `cdk bootstrap` or `cdk deploy`. Root credentials must **never** be used.
2. **AWS Free Plan Service & Credit Eligibility Confirmation (₹0 Out-of-Pocket Rule):**
   - Confirm interactively in AWS Billing Console whether the account's active **Free Plan** / **$100 promotional credits** cover API Gateway HTTP API v2 requests, DynamoDB `PAY_PER_REQUEST` WRUs/RRUs, Lambda (`ARM64`), Cognito (`LITE` tier), and CloudWatch Logs in `ap-south-1`.
   - Create a **$5.00 AWS Budget** alarm (50%, 80%, 100% email thresholds) prior to provisioning.
3. **CDK Bootstrap Not Yet Run:**
   - `cdk bootstrap aws://<ACCOUNT_ID>/ap-south-1` has intentionally not been executed locally.

---

## 2. Deploy-Time & Post-Deploy Configuration Steps

4. **Cognito Domain Prefix Uniqueness (`classspace-dev-auth`):**
   - Regional availability of `classspace-dev-auth` in `ap-south-1` can only be confirmed when CloudFormation provisions `AWS::Cognito::UserPoolDomain`. Adjust `cognitoDomainPrefix` in `infra/config/development.ts` if taken.
5. **Amplify Hosting & Production CORS / Callback URLs:**
   - `infra/lib/constructs/authentication.construct.ts` and `infra/lib/constructs/backend-api.construct.ts` include `http://localhost:5173` plus a `PLACEHOLDER-AMPLIFY-DOMAIN.amplifyapp.com` origin/callback. Update to the provisioned Amplify app domain and create `.env.local` from `cdk deploy` outputs for Live Mode testing.

---

## Resolved Locally Since Phase 2.2

- **Modular Domain Lambdas Implemented:** Replaced the Phase 2.2 health placeholder with 4 dedicated domain handlers (`rooms`, `availability`, `bookings`, `schedules`) in `infra/lambda/handlers/` wired with least-privilege per-handler IAM roles and 7-day CloudWatch LogGroups.
- **Transactional Slot Locks & Concurrency Enforced:** Full DynamoDB `TransactWriteItems`, strongly consistent `BatchGetItem`, and `Idempotency-Key` booking protection implemented and tested (`infra/test/booking-concurrency.test.ts`, `infra/test/handlers-integration.test.ts`).
- **Frontend Cognito PKCE + Live Adapter Implemented:** `AwsClassSpaceService` and `cognitoAuth.ts` (PKCE `S256`, in-memory tokens, OAuth scopes) integrated behind `AppModeProvider` alongside Phase 1 Demo Mode (`tests/liveService.test.ts`).
