import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpJwtAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import type { ClassSpaceEnvironmentConfig } from '../../config/development';
import type { AuthenticationConstruct } from './authentication.construct';
import type { DatabaseConstruct } from './database.construct';

export interface BackendApiConstructProps {
  readonly config: ClassSpaceEnvironmentConfig;
  readonly database: DatabaseConstruct;
  readonly authentication: AuthenticationConstruct;
  readonly lambdaLogGroup: logs.LogGroup;
}

interface PlannedRoute {
  readonly method: apigwv2.HttpMethod;
  readonly path: string;
  readonly scopeKey: 'read' | 'bookingsWrite' | 'admin';
}

const PLANNED_ROUTES: readonly PlannedRoute[] = [
  { method: apigwv2.HttpMethod.GET, path: '/rooms', scopeKey: 'read' },
  { method: apigwv2.HttpMethod.GET, path: '/rooms/available', scopeKey: 'read' },
  { method: apigwv2.HttpMethod.GET, path: '/rooms/{roomId}', scopeKey: 'read' },
  { method: apigwv2.HttpMethod.GET, path: '/bookings/me', scopeKey: 'read' },
  { method: apigwv2.HttpMethod.POST, path: '/bookings', scopeKey: 'bookingsWrite' },
  // Admin routes: API Gateway enforces authenticated JWT + classspace/admin scope;
  // Lambda handlers MUST ALSO enforce cognito:groups includes exact "admin" via requireAdmin().
  { method: apigwv2.HttpMethod.PATCH, path: '/admin/bookings/{id}', scopeKey: 'admin' },
  { method: apigwv2.HttpMethod.POST, path: '/admin/rooms', scopeKey: 'admin' },
  { method: apigwv2.HttpMethod.PATCH, path: '/admin/rooms/{id}', scopeKey: 'admin' },
  { method: apigwv2.HttpMethod.PUT, path: '/admin/timetable', scopeKey: 'admin' },
  { method: apigwv2.HttpMethod.POST, path: '/admin/restrictions', scopeKey: 'admin' },
];

export class BackendApiConstruct extends Construct {
  public readonly executionRole: iam.Role;
  public readonly apiLambda: NodejsFunction;
  public readonly httpApi: apigwv2.HttpApi;
  public readonly jwtAuthorizer: HttpJwtAuthorizer;

