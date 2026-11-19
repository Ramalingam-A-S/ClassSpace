# ClassSpace — Phase 2.1 AWS Account Readiness Audit

**Audit Date:** 2026-11-19 (Asia/Kolkata)  
**Target Region:** `ap-south-1` (Asia Pacific – Mumbai)  
**Phase Status:** Audit and preparation only. **No AWS resources have been provisioned or modified.**

---

## 1. Read-Only CLI Inspection Results

The following read-only commands were executed in the workspace (`d:\ClassSpace`) without accessing any credential files (`~/.aws/credentials`, `.env`, or browser auth stores):

| Check | Command | Observed Result | Status |
| :--- | :--- | :--- | :--- |
| AWS CLI v2 installation | `aws --version` | `aws` command not found in `PATH` (`CommandNotFoundException`); `C:\Program Files\Amazon\AWSCLIV2\aws.exe` and `(x86)` paths returned `False`. | **Not installed / unavailable in workspace environment** |
| CLI authentication | `aws sts get-caller-identity` | Could not execute because AWS CLI is not installed. | **Not yet verified** |
| Configured default region | `aws configure get region` | Could not execute because AWS CLI is not installed. | **Not yet verified** |
| Regional availability query | `aws ec2 describe-regions` | Could not execute because AWS CLI is not installed. | **Not yet verified** |
| IaC CLI tools | `where.exe cdk`, `where.exe sam` | Neither `cdk` nor `sam` was found in `PATH`. | **Not installed** |

### Recorded Account Details (Redacted Format)
- **AWS CLI Installation Status:** Not installed on the local workstation.
- **CLI Authentication Status:** Unauthenticated / Unable to verify locally.
- **Active AWS Account ID:** Not verified (must be redacted as `********XXXX` once verified).
- **Active Principal Type:** Not verified (e.g., IAM User, IAM Identity Center SSO Role, or Root—note: Root must **not** be used for daily development).
- **Configured Default Region:** Not verified locally.
- **Target Region (`ap-south-1`) Availability:** Verified via official AWS documentation that Cognito User Pools, API Gateway HTTP APIs, Lambda, DynamoDB, CloudWatch, and Amplify Hosting are available in `ap-south-1`. Account-specific opt-in status (`ap-south-1` is enabled by default on standard AWS accounts) must still be confirmed in the user's account.

---

## 2. Regional Availability Assessment (`ap-south-1`)

All proposed core services are available in `ap-south-1` (Asia Pacific – Mumbai), enabling single-region co-location for low latency to campus users in India (`Asia/Kolkata` timezone) and eliminating cross-region data transfer charges:

| AWS Service | Available in `ap-south-1`? | Regional Notes & Verification Caveats |
| :--- | :--- | :--- |
| **Amazon Cognito User Pools** | Yes | Supports Lite, Essentials, and Plus tiers. Avoid Plus tier and paid SMS MFA add-ons to prevent unintended per-MAU or SNS SMS charges. |
| **Amazon API Gateway (HTTP API)** | Yes | Significantly lower cost than REST API v1; supports native JWT authorizers for Cognito User Pools. |
| **AWS Lambda** | Yes | Supports Node.js 22.x / TypeScript (`arm64` Graviton2 or `x86_64`). Note that `arm64` often has lower per-GB-second pricing—verify regional rates in the AWS Pricing Calculator. |
| **Amazon DynamoDB** | Yes | Standard table class supported. On-demand and provisioned modes both available. Verify account-level Always Free Tier vs On-Demand billing rules (see `COST_GUARDRAILS.md`). |
| **Amazon CloudWatch** | Yes | Logs and metrics available in `ap-south-1`. Enforce 7–14 day retention on Lambda and API Gateway log groups. |
| **AWS Amplify Hosting** | Yes | Manages global CloudFront edge distribution from `ap-south-1` app configuration. Static SPA hosting avoids SSR compute charges. |

> **Pricing Assumption Warning:** Never assume `ap-south-1` unit pricing or Free Tier promotional credit applicability is identical to `us-east-1`. Verify exact `ap-south-1` rates via the AWS Pricing Calculator before Phase 2.2 deployment.

---

## 3. Manual AWS Console Verification Checklist (User Action Required)

Because local AWS CLI inspection is unavailable and credential files were intentionally never accessed, the user must verify the following directly in the **AWS Management Console** before Phase 2.2 begins:

| # | Item to Inspect in AWS Console | Where to Look | User-Supplied Status / Value |
| :--- | :--- | :--- | :--- |
| 1 | **Account Plan & Support Tier** | Billing & Cost Management -> Account / Support | `[ ] Verified Basic (Free) Support Plan` |
| 2 | **Account Creation Date** | Account Settings | `[ ] Date: ____________` |
| 3 | **12-Month Free Tier Eligibility** | Billing -> Free Tier | `[ ] Active (Expires: ______) / [ ] Expired` |
| 4 | **Remaining Promotional / Student Credits** | Billing -> Credits | `[ ] Amount: $______ / [ ] None` |
| 5 | **Credit Expiration Date** | Billing -> Credits | `[ ] Expires: ____________` |
| 6 | **IAM Access to Billing** | Account Settings -> IAM User and Role Access to Billing Information | `[ ] Enabled for dev admin role` |
| 7 | **Existing Resource Usage** | Cost Explorer / Resource Groups & Tag Editor (`ap-south-1` & `us-east-1`) | `[ ] Confirmed clean / [ ] Existing spend: $____` |
| 8 | **Existing AWS Budgets** | Billing -> Budgets | `[ ] None yet / [ ] Existing budget configured` |
| 9 | **Non-Root Admin Setup** | IAM Identity Center or IAM -> Users/Roles | `[ ] MFA enabled on Root + non-root IAM admin ready` |
| 10 | **AWS CLI v2 Local Setup (for Phase 2.2)** | Local terminal (`aws configure sso` preferred over static keys) | `[ ] Installed & tested` |

---

## 4. Phase 2.2 Entry Gate (Prerequisites)

Phase 2.2 (IaC & backend provisioning) must **not** start until:
1. The user completes the Manual Console Checklist above and confirms Free Tier / credit status.
2. A non-root IAM/SSO identity with least-privilege permissions is configured locally (`aws sts get-caller-identity` succeeds and displays redacted account confirmation).
3. The **$5 USD/month AWS Budget** with 50%, 80%, and 100% alerts is configured first.
4. Explicit user approval is given for the architecture and cost guardrails in this Phase 2.1 package.
