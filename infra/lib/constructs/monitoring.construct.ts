import * as cdk from 'aws-cdk-lib';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import type { ClassSpaceEnvironmentConfig } from '../../config/development';

export interface MonitoringConstructProps {
  readonly config: ClassSpaceEnvironmentConfig;
}

export interface DomainLogGroups {
  readonly rooms: logs.LogGroup;
  readonly availability: logs.LogGroup;
  readonly bookings: logs.LogGroup;
  readonly schedules: logs.LogGroup;
}

export class MonitoringConstruct extends Construct {
  public readonly lambdaLogGroup: logs.LogGroup;
  public readonly domainLogGroups: DomainLogGroups;

  constructor(scope: Construct, id: string, props: MonitoringConstructProps) {
    super(scope, id);

    const createDomainLogGroup = (constructId: string, domainSuffix: string): logs.LogGroup =>
      new logs.LogGroup(this, constructId, {
        logGroupName: `/aws/lambda/${props.config.lambdaFunctionName}-${domainSuffix}`,
        retention: logs.RetentionDays.ONE_WEEK,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      });

    // Dedicated CloudWatch LogGroups with explicit 7-day retention and no custom KMS keys
    this.domainLogGroups = {
      rooms: createDomainLogGroup('RoomsLambdaLogGroup', 'rooms'),
      availability: createDomainLogGroup('AvailabilityLambdaLogGroup', 'availability'),
      bookings: createDomainLogGroup('BookingsLambdaLogGroup', 'bookings'),
      schedules: createDomainLogGroup('SchedulesLambdaLogGroup', 'schedules'),
    };

    this.lambdaLogGroup = this.domainLogGroups.rooms;
  }
}
