export interface ClassSpaceEnvironmentConfig {
  readonly projectName: string;
  readonly environmentName: string;
  readonly ownerTag: string;
  readonly region: string;
  readonly stackName: string;
  readonly campusTimezone: string;
  readonly userPoolName: string;
  readonly cognitoDomainPrefix: string;
  readonly apiName: string;
  readonly lambdaFunctionName: string;
  readonly lambdaMemoryMb: number;
  readonly lambdaTimeoutSeconds: number;
  readonly logRetentionDays: 7;
  readonly throttlingRateLimit: number;
  readonly throttlingBurstLimit: number;
  readonly devCallbackUrl: string;
  readonly devLogoutUrl: string;
  readonly futureAmplifyCallbackPlaceholder: string;
  readonly futureAmplifyLogoutPlaceholder: string;
}

export const DEVELOPMENT_CONFIG: ClassSpaceEnvironmentConfig = {
  projectName: 'ClassSpace',
  environmentName: 'Development',
  ownerTag: 'StudentProject',
  region: 'ap-southeast-2',
  stackName: 'ClassSpaceDevelopmentStack',
  campusTimezone: 'Asia/Kolkata',
  userPoolName: 'classspace-dev-users',
  // Deterministic development prefix; global availability in ap-south-1 must be
  // verified at deployment time (never guaranteed by local CDK synthesis).
  cognitoDomainPrefix: 'classspace-dev-auth',
  apiName: 'classspace-dev-http-api',
  lambdaFunctionName: 'classspace-dev-api',
  lambdaMemoryMb: 256,
  lambdaTimeoutSeconds: 10,
  logRetentionDays: 7,
  throttlingRateLimit: 10,
  throttlingBurstLimit: 20,
  devCallbackUrl: 'http://localhost:5173/auth/callback',
  devLogoutUrl: 'http://localhost:5173/',
  futureAmplifyCallbackPlaceholder: 'https://PLACEHOLDER-AMPLIFY-DOMAIN.amplifyapp.com/auth/callback',
  futureAmplifyLogoutPlaceholder: 'https://PLACEHOLDER-AMPLIFY-DOMAIN.amplifyapp.com/',
};
