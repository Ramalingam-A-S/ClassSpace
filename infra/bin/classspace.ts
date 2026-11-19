#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { DEVELOPMENT_CONFIG } from '../config/development';
import { ClassSpaceFrontendStack } from '../lib/classspace-frontend-stack';
import { ClassSpaceStack } from '../lib/classspace-stack';

const app = new cdk.App();

// Target region configured for the user's AWS project with account unresolved for
// credential-free local CloudFormation synthesis.
new ClassSpaceStack(app, DEVELOPMENT_CONFIG.stackName, {
  config: DEVELOPMENT_CONFIG,
  env: {
    region: DEVELOPMENT_CONFIG.region,
  },
  description:
    'ClassSpace Phase 2.2 Development Infrastructure Foundation (DynamoDB, Cognito, HTTP API, Lambda, CloudWatch)',
});

new ClassSpaceFrontendStack(app, 'ClassSpaceFrontendStack', {
  config: DEVELOPMENT_CONFIG,
  env: {
    region: DEVELOPMENT_CONFIG.region,
  },
  description:
    'ClassSpace Public Frontend Hosting Stack (Private S3 + CloudFront OAC + SPA Routing)',
});
