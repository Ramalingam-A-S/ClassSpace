import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { DEVELOPMENT_CONFIG } from '../config/development';
import { ClassSpaceStack } from '../lib/classspace-stack';

export function synthesizeTestTemplate(): Template {
  const app = new cdk.App();
  const stack = new ClassSpaceStack(app, DEVELOPMENT_CONFIG.stackName, {
    config: DEVELOPMENT_CONFIG,
    env: { region: DEVELOPMENT_CONFIG.region },
  });
  return Template.fromStack(stack);
}
