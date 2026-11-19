#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { DEVELOPMENT_CONFIG } from '../config/development';
import { ClassSpaceStack } from '../lib/classspace-stack';

const app = new cdk.App();

// Target region ap-south-1 with account intentionally unresolved for local,
// credential-free CloudFormation synthesis.
new ClassSpaceStack(app, DEVELOPMENT_CONFIG.stackName, {
  config: DEVELOPMENT_CONFIG,
  env: {
    region: DEVELOPMENT_CONFIG.region,
  },
  description:
    'ClassSpace Phase 2.2 Development Infrastructure Foundation (DynamoDB, Cognito, HTTP API, Lambda, CloudWatch)',
});
