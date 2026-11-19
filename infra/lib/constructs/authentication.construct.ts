import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';
import type { ClassSpaceEnvironmentConfig } from '../../config/development';

export interface AuthenticationConstructProps {
  readonly config: ClassSpaceEnvironmentConfig;
}

export interface ClassSpaceOAuthScopes {
  readonly read: string;
  readonly bookingsWrite: string;
  readonly admin: string;
}

export class AuthenticationConstruct extends Construct {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolDomain: cognito.UserPoolDomain;
  public readonly resourceServer: cognito.UserPoolResourceServer;
  public readonly bookingsResourceServer: cognito.UserPoolResourceServer;
  public readonly userPoolClient: cognito.UserPoolClient;
  public readonly studentGroup: cognito.CfnUserPoolGroup;
  public readonly adminGroup: cognito.CfnUserPoolGroup;
  public readonly issuerUrl: string;
  public readonly cognitoDomainPrefix: string;
  public readonly cognitoDomainBaseUrl: string;
  public readonly scopes: ClassSpaceOAuthScopes;

  constructor(scope: Construct, id: string, props: AuthenticationConstructProps) {
    super(scope, id);

    const { config } = props;

    this.userPool = new cognito.UserPool(this, 'ClassSpaceUserPool', {
      userPoolName: config.userPoolName,
      // Lite tier avoids Plus tier and paid advanced threat protection add-ons;
      // supports classic Hosted UI, OAuth2 Code+PKCE, and SOFTWARE_TOKEN_MFA.
      featurePlan: cognito.FeaturePlan.LITE,
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: {
        email: { required: true, mutable: true },
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      // SMS MFA disabled to prevent SNS SMS charges; optional TOTP app MFA available
      mfa: cognito.Mfa.OPTIONAL,
      mfaSecondFactor: {
        sms: false,
        otp: true,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // AWS-managed Cognito prefix domain in ap-south-1 (no custom domain, no ACM cert, no Route 53).
    // Deployment-time global uniqueness in ap-south-1 must still be verified on first deploy.
    this.cognitoDomainPrefix = config.cognitoDomainPrefix;
    this.userPoolDomain = this.userPool.addDomain('ClassSpaceCognitoDomain', {
      cognitoDomain: {
        domainPrefix: config.cognitoDomainPrefix,
      },
    });
    this.cognitoDomainBaseUrl = this.userPoolDomain.baseUrl();

    // Cognito Resource Server(s) defining ClassSpace API custom OAuth scopes.
    // Note: Cognito CloudFormation forbids '/' inside ScopeName (pattern ^[\x21\x23-\x2E\x30-\x5B\x5D-\x7E]+$),
    // while allowing '/' inside ResourceServer Identifier (pattern ^[\x21\x23-\x5B\x5D-\x7E]+$).
    // Using identifier "classspace" (read, admin) and "classspace/bookings" (write)
    // yields valid CloudFormation with exact OAuth scope strings:
    //   classspace/read, classspace/bookings/write, classspace/admin.
    const readScope = new cognito.ResourceServerScope({
      scopeName: 'read',
      scopeDescription: 'Read campus classrooms, schedules, availability, and own bookings',
    });
    const adminScope = new cognito.ResourceServerScope({
      scopeName: 'admin',
      scopeDescription: 'Perform administrator classroom, timetable, restriction, and booking actions',
    });
    const bookingsWriteScope = new cognito.ResourceServerScope({
      scopeName: 'write',
      scopeDescription: 'Submit student classroom booking requests',
    });

    this.resourceServer = this.userPool.addResourceServer('ClassSpaceResourceServer', {
      identifier: 'classspace',
      userPoolResourceServerName: 'ClassSpace API Resource Server',
      scopes: [readScope, adminScope],
    });

    this.bookingsResourceServer = this.userPool.addResourceServer(
      'ClassSpaceBookingsResourceServer',
      {
        identifier: 'classspace/bookings',
        userPoolResourceServerName: 'ClassSpace Bookings Resource Server',
        scopes: [bookingsWriteScope],
      },
    );

    const readOAuthScope = cognito.OAuthScope.resourceServer(this.resourceServer, readScope);
    const bookingsWriteOAuthScope = cognito.OAuthScope.resourceServer(
      this.bookingsResourceServer,
      bookingsWriteScope,
    );
    const adminOAuthScope = cognito.OAuthScope.resourceServer(this.resourceServer, adminScope);

    this.scopes = {
      read: readOAuthScope.scopeName,
      bookingsWrite: bookingsWriteOAuthScope.scopeName,
      admin: adminOAuthScope.scopeName,
    };

    // Groups: student and admin (no public admin registration or self-promotion)
    this.studentGroup = new cognito.CfnUserPoolGroup(this, 'StudentGroup', {
      userPoolId: this.userPool.userPoolId,
      groupName: 'student',
      description: 'Standard student discovery and booking request group',
      precedence: 10,
    });

    this.adminGroup = new cognito.CfnUserPoolGroup(this, 'AdminGroup', {
      userPoolId: this.userPool.userPoolId,
      groupName: 'admin',
      description: 'Administrator room, timetable, restriction, and booking approval group',
      precedence: 1,
    });

    // Public SPA Application Client (no client secret, Authorization Code + PKCE S256)
    this.userPoolClient = new cognito.UserPoolClient(this, 'ClassSpaceWebSpaClient', {
      userPool: this.userPool,
      userPoolClientName: 'classspace-dev-web-spa',
      generateSecret: false,
      authFlows: {
        userSrp: true,
        userPassword: false,
        adminUserPassword: false,
        custom: false,
      },
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
          implicitCodeGrant: false,
          clientCredentials: false,
        },
        scopes: [
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.PROFILE,
          readOAuthScope,
          bookingsWriteOAuthScope,
          adminOAuthScope,
        ],
        callbackUrls: [config.devCallbackUrl, config.futureAmplifyCallbackPlaceholder],
        logoutUrls: [config.devLogoutUrl, config.futureAmplifyLogoutPlaceholder],
      },
      preventUserExistenceErrors: true,
      enableTokenRevocation: true,
      accessTokenValidity: cdk.Duration.minutes(60),
      idTokenValidity: cdk.Duration.minutes(60),
      refreshTokenValidity: cdk.Duration.days(7),
    });

    // Ensure UserPoolResourceServers are provisioned before UserPoolClient references their scopes
    this.userPoolClient.node.addDependency(this.resourceServer);
    this.userPoolClient.node.addDependency(this.bookingsResourceServer);

    const stack = cdk.Stack.of(this);
    this.issuerUrl = `https://cognito-idp.${stack.region}.amazonaws.com/${this.userPool.userPoolId}`;
  }
}
