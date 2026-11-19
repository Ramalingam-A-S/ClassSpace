# ClassSpace — AWS Cost Estimate & Guardrails

**Target Region:** `ap-south-1` (Asia Pacific - Mumbai)  
**Target Budget:** ₹0 personal out-of-pocket spend (AWS Free plan + user-reported $100 promotional credits)

---

## 1. Enforced Infrastructure Cost Controls (`infra/test/cost-guardrails.test.ts`)

Every guardrail below is programmatically verified on the synthesized CloudFormation template (`ClassSpaceDevelopmentStack`):

| Service | Configuration Enforced | Paid Feature Avoided |
| :--- | :--- | :--- |
| **Amazon DynamoDB** | 4 tables, `PAY_PER_REQUEST`, `STANDARD` class | Provisioned RCUs/WCUs, PITR, Streams, Global Tables, DAX |
| **AWS Lambda** | 4 functions, `ARM64` Graviton2, `256 MB`, `10s` timeout, Node 22.x | Provisioned Concurrency, x86 higher compute, VPC ENIs |
| **API Gateway** | `HttpApi` (v2) with stage throttling `10 req/s`, burst `20` | REST API (`AWS::ApiGateway::RestApi`), WAFv2, Caching |
| **Amazon Cognito** | `LITE` tier User Pool, AWS prefix domain (`classspace-dev-auth`), optional TOTP MFA | Cognito Plus tier / Threat Protection, SMS MFA, custom ACM/Route 53 |
| **CloudWatch Logs** | 4 LogGroups, `7 days` retention (`ONE_WEEK`) | Infinite retention, custom KMS keys, Metric Filters / Dashboards |
| **Networking & Compute** | Zero VPCs, zero NAT Gateways, zero EC2/RDS/Aurora/S3/ElastiCache | Idle hourly NAT Gateway / EC2 / RDS billing (~$32+/mo eliminated) |

---

## 2. Estimated Monthly Development Usage (`ap-south-1`)

Assuming a hackathon / campus pilot load of ~10,000 API requests/month, ~5,000 DynamoDB writes (`TransactWriteItems` / `PutItem`), ~50,000 reads (`Query` / `BatchGetItem`), <1 GB Log ingestion, and <50 monthly active users:

| Service | Usage Estimate | Free Tier / Credit Applicability | Estimated List Cost |
| :--- | :--- | :--- | :--- |
| **AWS Lambda (ARM64, 256MB)** | ~10,000 invocations × 150ms | Covered by Always Free / credits (1M req + 400k GB-sec/mo free) | ~$0.00 |
| **API Gateway HTTP API v2** | ~10,000 requests | $1.00 / million requests (`ap-south-1` ~ $1.00–$1.20/M) | ~$0.01 |
| **Amazon DynamoDB (`PAY_PER_REQUEST`)** | ~5k writes, ~50k reads, <50 MB | Check if Free plan credits apply; always-free applies primarily to 25GB provisioned RCU/WCU, while on-demand draws pennies from credits | ~$0.02 |
| **Amazon Cognito (`LITE`)** | <50 MAUs | 10,000 MAUs/mo Free Tier (LITE tier) | ~$0.00 |
| **CloudWatch Logs** | <50 MB/month, 7-day expiry | 5 GB ingestion/archival Free Tier | ~$0.00 |
| **Total Expected Dev Spend** | **Low pilot traffic** | **Verify $100 credit eligibility before deploy** | **< $0.05 / month** |

> **Pre-Deploy Verification Warning:** DynamoDB `PAY_PER_REQUEST` requests and API Gateway HTTP API are billed per request outside provisioned Free Tier limits unless covered by promotional credits. Always verify your billing console & $5 AWS Budget alert before running `cdk deploy`.
