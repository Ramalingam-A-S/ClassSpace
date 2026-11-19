import * as cdk from 'aws-cdk-lib';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import type { ClassSpaceEnvironmentConfig } from '../../config/development';

export interface MonitoringConstructProps {
  readonly config: ClassSpaceEnvironmentConfig;
}

export class MonitoringConstruct extends Construct {
  public readonly lambdaLogGroup: logs.LogGroup;

  constructor(scope: Construct, id: string, props: MonitoringConstructProps) {
    super(scope, id);

    // Dedicated CloudWatch LogGroup with explicit 7-day retention and no custom KMS key
    this.lambdaLogGroup = new logs.LogGroup(this, 'ApiLambdaLogGroup', {
      logGroupName: `/aws/lambda/${props.config.lambdaFunctionName}`,
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
  }
}
