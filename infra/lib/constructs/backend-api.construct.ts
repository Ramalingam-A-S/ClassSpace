import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpJwtAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import type * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import type { ClassSpaceEnvironmentConfig } from '../../config/development';
import type { AuthenticationConstruct } from './authentication.construct';
import type { DatabaseConstruct } from './database.construct';
import type { DomainLogGroups } from './monitoring.construct';

export interface BackendApiConstructProps {
  readonly config: ClassSpaceEnvironmentConfig;
  readonly database: DatabaseConstruct;
  readonly authentication: AuthenticationConstruct;
  readonly domainLogGroups: DomainLogGroups;
}

type DomainHandlerKey = 'rooms' | 'availability' | 'bookings' | 'schedules';

interface DomainRouteDefinition {
  readonly method: apigwv2.HttpMethod;
  readonly path: string;
  readonly scopeKey: 'read' | 'bookingsWrite' | 'admin';
  readonly handlerKey: DomainHandlerKey;
}

const API_ROUTES: readonly DomainRouteDefinition[] = [
  { method: apigwv2.HttpMethod.GET, path: '/rooms', scopeKey: 'read', handlerKey: 'rooms' },
  {
    method: apigwv2.HttpMethod.GET,
    path: '/rooms/available',
    scopeKey: 'read',
    handlerKey: 'availability',
  },
  { method: apigwv2.HttpMethod.GET, path: '/rooms/{roomId}', scopeKey: 'read', handlerKey: 'rooms' },
  { method: apigwv2.HttpMethod.GET, path: '/bookings/me', scopeKey: 'read', handlerKey: 'bookings' },
  {
    method: apigwv2.HttpMethod.GET,
    path: '/bookings/{id}',
    scopeKey: 'read',
    handlerKey: 'bookings',
  },
  {
    method: apigwv2.HttpMethod.POST,
    path: '/bookings',
    scopeKey: 'bookingsWrite',
    handlerKey: 'bookings',
  },
  {
    method: apigwv2.HttpMethod.PATCH,
    path: '/bookings/{id}/cancel',
    scopeKey: 'bookingsWrite',
    handlerKey: 'bookings',
  },
  // Admin routes: API Gateway enforces authenticated JWT + classspace/admin scope;
  // Lambda handlers MUST ALSO enforce cognito:groups includes exact "admin" via requireAdmin().
  {
    method: apigwv2.HttpMethod.PATCH,
    path: '/admin/bookings/{id}',
    scopeKey: 'admin',
    handlerKey: 'bookings',
  },
  {
    method: apigwv2.HttpMethod.GET,
    path: '/admin/bookings',
    scopeKey: 'admin',
    handlerKey: 'bookings',
  },
  { method: apigwv2.HttpMethod.POST, path: '/admin/rooms', scopeKey: 'admin', handlerKey: 'rooms' },
  {
    method: apigwv2.HttpMethod.PATCH,
    path: '/admin/rooms/{id}',
    scopeKey: 'admin',
    handlerKey: 'rooms',
  },
  {
    method: apigwv2.HttpMethod.PUT,
    path: '/admin/timetable',
    scopeKey: 'admin',
    handlerKey: 'schedules',
  },
  {
    method: apigwv2.HttpMethod.POST,
    path: '/admin/restrictions',
    scopeKey: 'admin',
    handlerKey: 'schedules',
  },
  {
    method: apigwv2.HttpMethod.GET,
    path: '/admin/schedules',
    scopeKey: 'admin',
    handlerKey: 'schedules',
  },
  {
    method: apigwv2.HttpMethod.DELETE,
    path: '/admin/schedules',
    scopeKey: 'admin',
    handlerKey: 'schedules',
  },
];

export class BackendApiConstruct extends Construct {
  public readonly domainRoles: Record<DomainHandlerKey, iam.Role>;
  public readonly domainLambdas: Record<DomainHandlerKey, NodejsFunction>;
  public readonly httpApi: apigwv2.HttpApi;
  public readonly jwtAuthorizer: HttpJwtAuthorizer;

