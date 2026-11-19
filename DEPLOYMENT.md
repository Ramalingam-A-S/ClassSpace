# ClassSpace — AWS Deployment & Teardown Guide (`ap-south-1`)

> **Important Status Note:** As of 19 November 2026, ClassSpace has been **built, verified, and synthesized locally**, but has **not** been deployed to AWS because no AWS CLI credentials are configured and the user's **₹0 out-of-pocket budget / AWS Free plan / $100 promotional credit coverage** must be confirmed interactively in the AWS Console first.

---

## 1. Pre-Deployment Checklist (Mandatory ₹0 Safeguards)

Before running any AWS provisioning command:

1. **Verify AWS Plan & Promotional Credits:**
   - Sign in to the AWS Console Billing dashboard (`ap-south-1` / Mumbai + Billing Preferences).
   - Confirm whether your account's active **Free Plan** and/or **$100 AWS credits** cover:
     - API Gateway HTTP API (`PAY_PER_REQUEST`)
     - AWS Lambda (`ARM64`, Node.js 22.x, 256 MB)
     - Amazon DynamoDB (`PAY_PER_REQUEST` Standard)
     - Amazon Cognito (`LITE` tier)
     - CloudWatch Logs (7-day retention)
2. **Create a Cost Budget Alarm First:**
   - In AWS Billing -> Budgets, create a monthly cost budget of **$5.00** (or **$1.00** early warning) with email alerts at **50%, 80%, and 100%**.
3. **Authenticate via Non-Root IAM Identity (Never Root Keys):**
   ```powershell
   aws configure sso   # or aws login with non-root least-privilege deployer user
   aws sts get-caller-identity --region ap-south-1
   ```
4. **Verify Cognito Domain Prefix Availability:**
   - `infra/config/development.ts` uses prefix `classspace-dev-auth` in `ap-south-1`. If taken globally, update `cognitoDomainPrefix` in `infra/config/development.ts` before deploying.

---

## 2. Local Pre-Flight Verification

Run both verification suites locally prior to deployment:

```powershell
# 1. Infrastructure + Backend tests + CloudFormation synth
cd D:\ClassSpace\infra
npm ci
npm run build
npm test
npx cdk synth --no-lookups

# 2. Frontend typecheck, lint, tests, and Vite production bundle
cd D:\ClassSpace
npm ci
npm run typecheck
npm run lint
npm test
npm run build
```

---

## 3. Deploy Backend Stack (`ClassSpaceDevelopmentStack`)

```powershell
cd D:\ClassSpace\infra

# One-time CDK bootstrap in ap-south-1
npx cdk bootstrap aws://<ACCOUNT_ID>/ap-south-1

# Review CloudFormation diff & IAM changes before creating resources
npx cdk diff

# Deploy stack and capture outputs
npx cdk deploy ClassSpaceDevelopmentStack --require-approval broadening
```

Record the CloudFormation outputs printed at the end of `cdk deploy`:
- `HttpApiEndpoint` (e.g., `https://<api-id>.execute-api.ap-south-1.amazonaws.com`)
- `CognitoUserPoolId`
- `CognitoSpaClientId`
- `CognitoDomainBaseUrl`

---

## 4. Seed Initial Cognito Groups & Admin User

```powershell
# Create an initial student or admin test user via AWS CLI / Console
aws cognito-idp admin-create-user `
  --region ap-south-1 `
  --user-pool-id <CognitoUserPoolId> `
  --username admin@campus.example `
  --user-attributes Name=email,Value=admin@campus.example Name=email_verified,Value=true

# Assign the administrator strictly to the `admin` Cognito group
aws cognito-idp admin-add-user-to-group `
  --region ap-south-1 `
  --user-pool-id <CognitoUserPoolId> `
  --username admin@campus.example `
  --group-name admin
```

---

## 5. Run Frontend Locally in Live Mode (or Deploy to Amplify)

1. Copy `.env.example` to `.env.local` (git-ignored) and fill in the `cdk deploy` outputs:
   ```dotenv
   VITE_API_BASE_URL=https://<api-id>.execute-api.ap-south-1.amazonaws.com
   VITE_COGNITO_REGION=ap-south-1
   VITE_COGNITO_USER_POOL_ID=<CognitoUserPoolId>
   VITE_COGNITO_CLIENT_ID=<CognitoSpaClientId>
   VITE_COGNITO_DOMAIN=https://<prefix>.auth.ap-south-1.amazoncognito.com
   VITE_COGNITO_REDIRECT_URI=http://localhost:5173/auth/callback
   VITE_CAMPUS_TIMEZONE=Asia/Kolkata
   VITE_DEMO_MODE=false
   ```
2. Run `npm run dev` in `D:\ClassSpace`, switch/verify **Live AWS** mode in the top bar, click **Cognito Sign In**, and verify room creation, timetable scheduling, student search, and atomic booking approval.
3. For AWS Amplify Hosting, connect your GitHub repository in Amplify Console (`ap-south-1`), set the `VITE_*` environment variables with your Amplify domain callback URL, and update `callbackUrls` / `corsPreflight.allowOrigins` in `infra/lib/constructs/` before re-running `cdk deploy`.

---

## 6. Clean Teardown (`cdk destroy`)

When demo recording / judging is complete, destroy all provisioned AWS resources so ongoing charges stay $0:

```powershell
cd D:\ClassSpace\infra
npx cdk destroy ClassSpaceDevelopmentStack
```

Note: Tables and LogGroups use `RemovalPolicy.DESTROY` in development so teardown removes all 4 DynamoDB tables and 4 CloudWatch LogGroups cleanly.
