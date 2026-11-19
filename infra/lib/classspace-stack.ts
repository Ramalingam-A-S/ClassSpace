import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import type { ClassSpaceEnvironmentConfig } from '../config/development';
import { AuthenticationConstruct } from './constructs/authentication.construct';
import { BackendApiConstruct } from './constructs/backend-api.construct';
import { DatabaseConstruct } from './constructs/database.construct';
import { MonitoringConstruct } from './constructs/monitoring.construct';

export interface ClassSpaceStackProps extends cdk.StackProps {
  readonly config: ClassSpaceEnvironmentConfig;
}

export class ClassSpaceStack extends cdk.Stack {
  public readonly database: DatabaseConstruct;
  public readonly authentication: AuthenticationConstruct;
  public readonly monitoring: MonitoringConstruct;
  public readonly backendApi: BackendApiConstruct;

  constructor(scope: Construct, id: string, props: ClassSpaceStackProps) {
    super(scope, id, props);

    const { config } = props;

    this.database = new DatabaseConstruct(this, 'Database');
    this.authentication = new AuthenticationConstruct(this, 'Authentication', { config });
    this.monitoring = new MonitoringConstruct(this, 'Monitoring', { config });
    this.backendApi = new BackendApiConstruct(this, 'BackendApi', {
      config,
      database: this.database,
      authentication: this.authentication,
      lambdaLogGroup: this.monitoring.lambdaLogGroup,
    });

    // Apply standard resource tags across all taggable resources in the stack
    cdk.Tags.of(this).add('Project', config.projectName);
    cdk.Tags.of(this).add('Environment', config.environmentName);
    cdk.Tags.of(this).add('Owner', config.ownerTag);

    new cdk.CfnOutput(this, 'HttpApiEndpoint', {
      value: this.backendApi.httpApi.apiEndpoint,
      description: 'ClassSpace API Gateway HTTP API endpoint (Development)',
    });

    new cdk.CfnOutput(this, 'CognitoUserPoolId', {
      value: this.authentication.userPool.userPoolId,
      description: 'ClassSpace Cognito User Pool ID (public identifier)',
    });

    new cdk.CfnOutput(this, 'CognitoSpaClientId', {
      value: this.authentication.userPoolClient.userPoolClientId,
      description: 'ClassSpace public SPA Cognito Client ID (no secret)',
    });

    new cdk.CfnOutput(this, 'CognitoDomainPrefix', {
      value: this.authentication.cognitoDomainPrefix,
      description:
        'ClassSpace AWS-managed Cognito domain prefix (uniqueness must be verified at deploy time)',
    });

    new cdk.CfnOutput(this, 'CognitoDomainBaseUrl', {
      value: this.authentication.cognitoDomainBaseUrl,
      description: 'ClassSpace Cognito Hosted UI base URL in ap-south-1',
    });
  }
}
