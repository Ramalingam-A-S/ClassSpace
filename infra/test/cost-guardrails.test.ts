import { Match } from 'aws-cdk-lib/assertions';
import { synthesizeTestTemplate } from './test-helper';

describe('ClassSpace Cost Guardrail Tests', () => {
  const template = synthesizeTestTemplate();

  test('5-8. DynamoDB tables use PAY_PER_REQUEST, Standard class, PITR disabled, Streams disabled, no Global Tables', () => {
    const tables = template.findResources('AWS::DynamoDB::Table');
    expect(Object.keys(tables)).toHaveLength(4);

    for (const table of Object.values(tables)) {
      const props = table.Properties as {
        BillingMode?: string;
        TableClass?: string;
        PointInTimeRecoverySpecification?: { PointInTimeRecoveryEnabled?: boolean };
        StreamSpecification?: unknown;
      };
      expect(props.BillingMode).toBe('PAY_PER_REQUEST');
      expect(props.TableClass).toBe('STANDARD');
      expect(props.PointInTimeRecoverySpecification?.PointInTimeRecoveryEnabled).toBe(false);
      expect(props.StreamSpecification).toBeUndefined();
    }

    template.resourceCountIs('AWS::DynamoDB::GlobalTable', 0);
  });

  test('17. Provisioned Lambda concurrency is absent', () => {
    const functions = template.findResources('AWS::Lambda::Function');
    for (const fn of Object.values(functions)) {
      const props = fn.Properties as { ReservedConcurrentExecutions?: unknown };
      expect(props.ReservedConcurrentExecutions).toBeUndefined();
    }
    template.resourceCountIs('AWS::Lambda::Alias', 0);
    template.resourceCountIs('AWS::Lambda::Version', 0);
  });

  test('21. CloudWatch log group retention is explicitly 7 days with no custom KMS key', () => {
    template.resourceCountIs('AWS::Logs::LogGroup', 4);
    for (const suffix of ['rooms', 'availability', 'bookings', 'schedules']) {
      template.hasResourceProperties('AWS::Logs::LogGroup', {
        LogGroupName: `/aws/lambda/classspace-dev-api-${suffix}`,
        RetentionInDays: 7,
        KmsKeyId: Match.absent(),
      });
    }
    template.resourceCountIs('AWS::KMS::Key', 0);
  });

  test('22-24. Zero NAT Gateways, EC2 instances, VPCs, RDS/Aurora, or unnecessary S3 buckets exist', () => {
    template.resourceCountIs('AWS::EC2::NatGateway', 0);
    template.resourceCountIs('AWS::EC2::Instance', 0);
    template.resourceCountIs('AWS::EC2::VPC', 0);
    template.resourceCountIs('AWS::RDS::DBInstance', 0);
    template.resourceCountIs('AWS::RDS::DBCluster', 0);
    template.resourceCountIs('AWS::S3::Bucket', 0);
    template.resourceCountIs('AWS::Budgets::Budget', 0);
  });

  test('26. Required resource tags (Project, Environment, Owner) are present on taggable resources', () => {
    const expectedTags = [
      { Key: 'Environment', Value: 'Development' },
      { Key: 'Owner', Value: 'StudentProject' },
      { Key: 'Project', Value: 'ClassSpace' },
    ];

    for (const tableName of [
      'ClassSpaceRooms',
      'ClassSpaceSchedules',
      'ClassSpaceBookings',
      'ClassSpaceSlotLocks',
    ]) {
      template.hasResourceProperties('AWS::DynamoDB::Table', {
        TableName: tableName,
        Tags: Match.arrayWith(expectedTags),
      });
    }

    for (const suffix of ['rooms', 'availability', 'bookings', 'schedules']) {
      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: `classspace-dev-api-${suffix}`,
        Tags: Match.arrayWith(expectedTags),
      });
    }

    template.hasResourceProperties('AWS::Cognito::UserPool', {
      UserPoolName: 'classspace-dev-users',
      UserPoolTags: {
        Environment: 'Development',
        Owner: 'StudentProject',
        Project: 'ClassSpace',
      },
    });
  });
});
