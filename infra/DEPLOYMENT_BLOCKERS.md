# ClassSpace — Deployment Blockers & Pre-Deploy Gates

**Current Phase:** 2.2 (Local CDK Implementation Only — **DO NOT DEPLOY**)

Before any `cdk bootstrap` or `cdk deploy` may occur in a future phase, the following blockers must be explicitly resolved and approved:

---

## 1. Account & Billing Blockers

1. **AWS Free Plan Service Eligibility Unverified:**
   - Confirm in AWS Billing & Console whether the current **AWS Free plan** permits deploying API Gateway HTTP API, Cognito User Pool, Lambda, DynamoDB (`PAY_PER_REQUEST`), CloudWatch Logs, and Amplify Hosting in `ap-south-1`, and confirm whether the reported **$100 credits** cover `PAY_PER_REQUEST` WRUs/RRUs and API Gateway requests.
   - Because personal budget is **₹0**, confirm explicitly whether credits cover 100% of expected dev usage and set up an **AWS Budget ($5/mo, 50%/80%/100% alerts)** beforehand.
2. **AWS CLI & IAM Non-Root Access Not Yet Configured:**
   - `aws` CLI is installed locally (`aws-cli/2.41.1`), but no IAM Identity Center / non-root developer session is authenticated (`aws login` / `aws configure sso` not completed in this phase).
   - Root account credentials must **never** be used for CDK bootstrap or deployment.
3. **CDK Bootstrap Not Performed:**
   - `cdk bootstrap` has intentionally not been run. Deploying requires bootstrapping `ap-south-1` once an authorized non-root identity and billing safeguards are confirmed.

---

## 2. Application & Functional Blockers (Deferred to Phase 2.3+)

4. **Cognito Domain Prefix Uniqueness Unverified:**
   - `classspace-dev-auth` is defined in `infra/config/development.ts` for `ap-south-1`. Because Cognito prefix domains share a regional namespace across all AWS accounts, global availability of `classspace-dev-auth` cannot be verified offline and must be checked at deployment time.
5. **Placeholder Lambda Handler Only:**
   - `infra/lambda/health/index.ts` is a minimal health stub with zero DynamoDB business logic. Real route handlers (`/rooms*`, `/bookings*`, `/admin/*`), Zod validation, `TransactWriteItems` concurrency logic, and integration of `infra/lambda/shared/authorization.ts` belong to Phase 2.3+.
6. **Amplify Hosting & Production Callback URL Placeholder:**
   - Cognito SPA client currently lists `https://PLACEHOLDER-AMPLIFY-DOMAIN.amplifyapp.com/auth/callback`. Once Amplify Hosting is approved and provisioned, update callback/logout URLs to the real Amplify domain.
7. **Frontend Cognito PKCE, Custom Scopes & `AwsClassSpaceService` Adapter:**
   - React frontend still runs exclusively in Phase 1 `MockClassSpaceService` Demo Mode (`IClassSpaceService` abstraction ready for Phase 2.3 adapter). The future Phase 2.3 frontend must request `openid`, `email`, `profile`, `classspace/read`, `classspace/bookings/write`, and (for admin sessions) `classspace/admin` during Authorization Code + PKCE login, and transmit the Cognito Access Token to API Gateway. Phase 1 does not currently send or enforce these scopes.
