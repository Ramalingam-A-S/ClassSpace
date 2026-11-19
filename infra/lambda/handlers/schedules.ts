import {
  createRestrictionSchema,
  deleteScheduleQuerySchema,
  listSchedulesQuerySchema,
  upsertTimetableSchema,
} from '../schemas/schedule.schema';
import { ScheduleService } from '../services/schedule.service';
import type { RepositoryContext } from '../repositories/interfaces/repository-context';
import { notFoundError } from '../shared/api-error';
import { createdResponse, successResponse } from '../shared/api-response';
import type { ApiGatewayHttpV2Event, ApiGatewayHttpV2Result } from '../shared/api-types';
import { withApiHandler } from '../shared/middleware';
import { getRuntimeRepositoryContext } from '../shared/runtime-context';
import { parseJsonBody, parseQueryParams } from '../shared/validation';

function getMethodAndPath(event: ApiGatewayHttpV2Event): { method: string; path: string } {
  const method = (event.requestContext?.http?.method ?? 'GET').toUpperCase();
  const path = event.rawPath ?? event.requestContext?.http?.path ?? '/';
  return { method, path };
}

export function createSchedulesHandler(
  getRepos: () => RepositoryContext = getRuntimeRepositoryContext,
): (event: ApiGatewayHttpV2Event) => Promise<ApiGatewayHttpV2Result> {
  const upsertTimetableHandler = withApiHandler(
    { policy: 'ADMIN_GROUP_REQUIRED', expectedScope: 'classspace/admin' },
    async (event, context) => {
      const body = parseJsonBody(event, upsertTimetableSchema);
      const service = new ScheduleService(getRepos());
      const entry = await service.upsertTimetableEntry(body);
      context.logger.info('Timetable upserted', {
        scheduleId: entry.scheduleId,
        roomId: entry.roomId,
        date: entry.date,
      });
      return successResponse({ schedule: entry }, context.requestId);
    },
  );

  const createRestrictionHandler = withApiHandler(
    { policy: 'ADMIN_GROUP_REQUIRED', expectedScope: 'classspace/admin' },
    async (event, context) => {
      const body = parseJsonBody(event, createRestrictionSchema);
      const service = new ScheduleService(getRepos());
      const restriction = await service.createRestriction(body);
      context.logger.info('Restriction created', {
        scheduleId: restriction.scheduleId,
        roomId: restriction.roomId,
        date: restriction.date,
      });
      return createdResponse({ schedule: restriction }, context.requestId);
    },
  );

  const listSchedulesHandler = withApiHandler(
    { policy: 'ADMIN_GROUP_REQUIRED', expectedScope: 'classspace/admin' },
    async (event, context) => {
      const query = parseQueryParams(event, listSchedulesQuerySchema);
      const service = new ScheduleService(getRepos());
      const items = await service.listSchedules(query);
      return successResponse({ items }, context.requestId);
    },
  );

  const deleteScheduleHandler = withApiHandler(
    { policy: 'ADMIN_GROUP_REQUIRED', expectedScope: 'classspace/admin' },
    async (event, context) => {
      const query = parseQueryParams(event, deleteScheduleQuerySchema);
      const service = new ScheduleService(getRepos());
      await service.deleteScheduleEntry(query);
      context.logger.info('Schedule deleted', {
        scheduleId: query.scheduleId,
        recordType: query.recordType,
        roomId: query.roomId,
        date: query.date,
      });
      return successResponse({ deleted: true, scheduleId: query.scheduleId }, context.requestId);
    },
  );

  const unknownRouteHandler = withApiHandler(
    { policy: 'ADMIN_GROUP_REQUIRED', expectedScope: 'classspace/admin' },
    async () => {
      throw notFoundError('Route not found.');
    },
  );

  return async (event: ApiGatewayHttpV2Event): Promise<ApiGatewayHttpV2Result> => {
    const routeKey = event.routeKey ?? event.requestContext?.routeKey;
    const { method, path } = getMethodAndPath(event);

    if (routeKey === 'PUT /admin/timetable' || (method === 'PUT' && path === '/admin/timetable')) {
      return upsertTimetableHandler(event);
    }
    if (
      routeKey === 'POST /admin/restrictions' ||
      (method === 'POST' && path === '/admin/restrictions')
    ) {
      return createRestrictionHandler(event);
    }
    if (
      routeKey === 'GET /admin/schedules' ||
      (method === 'GET' && path === '/admin/schedules')
    ) {
      return listSchedulesHandler(event);
    }
    if (
      routeKey === 'DELETE /admin/schedules' ||
      (method === 'DELETE' && path === '/admin/schedules')
    ) {
      return deleteScheduleHandler(event);
    }

    return unknownRouteHandler(event);
  };
}

export const handler = createSchedulesHandler();