  constructor(scope: Construct, id: string, props: BackendApiConstructProps) {
    super(scope, id);

    const { config, database, authentication, lambdaLogGroup } = props;

    // Least-privilege IAM execution role scoped strictly to the dedicated log group
    // and the 4 DynamoDB tables + 3 GSIs (no wildcards, no managed admin/full policies).
    this.executionRole = new iam.Role(this, 'ClassSpaceLambdaExecutionRole', {
      roleName: 'classspace-dev-api-lambda-role',
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description:
        'Least-privilege execution role for ClassSpace Phase 2.2 placeholder API Lambda',
    });

    this.executionRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'WriteToDedicatedLambdaLogGroup',
        effect: iam.Effect.ALLOW,
        actions: ['logs:CreateLogStream', 'logs:PutLogEvents'],
        resources: [lambdaLogGroup.logGroupArn, `${lambdaLogGroup.logGroupArn}:*`],
      }),
    );

    // Scoped per-table and per-GSI DynamoDB permissions.
    // - dynamodb:Scan is intentionally omitted (all lookups use PK, GSI Query, or BatchGetItem).
    // - dynamodb:ConditionCheckItem is retained ONLY on ClassSpaceRooms for transactional active checks.
    // - GSIs receive dynamodb:Query only.
    this.executionRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'RoomsTableReadWriteAndConditionCheck',
        effect: iam.Effect.ALLOW,
        actions: [
          'dynamodb:GetItem',
          'dynamodb:PutItem',
          'dynamodb:UpdateItem',
          'dynamodb:ConditionCheckItem',
        ],
        resources: [database.roomsTable.tableArn],
      }),
    );

    this.executionRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'SchedulesTableReadWrite',
        effect: iam.Effect.ALLOW,
        actions: [
          'dynamodb:GetItem',
          'dynamodb:Query',
          'dynamodb:PutItem',
          'dynamodb:UpdateItem',
          'dynamodb:DeleteItem',
        ],
        resources: [database.schedulesTable.tableArn],
      }),
    );

    this.executionRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'BookingsTableReadWrite',
        effect: iam.Effect.ALLOW,
        actions: [
          'dynamodb:GetItem',
          'dynamodb:PutItem',
          'dynamodb:UpdateItem',
        ],
        resources: [database.bookingsTable.tableArn],
      }),
    );

    this.executionRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'SlotLocksTableAtomicClaimAndRelease',
        effect: iam.Effect.ALLOW,
        actions: [
          'dynamodb:GetItem',
          'dynamodb:BatchGetItem',
          'dynamodb:PutItem',
          'dynamodb:DeleteItem',
        ],
        resources: [database.slotLocksTable.tableArn],
      }),
    );

    this.executionRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'ScopedGsiQueryOnlyAccess',
        effect: iam.Effect.ALLOW,
        actions: ['dynamodb:Query'],
        resources: [
          `${database.roomsTable.tableArn}/index/GSI_BlockFloor`,
          `${database.bookingsTable.tableArn}/index/GSI_StudentBookings`,
          `${database.bookingsTable.tableArn}/index/GSI_RoomDateBookings`,
        ],
      }),
    );

    this.apiLambda = new NodejsFunction(this, 'ClassSpaceApiLambda', {
      functionName: config.lambdaFunctionName,
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: config.lambdaMemoryMb,
      timeout: cdk.Duration.seconds(config.lambdaTimeoutSeconds),
      role: this.executionRole,
      logGroup: lambdaLogGroup,
      entry: path.resolve(__dirname, '../../lambda/health/index.ts'),
      handler: 'handler',
      bundling: {
        forceDockerBundling: false,
        minify: true,
        sourceMap: false,
        target: 'node22',
      },
      environment: {
        CAMPUS_TIMEZONE: config.campusTimezone,
        ROOMS_TABLE_NAME: database.roomsTable.tableName,
        SCHEDULES_TABLE_NAME: database.schedulesTable.tableName,
        BOOKINGS_TABLE_NAME: database.bookingsTable.tableName,
        SLOT_LOCKS_TABLE_NAME: database.slotLocksTable.tableName,
        LOG_LEVEL: 'INFO',
      },
    });

    this.jwtAuthorizer = new HttpJwtAuthorizer(
      'CognitoJwtAuthorizer',
      authentication.issuerUrl,
      {
        jwtAudience: [authentication.userPoolClient.userPoolClientId],
      },
    );

    this.httpApi = new apigwv2.HttpApi(this, 'ClassSpaceHttpApi', {
      apiName: config.apiName,
      defaultAuthorizer: this.jwtAuthorizer,
      corsPreflight: {
        allowOrigins: [
          'http://localhost:5173',
          'https://PLACEHOLDER-AMPLIFY-DOMAIN.amplifyapp.com',
        ],
        allowMethods: [
          apigwv2.CorsHttpMethod.GET,
          apigwv2.CorsHttpMethod.POST,
          apigwv2.CorsHttpMethod.PUT,
          apigwv2.CorsHttpMethod.PATCH,
          apigwv2.CorsHttpMethod.OPTIONS,
        ],
        allowHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key'],
        maxAge: cdk.Duration.hours(1),
      },
    });

    const integration = new HttpLambdaIntegration('ClassSpacePlaceholderIntegration', this.apiLambda);

    for (const route of PLANNED_ROUTES) {
      this.httpApi.addRoutes({
        path: route.path,
        methods: [route.method],
        integration,
        authorizer: this.jwtAuthorizer,
        authorizationScopes: [authentication.scopes[route.scopeKey]],
      });
    }

    // Apply API Gateway HTTP API stage throttling (10 req/s steady rate, 20 burst)
    const defaultStage = this.httpApi.defaultStage?.node.defaultChild as
      | apigwv2.CfnStage
      | undefined;

    if (defaultStage) {
      defaultStage.defaultRouteSettings = {
        throttlingRateLimit: config.throttlingRateLimit,
        throttlingBurstLimit: config.throttlingBurstLimit,
      };
    }
  }
}
