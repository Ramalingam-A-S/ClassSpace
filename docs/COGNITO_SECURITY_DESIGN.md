# ClassSpace — Amazon Cognito Security Blueprint

**Phase Status:** Architecture & security design only. **No Cognito User Pool has been created.**  
**Target Region:** `ap-south-1` (Asia Pacific – Mumbai)

---

## 1. Core Security Principles

1. **No Fake Authentication in Production:** Phase 1's client-side `DemoRoleProvider` (`Student Demo` / `Admin Demo` switcher) is strictly a Phase 1 UI demonstration mechanism. In Phase 2, authentication and authorization are enforced by Amazon Cognito + API Gateway HTTP API + AWS Lambda.
2. **Never Trust Frontend Identity or Role Claims:**
   - The backend must **never** accept `studentId` or `role` from the request body or query string for authorization decisions.
   - `studentId` is extracted exclusively from the verified Cognito JWT `sub` claim inside the Lambda execution context.
3. **No Direct Browser-to-DynamoDB Access:**
   - Do **not** configure a Cognito Identity Pool to issue temporary AWS IAM credentials to the browser.
   - All data access flows exclusively through API Gateway HTTP API -> Lambda -> DynamoDB.
4. **No Secrets in Vite Frontend Environment Variables:**
   - All `VITE_*` variables are bundled into public client JavaScript. Only public Cognito identifiers (`VITE_COGNITO_USER_POOL_ID`, `VITE_COGNITO_CLIENT_ID`, `VITE_COGNITO_DOMAIN`, `VITE_API_BASE_URL`) may exist in frontend configuration.
   - **Never** use a Cognito App Client with a Client Secret for the React SPA.

---

## 2. Cognito User Pool Configuration

- **Pool Name:** `classspace-dev-users`
- **Tier:** **Lite** or **Essentials** (verify cost differences; **do not** enable Plus tier or Advanced Security / Threat Protection add-ons in Development).
- **Sign-In Identifier:** Email address (`email` verified).
- **Self-Registration:**
  - Allowed for students only (optionally restricted in future via Pre Sign-Up Lambda trigger to approved institutional email domains such as `@college.edu` if desired).
  - Newly registered users have **no** `admin` group membership by default (or are assigned to the `student` group via Post-Confirmation trigger / default treatment).
- **Groups:**
  - `student`: Standard campus student permissions (`GET /rooms*`, `POST /bookings`, `GET /bookings/me`).
  - `admin`: Campus timetable & room administrator permissions (all `/admin/*` endpoints).
  - **Self-promotion prevention:** Users cannot modify their own `cognito:groups` claim. Only privileged AWS administrators via IAM (`cognito-idp:AdminAddUserToGroup`) may add users to `admin`.
- **MFA Policy:**
  - Optional TOTP authenticator app MFA for `admin` accounts recommended.
  - **SMS MFA disabled** to prevent per-SMS Amazon SNS charges.

---

## 3. OAuth 2.0 / OIDC Flow (Authorization Code + PKCE)

- **Flow:** Authorization Code Grant with **PKCE (`S256`)** (never Implicit Grant).
- **App Client (`classspace-web-spa`):**
  - Public client (`GenerateSecret: false`).
  - Allowed OAuth Flows: `code` only.
  - Allowed OAuth Scopes: `openid`, `email`, `profile`.
  - Callback URLs: `http://localhost:5173/auth/callback` (local dev) and `https://<amplify-domain>/auth/callback` (deployed dev).
  - Logout URLs: `http://localhost:5173/` and `https://<amplify-domain>/`.

---

## 4. API Gateway & Lambda Authorization Enforcement

### API Gateway HTTP API JWT Authorizer
- Configured directly on the HTTP API (`apigatewayv2`) pointing to Cognito Issuer:
  `https://cognito-idp.ap-south-1.amazonaws.com/<USER_POOL_ID>`
- Audience validated against `classspace-web-spa` Client ID.
- Unauthenticated or expired/invalid JWTs are rejected at the API Gateway edge (`401 Unauthorized`) before invoking Lambda—saving Lambda execution cost.

### Route-Level Enforcement in Lambda (Defense-in-Depth)
Even behind the API Gateway JWT authorizer, every Lambda handler reads `event.requestContext.authorizer.jwt.claims`:

| Endpoint Group | Required Verified Claims | Server-Side Identity Rules |
| :--- | :--- | :--- |
| `GET /rooms`, `GET /rooms/available`, `GET /rooms/{roomId}` | Valid JWT (`student` or `admin` group; or authenticated campus user) | Read-only campus schedule discovery |
| `POST /bookings` | Valid JWT | `booking.studentId = claims.sub`; `booking.studentName = claims.name ?? claims.email` |
| `GET /bookings/me` | Valid JWT | Queries `GSI_StudentBookings` strictly with `PK = claims.sub` |
| `PATCH /admin/bookings/{id}`, `POST /admin/rooms`, `PATCH /admin/rooms/{id}`, `PUT /admin/timetable`, `POST /admin/restrictions` | Valid JWT **AND** `cognito:groups` includes `'admin'` | Returns `403 Forbidden` if `'admin'` is absent from `cognito:groups` |

> Note: Student cancellation of their own pending booking (if exposed via `PATCH /bookings/{id}/cancel`) must verify `existingBooking.studentId === claims.sub`.

---

## 5. Token Lifecycle, Storage & Secure Logout

- **Token Lifetimes:**
  - Access Token & ID Token: **60 minutes** (short-lived).
  - Refresh Token: **7 days** (or 1–7 days for student project convenience) with Cognito refresh token revocation enabled.
- **Browser Storage Strategy:**
  - Prefer in-memory React state for access/ID tokens paired with standard OIDC PKCE client libraries (`oidc-client-ts` or Amplify Auth), avoiding long-lived plaintext token persistence where unnecessary; if session storage is used for reload continuity, rely on strict Content Security Policy (CSP) and XSS-safe React rendering (zero `dangerouslySetInnerHTML`).
- **Secure Logout:**
  1. Clear in-memory / session token state in the browser.
  2. Call Cognito `/oauth2/revoke` (where applicable) or redirect to Cognito Hosted UI `/logout?client_id=...&logout_uri=...` to invalidate the Cognito session cookie.
  3. Reset frontend role/UI state back to unauthenticated landing view.

---

## 6. Account Recovery & Admin Provisioning

- **Password Recovery:** Self-service email verification code via Cognito Forgot Password flow (`email` delivery using Cognito default email for small dev volume, or SES if scaling).
- **Admin Account Provisioning:**
  1. Administrator creates their account or is created via AWS Console / CLI (`admin-create-user`).
  2. Account owner enables TOTP MFA.
  3. Account owner is explicitly added to the `admin` Cognito group (`admin-add-user-to-group`) by the AWS account administrator.
  4. **Never** create a public `/signup-admin` endpoint or auto-elevate based on email suffix alone without explicit admin approval.
