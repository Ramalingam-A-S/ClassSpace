# ClassSpace — Phase 2.2 Cost Guardrail Review

**Target Region:** `ap-south-1` (Mumbai)  
**Environment:** `Development`  
**User-Reported Context:** AWS Free plan, $100 promotional credits reported, ₹0 personal spending budget.

---

## 1. Cost Guardrails Enforced in CDK Template

Verified via `infra/test/cost-guardrails.test.ts` against synthesized CloudFormation:

| Guardrail | Configured State | Verification |
| :--- | :--- | :--- |
| NAT Gateways (`AWS::EC2::NatGateway`) | **0** (Lambda runs outside VPC) | Asserted `0` in template |
| EC2 Instances (`AWS::EC2::Instance`) | **0** | Asserted `0` in template |
| VPCs (`AWS::EC2::VPC`) | **0** | Asserted `0` in template |
| RDS / Aurora (`DBInstance` / `DBCluster`) | **0** | Asserted `0` in template |
| DynamoDB Global Tables | **0** | Asserted `0` in template |
| DynamoDB Point-in-Time Recovery (PITR) | **Disabled** (`false` on all 4 tables) | Asserted on all 4 tables |
| DynamoDB Streams | **Disabled** (absent on all 4 tables) | Asserted on all 4 tables |
| DynamoDB Backups | **None configured** | Verified in `DatabaseConstruct` |
| DynamoDB Table Class & Capacity | `STANDARD` + `PAY_PER_REQUEST` | Asserted on all 4 tables |
| Provisioned Lambda Concurrency | **Absent** (no alias/version concurrency) | Asserted in template |
| Lambda Sizing | `256 MB`, `10s` timeout, `ARM_64` | Asserted in template |
| API Gateway Type & Throttling | HTTP API (`apigatewayv2`), `10 req/s`, burst `20` | Asserted in template |
| CloudWatch Log Retention | **7 days** (`RetentionInDays: 7`) | Asserted in template |
| Custom KMS Keys (`AWS::KMS::Key`) | **0** (uses AWS-owned DynamoDB/Logs encryption) | Asserted `0` in template |
| Unnecessary S3 Buckets (`AWS::S3::Bucket`) | **0** in stack | Asserted `0` in template |
| Cognito SMS MFA / Plus Tier / Domain | **Disabled** (`LITE` tier, SMS off, AWS-managed prefix domain—no custom domain/ACM/Route 53) | Asserted in template |
| Standard Resource Tags | `Project=ClassSpace`, `Environment=Development`, `Owner=StudentProject` | Asserted on tables, Lambda, Cognito |

---

## 2. Critical Free Plan & `PAY_PER_REQUEST` Caveats

1. **`PAY_PER_REQUEST` is NOT covered by DynamoDB's 25 RCU/WCU Always Free Tier:**
   - DynamoDB's Always Free allowance (25 provisioned RCUs + 25 provisioned WCUs) applies to **Provisioned** mode only. `PAY_PER_REQUEST` bills per Read/Write Request Unit from the first request (while still receiving 25 GB Standard storage allowance where eligible).
   - At low development traffic (hundreds or a few thousand requests/month), `PAY_PER_REQUEST` costs fractions of a dollar—which would draw down eligible promotional credits if applicable—**but it is NOT guaranteed to be $0 on a Paid account or after credits expire**.
2. **Free Plan vs Service Eligibility:**
   - The AWS Free plan and user-reported $100 credit balance must **not** be assumed to cover every service or regional feature indefinitely. Verify exact eligibility per service (Amplify Hosting, HTTP API, Cognito, DynamoDB `PAY_PER_REQUEST`) in the AWS Billing Console before any deployment.
3. **No AWS Budgets Deployed Yet:**
   - Per Phase 2.2 scope, no `AWS::Budgets::Budget` resource is created in this template. A $5/month budget (50%, 80%, 100% alerts) must be configured in the AWS Console before any Phase 2.3/deployment step.
4. **CDK Bootstrap S3 Staging Note:**
   - When `cdk bootstrap` is eventually authorized in a future deployment phase, CDK creates a `CDKToolkit` stack with a small staging S3 bucket; keep artifacts pruned and delete `CDKToolkit` during full teardown.
