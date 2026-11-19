import * as fs from 'fs';
import * as path from 'path';
import { synthesizeTestTemplate } from './test-helper';

function resolveScopeExpression(
  scopeEntry: unknown,
  resourceServerIdToIdentifier: Map<string, string>,
): string {
  if (typeof scopeEntry === 'string') {
    return scopeEntry;
  }
  if (scopeEntry && typeof scopeEntry === 'object' && 'Fn::Join' in scopeEntry) {
    const joinArgs = (scopeEntry as { 'Fn::Join': [string, unknown[]] })['Fn::Join'];
    const sep = joinArgs[0];
    const parts = joinArgs[1].map((part) => {
      if (typeof part === 'string') return part;
      if (part && typeof part === 'object' && 'Ref' in part) {
        const refId = (part as { Ref: string }).Ref;
        return resourceServerIdToIdentifier.get(refId) ?? refId;
      }
      return String(part);
    });
    return parts.join(sep);
  }
  throw new Error(`Unexpected scope entry format: ${JSON.stringify(scopeEntry)}`);
}

describe('ClassSpace Security Guardrail Tests', () => {
  const template = synthesizeTestTemplate();

  const resourceServers = template.findResources('AWS::Cognito::UserPoolResourceServer');
  const resourceServerIdToIdentifier = new Map<string, string>();
  for (const [logicalId, resource] of Object.entries(resourceServers)) {
    const props = resource.Properties as { Identifier: string };
    resourceServerIdToIdentifier.set(logicalId, props.Identifier);
  }

  test('9. Cognito public SPA client generates no client secret, keeps PKCE-compatible Code flow, allows custom scopes, and blocks implicit flow', () => {
    const clients = template.findResources('AWS::Cognito::UserPoolClient');
    const clientProps = Object.values(clients)[0]?.Properties as {
      ClientName?: string;
      GenerateSecret?: boolean;
      AllowedOAuthFlows?: string[];
      AllowedOAuthFlowsUserPoolClient?: boolean;
      AllowedOAuthScopes?: unknown[];
      CallbackURLs?: string[];
    };

    expect(clientProps.ClientName).toBe('classspace-dev-web-spa');
    expect(clientProps.GenerateSecret).toBe(false);
    expect(clientProps.AllowedOAuthFlows).toEqual(['code']);
    expect(clientProps.AllowedOAuthFlowsUserPoolClient).toBe(true);
    expect(clientProps.CallbackURLs).toEqual([
      'http://localhost:5173/auth/callback',
      'https://PLACEHOLDER-AMPLIFY-DOMAIN.amplifyapp.com/auth/callback',
    ]);

    const resolvedScopes = (clientProps.AllowedOAuthScopes ?? []).map((s) =>
      resolveScopeExpression(s, resourceServerIdToIdentifier),
    );
    expect(resolvedScopes).toEqual([
      'openid',
      'email',
      'profile',
      'classspace/read',
      'classspace/bookings/write',
      'classspace/admin',
    ]);
  });

  test('Phase 2.2.2. Cognito resource server(s) exist with all three custom scopes', () => {
    const allDefinedScopes: string[] = [];
    for (const resource of Object.values(resourceServers)) {
      const props = resource.Properties as {
        Identifier: string;
        Scopes?: Array<{ ScopeName: string }>;
      };
      for (const s of props.Scopes ?? []) {
        allDefinedScopes.push(`${props.Identifier}/${s.ScopeName}`);
      }
    }

    expect(allDefinedScopes.sort()).toEqual([
      'classspace/admin',
      'classspace/bookings/write',
      'classspace/read',
    ]);
  });

  test('10. Student and admin Cognito groups exist', () => {
    template.hasResourceProperties('AWS::Cognito::UserPoolGroup', {
      GroupName: 'student',
    });
    template.hasResourceProperties('AWS::Cognito::UserPoolGroup', {
      GroupName: 'admin',
    });
  });

  test('11 & Fix D. Cognito uses LITE tier, optional TOTP MFA, no SMS MFA, and no paid security add-ons', () => {
    const userPools = template.findResources('AWS::Cognito::UserPool');
    const poolProps = Object.values(userPools)[0]?.Properties as
      | {
          UserPoolTier?: string;
          EnabledMfas?: string[];
          MfaConfiguration?: string;
          SmsConfiguration?: unknown;
          UserPoolAddOns?: unknown;
          AccountRecoverySetting?: { RecoveryMechanisms?: Array<{ Name: string }> };
        }
      | undefined;

    expect(poolProps).toBeDefined();
    expect(poolProps?.UserPoolTier).toBe('LITE');
    expect(poolProps?.MfaConfiguration).toBe('OPTIONAL');
    expect(poolProps?.EnabledMfas).toEqual(['SOFTWARE_TOKEN_MFA']);
    expect(poolProps?.EnabledMfas ?? []).not.toContain('SMS_MFA');
    expect(poolProps?.SmsConfiguration).toBeUndefined();
    expect(poolProps?.UserPoolAddOns).toBeUndefined();
    expect(
      poolProps?.AccountRecoverySetting?.RecoveryMechanisms?.map((m) => m.Name),
    ).toEqual(['verified_email']);
  });

  test('19 & Phase 2.2.2. HTTP API JWT authorization and exact OAuth scopes are enforced on all 10 routes', () => {
    template.resourceCountIs('AWS::ApiGatewayV2::Authorizer', 1);
    template.hasResourceProperties('AWS::ApiGatewayV2::Authorizer', {
      AuthorizerType: 'JWT',
      IdentitySource: ['$request.header.Authorization'],
    });

    const expectedRouteScopes: Record<string, string[]> = {
      'GET /rooms': ['classspace/read'],
      'GET /rooms/available': ['classspace/read'],
      'GET /rooms/{roomId}': ['classspace/read'],
      'GET /bookings/me': ['classspace/read'],
      'POST /bookings': ['classspace/bookings/write'],
      'PATCH /admin/bookings/{id}': ['classspace/admin'],
      'POST /admin/rooms': ['classspace/admin'],
      'PATCH /admin/rooms/{id}': ['classspace/admin'],
      'PUT /admin/timetable': ['classspace/admin'],
      'POST /admin/restrictions': ['classspace/admin'],
    };

    const routes = template.findResources('AWS::ApiGatewayV2::Route');
    expect(Object.keys(routes)).toHaveLength(10);

    const observedRouteKeys: string[] = [];
    for (const route of Object.values(routes)) {
      const props = route.Properties as {
        RouteKey?: string;
        AuthorizationType?: string;
        AuthorizerId?: unknown;
        AuthorizationScopes?: string[];
      };

      expect(props.RouteKey).toBeDefined();
      const routeKey = props.RouteKey!;
      observedRouteKeys.push(routeKey);

      expect(props.AuthorizationType).toBe('JWT');
      expect(props.AuthorizerId).toBeDefined();
      const resolvedRouteScopes = (props.AuthorizationScopes ?? []).map((s) =>
        resolveScopeExpression(s, resourceServerIdToIdentifier),
      );
      expect(resolvedRouteScopes.length).toBeGreaterThan(0);
      expect(resolvedRouteScopes).toEqual(expectedRouteScopes[routeKey]);
    }

    expect(observedRouteKeys.sort()).toEqual(Object.keys(expectedRouteScopes).sort());
  });

  test('Phase 2.2.2. Security review documents Lambda-side admin-group enforcement for admin routes', () => {
    const reviewPath = path.resolve(__dirname, '../SECURITY_REVIEW.md');
    const review = fs.readFileSync(reviewPath, 'utf8');
    expect(review).toContain('requireAdmin');
    expect(review).toContain('cognito:groups');
    expect(review).toContain('classspace/admin');
  });

  test('25 & Fix B. Least-privilege IAM excludes dynamodb:Scan, wildcards, Cognito/IAM admin perms, and scopes ConditionCheckItem to Rooms only', () => {
    const roles = template.findResources('AWS::IAM::Role');
    for (const role of Object.values(roles)) {
      const managed = (role.Properties as { ManagedPolicyArns?: unknown[] }).ManagedPolicyArns ?? [];
      const serialized = JSON.stringify(managed);
      expect(serialized).not.toContain('AdministratorAccess');
      expect(serialized).not.toContain('AmazonDynamoDBFullAccess');
      expect(serialized).not.toContain('IAMFullAccess');
    }

    const policies = template.findResources('AWS::IAM::Policy');
    const allActions: string[] = [];
    const statementsBySid = new Map<
      string,
      { actions: string[]; resources: unknown[] }
    >();

    for (const policy of Object.values(policies)) {
      const statements = (
        policy.Properties as {
          PolicyDocument: {
            Statement: Array<{
              Sid?: string;
              Action: string | string[];
              Resource: unknown;
            }>;
          };
        }
      ).PolicyDocument.Statement;

      for (const stmt of statements) {
        const actions = Array.isArray(stmt.Action) ? stmt.Action : [stmt.Action];
        const resources = Array.isArray(stmt.Resource) ? stmt.Resource : [stmt.Resource];
        allActions.push(...actions);

        expect(actions).not.toContain('*');
        expect(actions).not.toContain('dynamodb:*');
        expect(actions).not.toContain('dynamodb:Scan');
        expect(actions.some((a) => a.startsWith('cognito-idp:'))).toBe(false);
        expect(actions.some((a) => a.startsWith('iam:'))).toBe(false);
        expect(resources).not.toContain('*');

        if (stmt.Sid) {
          statementsBySid.set(stmt.Sid, { actions, resources });
        }
      }
    }

    // Verify required transactional & query actions remain present where needed
    expect(allActions).toEqual(
      expect.arrayContaining([
        'dynamodb:Query',
        'dynamodb:GetItem',
        'dynamodb:BatchGetItem',
        'dynamodb:PutItem',
        'dynamodb:UpdateItem',
        'dynamodb:DeleteItem',
        'dynamodb:ConditionCheckItem',
      ]),
    );

    // Verify ConditionCheckItem is retained ONLY on ClassSpaceRooms
    const conditionCheckSids = [...statementsBySid.entries()]
      .filter(([, value]) => value.actions.includes('dynamodb:ConditionCheckItem'))
      .map(([sid]) => sid);
    expect(conditionCheckSids).toEqual(['RoomsTableReadWriteAndConditionCheck']);

    // Verify GSI access is Query-only
    expect(statementsBySid.get('ScopedGsiQueryOnlyAccess')?.actions).toEqual(['dynamodb:Query']);
  });

  test('27. No secrets are embedded in frontend .env.example or Lambda environment config', () => {
    const envExamplePath = path.resolve(__dirname, '../../.env.example');
    const envExample = fs.readFileSync(envExamplePath, 'utf8');
    expect(envExample).not.toMatch(/AWS_SECRET_ACCESS_KEY|CLIENT_SECRET|PRIVATE_KEY/i);
    expect(envExample).toContain('PLACEHOLDER');

    const functions = template.findResources('AWS::Lambda::Function');
    for (const fn of Object.values(functions)) {
      const envVars =
        (fn.Properties as { Environment?: { Variables?: Record<string, unknown> } }).Environment
          ?.Variables ?? {};
      const keys = Object.keys(envVars).join(',');
      expect(keys).not.toMatch(/SECRET|PASSWORD|TOKEN|ACCESS_KEY/i);
    }
  });
});