  constructor(scope: Construct, id: string, props: BackendApiConstructProps) {
    super(scope, id);

    const { config, database, authentication, domainLogGroups } = props;

    const sharedEnvironment = {
      CAMPUS_TIMEZONE: config.campusTimezone,
      ROOMS_TABLE_NAME: database.roomsTable.tableName,
      SCHEDULES_TABLE_NAME: database.schedulesTable.tableName,
      BOOKINGS_TABLE_NAME: database.bookingsTable.tableName,
      SLOT_LOCKS_TABLE_NAME: database.slotLocksTable.tableName,
      LOG_LEVEL: 'INFO',
    };

    const createDomainRole = (
      roleId: string,
      roleName: string,
      description: string,
      logGroup: logs.LogGroup,
    ): iam.Role => {
      const role = new iam.Role(this, roleId, {
        roleName,
        assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
        description,
      });

      role.addToPolicy(
        new iam.PolicyStatement({
          sid: 'WriteToDedicatedLambdaLogGroup',
          effect: iam.Effect.ALLOW,
          actions: ['logs:CreateLogStream', 'logs:PutLogEvents'],
          resources: [logGroup.logGroupArn, `${logGroup.logGroupArn}:*`],
        }),
      );

      return role;
    };

    const roomsRole = createDomainRole(
      'RoomsLambdaExecutionRole',
      'classspace-dev-rooms-lambda-role',
      'Least-privilege execution role for ClassSpace Rooms Lambda',
      domainLogGroups.rooms,
    );
    roomsRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'RoomsTableReadWrite',
        effect: iam.Effect.ALLOW,
        actions: ['dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:UpdateItem'],
        resources: [database.roomsTable.tableArn],
      }),
    );
    roomsRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'RoomsDomainQueryRead',
        effect: iam.Effect.ALLOW,
        actions: ['dynamodb:Query'],
        resources: [
          `${database.roomsTable.tableArn}/index/GSI_BlockFloor`,
          database.schedulesTable.tableArn,
          `${database.bookingsTable.tableArn}/index/GSI_RoomDateBookings`,
        ],
      }),
    );

    const availabilityRole = createDomainRole(
      'AvailabilityLambdaExecutionRole',
      'classspace-dev-availability-lambda-role',
      'Least-privilege execution role for ClassSpace Availability Lambda',
      domainLogGroups.availability,
    );
    availabilityRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'AvailabilityQueryRead',
        effect: iam.Effect.ALLOW,
        actions: ['dynamodb:Query'],
        resources: [
          `${database.roomsTable.tableArn}/index/GSI_BlockFloor`,
          database.schedulesTable.tableArn,
          `${database.bookingsTable.tableArn}/index/GSI_RoomDateBookings`,
        ],
      }),
    );
    availabilityRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'AvailabilitySlotLocksRead',
        effect: iam.Effect.ALLOW,
        actions: ['dynamodb:GetItem', 'dynamodb:BatchGetItem'],
        resources: [database.slotLocksTable.tableArn],
      }),
    );

    const bookingsRole = createDomainRole(
      'BookingsLambdaExecutionRole',
      'classspace-dev-bookings-lambda-role',
      'Least-privilege execution role for ClassSpace Bookings Lambda',
      domainLogGroups.bookings,
    );
    bookingsRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'RoomsTableReadAndConditionCheck',
        effect: iam.Effect.ALLOW,
        actions: ['dynamodb:GetItem', 'dynamodb:ConditionCheckItem'],
        resources: [database.roomsTable.tableArn],
      }),
    );
    bookingsRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'BookingsTableReadWrite',
        effect: iam.Effect.ALLOW,
        actions: ['dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:UpdateItem'],
        resources: [database.bookingsTable.tableArn],
      }),
    );
    bookingsRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'BookingsGsiQueryOnly',
        effect: iam.Effect.ALLOW,
        actions: ['dynamodb:Query'],
        resources: [
          `${database.roomsTable.tableArn}/index/GSI_BlockFloor`,
          `${database.bookingsTable.tableArn}/index/GSI_StudentBookings`,
          `${database.bookingsTable.tableArn}/index/GSI_RoomDateBookings`,
        ],
      }),
    );
    bookingsRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'BookingsSlotLocksClaimAndRelease',
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

    const schedulesRole = createDomainRole(
      'SchedulesLambdaExecutionRole',
      'classspace-dev-schedules-lambda-role',
      'Least-privilege execution role for ClassSpace Schedules Lambda',
      domainLogGroups.schedules,
    );
    schedulesRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'SchedulesRoomsRead',
        effect: iam.Effect.ALLOW,
        actions: ['dynamodb:GetItem'],
        resources: [database.roomsTable.tableArn],
      }),
    );
    schedulesRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'SchedulesRoomBlockGsiQuery',
        effect: iam.Effect.ALLOW,
        actions: ['dynamodb:Query'],
        resources: [`${database.roomsTable.tableArn}/index/GSI_BlockFloor`],
      }),
    );
    schedulesRole.addToPolicy(
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
    schedulesRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'SchedulesSlotLocksClaimAndRelease',
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

    this.domainRoles = {
      rooms: roomsRole,
      availability: availabilityRole,
      bookings: bookingsRole,
      schedules: schedulesRole,
    };

    const createDomainLambda = (
      constructId: string,
      domainSuffix: DomainHandlerKey,
      entryFile: string,
      role: iam.Role,
      logGroup: logs.LogGroup,
    ): NodejsFunction =>
      new NodejsFunction(this, constructId, {
        functionName: `${config.lambdaFunctionName}-${domainSuffix}`,
        runtime: lambda.Runtime.NODEJS_22_X,
        architecture: lambda.Architecture.ARM_64,
        memorySize: config.lambdaMemoryMb,
        timeout: cdk.Duration.seconds(config.lambdaTimeoutSeconds),
        role,
        logGroup,
        entry: path.resolve(__dirname, `../../lambda/handlers/${entryFile}`),
        handler: 'handler',
        bundling: {
          forceDockerBundling: false,
          minify: true,
          sourceMap: false,
          target: 'node22',
        },
        environment: sharedEnvironment,
      });

    this.domainLambdas = {
      rooms: createDomainLambda(
        'RoomsLambda',
        'rooms',
        'rooms.ts',
        roomsRole,
        domainLogGroups.rooms,
      ),
      availability: createDomainLambda(
        'AvailabilityLambda',
        'availability',
        'availability.ts',
        availabilityRole,
        domainLogGroups.availability,
      ),
      bookings: createDomainLambda(
        'BookingsLambda',
        'bookings',
        'bookings.ts',
        bookingsRole,
        domainLogGroups.bookings,
      ),
      schedules: createDomainLambda(
        'SchedulesLambda',
        'schedules',
        'schedules.ts',
        schedulesRole,
        domainLogGroups.schedules,
      ),
    };

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
          apigwv2.CorsHttpMethod.DELETE,
          apigwv2.CorsHttpMethod.OPTIONS,
        ],
        allowHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key'],
        maxAge: cdk.Duration.hours(1),
      },
    });

    const integrations: Record<DomainHandlerKey, HttpLambdaIntegration> = {
      rooms: new HttpLambdaIntegration('RoomsIntegration', this.domainLambdas.rooms),
      availability: new HttpLambdaIntegration(
        'AvailabilityIntegration',
        this.domainLambdas.availability,
      ),
      bookings: new HttpLambdaIntegration('BookingsIntegration', this.domainLambdas.bookings),
      schedules: new HttpLambdaIntegration('SchedulesIntegration', this.domainLambdas.schedules),
    };

    for (const route of API_ROUTES) {
      this.httpApi.addRoutes({
        path: route.path,
        methods: [route.method],
        integration: integrations[route.handlerKey],
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
