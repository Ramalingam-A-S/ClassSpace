# ClassSpace — Cloud Cost Guardrails & FinOps Policy

**Proposed Monthly Internal Budget:** **USD $5.00 / month**  
**Alert Thresholds:** **50% ($2.50)**, **80% ($4.00)**, **100% ($5.00)**  
**Environment:** `development` (`ap-south-1`)  
**Disclaimer:** These are project-selected warning levels, **not** an AWS Free Tier guarantee or a hard spending cap. ClassSpace is **not** guaranteed to cost $0.00.

---

## 1. Mandatory Budget & Billing Governance

- **A. Manual Inspection Required:** Account plan, 12-month Free Tier status, and promotional/AWS Educate/Activate credit balances and expiration dates must be inspected manually by the user in the AWS Billing Console prior to provisioning.
- **B. Monthly Actual Cost Alerts:** Create a monthly AWS Cost Budget of **$5.00 USD** with email notifications at **50%**, **80%**, and **100%** of **Actual** spend.
- **C. Forecasted Cost Alerts:** Enable **Forecasted** cost alerts (e.g., at **80%** and **100%** of the $5.00 budget) where supported so runaway loops or unexpected traffic trigger early warnings before the month ends.
- **D. Credits & Discounts in Budget Calculations:** Do **not** assume credits automatically mask budget thresholds the way you expect. In AWS Budgets Advanced Options, verify whether **Credits** and **Refunds** are included or excluded:
  - *Recommended for student safety:* **Exclude credits** from one budget (or track raw unblended cost) so you detect unexpected consumption even while credits cover the invoice; optionally configure a second view/check including credits to monitor out-of-pocket cash impact. Verify exact filter behavior in **Billing and Cost Management -> Budgets -> Advanced Options**.
- **E. Notification != Hard Cap:** AWS Budgets notifications are **alerts only**. They do **not** automatically stop Lambda invocations, DynamoDB writes, or Amplify builds when $5.00 is reached.
- **F. No Automatic Plan Upgrades:** Never upgrade AWS Support plans (stay on Basic Support) or enable paid add-on tiers automatically.
- **G. No Action-Enabled Budget Policies Without Approval:** Do **not** attach automated IAM/SSM budget actions (which could lock accounts or break stacks) unless explicitly approved by the user.

---

## 2. Architecture Cost Controls & Prohibited Resources

### Services Explicitly Prohibited in Phase 2 Development
- **NAT Gateways** (~$32+/month fixed hourly + data fees — keep Lambda **outside** a VPC so no NAT Gateway is needed to reach DynamoDB/Cognito).
- **EC2 Instances / Always-On Containers** (no idle hourly compute).
- **Amazon Aurora / RDS Instances** (hourly DB charges; DynamoDB is chosen instead).
- **DynamoDB Global Tables** (cross-region replication doubles write costs).
- **AWS WAF / Shield Advanced** (monthly per-ACL and per-rule charges; use API Gateway HTTP API throttling instead).
- **Unnecessary S3 Buckets / Versioning Lifecycle Sprawl** (Amplify Hosting manages static SPA assets directly).
- **Provisioned Infrastructure with Idle Capacity** (except deliberate Always-Free-bounded DynamoDB evaluation if chosen—see Section 3).
- **Cross-Region Traffic** (co-locate Amplify, Cognito, API Gateway, Lambda, DynamoDB, and CloudWatch in `ap-south-1`).

---

## 3. Per-Service Cost Optimization & Charge Matrix

