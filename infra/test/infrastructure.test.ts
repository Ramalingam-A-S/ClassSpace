import * as fs from 'fs';
import * as path from 'path';
import { Match } from 'aws-cdk-lib/assertions';
import { synthesizeTestTemplate } from './test-helper';

describe('ClassSpace Infrastructure Template Tests', () => {
  const template = synthesizeTestTemplate();

  test('1. Exactly four DynamoDB tables are defined', () => {
    template.resourceCountIs('AWS::DynamoDB::Table', 4);
  });

  test('2. Each table has the correct partition and sort keys', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      TableName: 'ClassSpaceRooms',
      KeySchema: [{ AttributeName: 'roomId', KeyType: 'HASH' }],
    });

    template.hasResourceProperties('AWS::DynamoDB::Table', {
      TableName: 'ClassSpaceSchedules',
      KeySchema: [
        { AttributeName: 'roomDateKey', KeyType: 'HASH' },
        { AttributeName: 'scheduleKey', KeyType: 'RANGE' },
      ],
    });

    template.hasResourceProperties('AWS::DynamoDB::Table', {
      TableName: 'ClassSpaceBookings',
      KeySchema: [{ AttributeName: 'bookingId', KeyType: 'HASH' }],
    });

    template.hasResourceProperties('AWS::DynamoDB::Table', {
      TableName: 'ClassSpaceSlotLocks',
      KeySchema: [{ AttributeName: 'lockKey', KeyType: 'HASH' }],
    });
  });

  test('4. The required GSIs exist across ClassSpaceRooms and ClassSpaceBookings', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      TableName: 'ClassSpaceRooms',
      GlobalSecondaryIndexes: Match.arrayWith([
        Match.objectLike({
          IndexName: 'GSI_BlockFloor',
          KeySchema: [
            { AttributeName: 'blockId', KeyType: 'HASH' },
            { AttributeName: 'floorRoomKey', KeyType: 'RANGE' },
          ],
        }),
      ]),
    });

    template.hasResourceProperties('AWS::DynamoDB::Table', {
      TableName: 'ClassSpaceBookings',
      GlobalSecondaryIndexes: Match.arrayWith([
        Match.objectLike({
          IndexName: 'GSI_StudentBookings',
          KeySchema: [
            { AttributeName: 'studentId', KeyType: 'HASH' },
            { AttributeName: 'createdAt', KeyType: 'RANGE' },
          ],
        }),
        Match.objectLike({
          IndexName: 'GSI_RoomDateBookings',
          KeySchema: [
            { AttributeName: 'roomDateKey', KeyType: 'HASH' },
            { AttributeName: 'statusStartKey', KeyType: 'RANGE' },
          ],
        }),
      ]),
    });
  });

  test('12-16. Modular domain Lambdas use Node.js 22.x, ARM64, <=256 MB, <=10s timeout, and no VPC', () => {
    template.resourceCountIs('AWS::Lambda::Function', 4);
    for (const suffix of ['rooms', 'availability', 'bookings', 'schedules']) {
      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: `classspace-dev-api-${suffix}`,
        Runtime: 'nodejs22.x',
        Architectures: ['arm64'],
        MemorySize: 256,
        Timeout: 10,
        VpcConfig: Match.absent(),
      });
    }
  });

  test('18 & 20. API Gateway is HTTP API with all 10 planned routes and stage throttling', () => {
    template.resourceCountIs('AWS::ApiGatewayV2::Api', 1);
    template.resourceCountIs('AWS::ApiGateway::RestApi', 0);

    template.hasResourceProperties('AWS::ApiGatewayV2::Api', {
      Name: 'classspace-dev-http-api',
      ProtocolType: 'HTTP',
    });

    template.hasResourceProperties('AWS::ApiGatewayV2::Stage', {
      StageName: '$default',
      DefaultRouteSettings: {
        ThrottlingRateLimit: 10,
        ThrottlingBurstLimit: 20,
      },
    });

    const expectedRoutes = [
      'GET /rooms',
      'GET /rooms/available',
      'GET /rooms/{roomId}',
      'POST /bookings',
      'GET /bookings/me',
      'GET /bookings/{id}',
      'PATCH /bookings/{id}/cancel',
      'PATCH /admin/bookings/{id}',
      'GET /admin/bookings',
      'POST /admin/rooms',
      'PATCH /admin/rooms/{id}',
      'PUT /admin/timetable',
      'POST /admin/restrictions',
      'GET /admin/schedules',
      'DELETE /admin/schedules',
    ];

    for (const routeKey of expectedRoutes) {
      template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
        RouteKey: routeKey,
      });
    }
  });

  test('28. Four-table architecture and time-first scheduleKey are documented accurately', () => {
    const docPath = path.resolve(__dirname, '../../docs/DYNAMODB_ARCHITECTURE.md');
    const doc = fs.readFileSync(docPath, 'utf8');

    expect(doc).toContain('ClassSpaceRooms');
    expect(doc).toContain('ClassSpaceSchedules');
    expect(doc).toContain('ClassSpaceBookings');
    expect(doc).toContain('ClassSpaceSlotLocks');
    expect(doc).toContain('<startTime>#TT#<scheduleId>');
    expect(doc).toContain('<startTime>#RES#<restrictionId>');
  });

  test('30. TTL is disabled on ClassSpaceSlotLocks until formal expiry proof exists', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      TableName: 'ClassSpaceSlotLocks',
      TimeToLiveSpecification: Match.absent(),
    });
  });

  test('Fix A. Cognito prefix domain exists without custom domain, ACM cert, or Route 53 resources', () => {
    template.resourceCountIs('AWS::Cognito::UserPoolDomain', 1);
    template.hasResourceProperties('AWS::Cognito::UserPoolDomain', {
      Domain: 'classspace-dev-auth',
      CustomDomainConfig: Match.absent(),
      UserPoolId: {
        Ref: Match.stringLikeRegexp('^AuthenticationClassSpaceUserPool'),
      },
    });

    template.resourceCountIs('AWS::CertificateManager::Certificate', 0);
    template.resourceCountIs('AWS::Route53::HostedZone', 0);
    template.resourceCountIs('AWS::Route53::RecordSet', 0);
  });
});
