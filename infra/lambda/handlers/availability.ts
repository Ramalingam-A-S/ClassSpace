import { availabilityQuerySchema } from '../schemas/room.schema';
import { AvailabilityService } from '../services/availability.service';
import type { RepositoryContext } from '../repositories/interfaces/repository-context';
import { successResponse } from '../shared/api-response';
import type { ApiGatewayHttpV2Event, ApiGatewayHttpV2Result } from '../shared/api-types';
import { withApiHandler } from '../shared/middleware';
import { getRuntimeRepositoryContext } from '../shared/runtime-context';
import { parseQueryParams } from '../shared/validation';

export function createAvailabilityHandler(
  getRepos: () => RepositoryContext = getRuntimeRepositoryContext,
): (event: ApiGatewayHttpV2Event) => Promise<ApiGatewayHttpV2Result> {
  return withApiHandler(
    { policy: 'AUTHENTICATED_USER', expectedScope: 'classspace/read' },
    async (event, context) => {
      const query = parseQueryParams(event, availabilityQuerySchema);
      const service = new AvailabilityService(getRepos());
      const result = await service.searchAvailability(query);
      context.logger.info('Availability evaluated', {
        date: query.date,
        candidateCount: result.roomResults.length,
        availableCount: result.availableRooms.length,
      });
      return successResponse(result, context.requestId);
    },
  );
}

export const handler = createAvailabilityHandler();
