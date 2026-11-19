import { successResponse } from '../shared/api-response';
import type { ApiGatewayHttpV2Event, ApiGatewayHttpV2Result } from '../shared/api-types';
import { withApiHandler } from '../shared/middleware';

export interface HealthResponseData {
  readonly status: 'ok';
  readonly service: string;
  readonly timezone: string;
  readonly timestamp: string;
}

/**
 * Minimal, lightweight Phase 2.3.1 health handler.
 * Returns standardized success envelope without revealing secrets, account IDs,
 * credentials, or internal architecture details, and makes zero AWS service calls.
 */
export const handler: (event: ApiGatewayHttpV2Event) => Promise<ApiGatewayHttpV2Result> =
  withApiHandler({ policy: 'PUBLIC_HEALTH' }, async (_event, context) => {
    context.logger.info('Health check invoked');

    const data: HealthResponseData = {
      status: 'ok',
      service: 'classspace-dev-api',
      timezone: process.env.CAMPUS_TIMEZONE ?? 'Asia/Kolkata',
      timestamp: new Date().toISOString(),
    };

    return successResponse(data, context.requestId);
  });