| Service | Configuration Rule | Potential Charge Drivers | Free Allowance / Caveat (Verify in Account) |
| :--- | :--- | :--- | :--- |
| **Amazon DynamoDB** | Use **Standard** table class (`ap-south-1`). Start with **On-Demand** capacity initially *or* verify Provisioned <= 25 RCU/WCU Always Free applicability. **Do NOT enable** PITR, DynamoDB Streams, On-Demand Backups, Global Tables, or extra GSIs without cost review. | On-Demand WRUs/RRUs, excess storage > 25 GB, GSIs (every GSI duplicates write cost), PITR (~$0.20+/GB-mo), Streams read units. | **Critical Caveat:** DynamoDB's Always Free Tier (25 GB storage + **25 provisioned RCUs + 25 provisioned WCUs**) applies to **Provisioned** mode, *not* On-Demand request units. On-Demand bills per request from request #1 (very low at student scale, e.g., fractions of $1 for <100k requests, unless looped). Verify whether Provisioned (e.g., 2–5 RCU/WCU per table, total <= 25) or On-Demand is preferred before Phase 2.2. |
| **AWS Lambda** | Small memory (**128–256 MB**), short timeout (**10 seconds**), Node.js 22.x (`arm64`), zero provisioned concurrency, outside VPC. | Request count + GB-seconds duration; recursive retry loops. | Always Free Tier includes 1M requests + 400,000 GB-seconds/month (subject to account/org limits). |
| **API Gateway HTTP API** | Use **HTTP API** (`apigatewayv2`), **not** REST API v1. Configure conservative route throttling (e.g., burst 20, rate 10 req/s) to prevent abuse/runaway cost. | Per-million requests (`ap-south-1` rate). | 12-month Free Tier only (1M HTTP API calls/mo if account is within first 12 months); billed per million afterward. |
| **Amazon Cognito** | User Pool on **Lite** or **Essentials** tier only. **Disable** Plus tier, Threat Protection / Advanced Security, and SMS MFA (SNS SMS incurs per-message international fees). Use email-only verification and password/PKCE. | >10,000 direct MAUs, >50 SAML/OIDC federated MAUs, SMS messages, Advanced Security add-on. | Lite/Essentials include 10,000 MAUs/mo for direct sign-in (subject to account/org terms). |
| **Amazon CloudWatch** | Set explicit **7–14 day log retention** on all Lambda and API Gateway log groups (never "Never Expire"). Avoid custom high-frequency metrics or unnecessary CloudWatch Dashboards/Alarms beyond free limits. | Log ingestion ($/GB), log storage, Insights queries, excess alarms/custom metrics. | First 5 GB log ingestion/archiving and 10 basic alarms generally fall in Free Tier; short retention prevents unbounded storage growth. |
| **AWS Amplify Hosting** | Static Vite SPA build only (no SSR compute). Keep build frequency reasonable (avoid redundant CI rebuilds on doc-only commits). | Build minutes (>1,000/mo), CDN data transfer out (>15 GB/mo), storage (>5 GB). | 12-month Free Tier allowance only on eligible new accounts; afterward build minutes (~$0.01/min) and bandwidth (~$0.15/GB) apply. |

---

## 4. Mandatory Resource Tagging Standard

Every taggable AWS resource deployed in Phase 2.2+ must carry:

```text
Project     = ClassSpace
Environment = Development
Owner       = StudentProject
```

Activate `Project` and `Environment` under **Billing -> Cost Allocation Tags** within 24 hours of deployment so spend can be broken down per project.

---

## 5. Resource Cleanup & Teardown Checklist

To return the account to zero ongoing footprint after evaluation or semester completion:
1. Delete the CDK/SAM CloudFormation stack (`ClassSpace-Development`) and wait for `DELETE_COMPLETE`.
2. Verify all 4 DynamoDB tables (`ClassSpaceRooms`, `ClassSpaceSchedules`, `ClassSpaceBookings`, `ClassSpaceSlotLocks`) are deleted (DynamoDB tables with `RETAIN` policy must be deleted manually if retained).
3. Verify the Cognito User Pool and Domain prefix are deleted.
4. Delete the AWS Amplify Hosting app.
5. Delete any orphaned CloudWatch Log Groups (`/aws/lambda/classspace-*`, `/aws/apigateway/classspace-*`) and IaC bootstrap S3 staging artifacts if no longer used.
6. Confirm in **AWS Cost Explorer** 48 hours later that daily unblended spend for `Project=ClassSpace` has dropped to `$0.00`.
