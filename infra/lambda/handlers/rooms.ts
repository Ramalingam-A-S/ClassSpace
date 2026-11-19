import {
  adminRoomPathParamsSchema,
  createRoomSchema,
  listRoomsQuerySchema,
  roomDetailsQuerySchema,
  roomPathParamsSchema,
  updateRoomSchema,
} from '../schemas/room.schema';
import { RoomService } from '../services/room.service';
import type { RepositoryContext } from '../repositories/interfaces/repository-context';
import { notFoundError } from '../shared/api-error';
import { createdResponse, successResponse } from '../shared/api-response';
import type { ApiGatewayHttpV2Event, ApiGatewayHttpV2Result } from '../shared/api-types';
import { withApiHandler } from '../shared/middleware';
import { getRuntimeRepositoryContext } from '../shared/runtime-context';
import { parseJsonBody, parsePathParams, parseQueryParams } from '../shared/validation';

function getMethodAndPath(event: ApiGatewayHttpV2Event): { method: string; path: string } {
  const method = (event.requestContext?.http?.method ?? 'GET').toUpperCase();
  const path = event.rawPath ?? event.requestContext?.http?.path ?? '/';
  return { method, path };
}

export function createRoomsHandler(
  getRepos: () => RepositoryContext = getRuntimeRepositoryContext,
): (event: ApiGatewayHttpV2Event) => Promise<ApiGatewayHttpV2Result> {
  const listRoomsHandler = withApiHandler(
    { policy: 'AUTHENTICATED_USER', expectedScope: 'classspace/read' },
    async (event, context) => {
      const query = parseQueryParams(event, listRoomsQuerySchema);
      const service = new RoomService(getRepos());
      const result = await service.listRooms(query);
      return successResponse(result, context.requestId);
    },
  );

  const getRoomDetailsHandler = withApiHandler(
    { policy: 'AUTHENTICATED_USER', expectedScope: 'classspace/read' },
    async (event, context) => {
      const { roomId } = parsePathParams(event, roomPathParamsSchema);
      const query = parseQueryParams(event, roomDetailsQuerySchema);
      const service = new RoomService(getRepos());
      const result = await service.getRoomDetails(roomId, query.date);
      return successResponse(result, context.requestId);
    },
  );

  const createRoomHandler = withApiHandler(
    { policy: 'ADMIN_GROUP_REQUIRED', expectedScope: 'classspace/admin' },
    async (event, context) => {
      const body = parseJsonBody(event, createRoomSchema);
      const service = new RoomService(getRepos());
      const room = await service.createRoom(body);
      context.logger.info('Room created', { roomId: room.roomId });
      return createdResponse({ room }, context.requestId);
    },
  );

  const updateRoomHandler = withApiHandler(
    { policy: 'ADMIN_GROUP_REQUIRED', expectedScope: 'classspace/admin' },
    async (event, context) => {
      const { id } = parsePathParams(event, adminRoomPathParamsSchema);
      const body = parseJsonBody(event, updateRoomSchema);
      const service = new RoomService(getRepos());
      const room = await service.updateRoom(id, body);
      context.logger.info('Room updated', { roomId: room.roomId });
      return successResponse({ room }, context.requestId);
    },
  );

  const unknownRouteHandler = withApiHandler(
    { policy: 'AUTHENTICATED_USER' },
    async () => {
      throw notFoundError('Route not found.');
    },
  );

  return async (event: ApiGatewayHttpV2Event): Promise<ApiGatewayHttpV2Result> => {
    const routeKey = event.routeKey ?? event.requestContext?.routeKey;
    const { method, path } = getMethodAndPath(event);

    if (routeKey === 'GET /rooms' || (method === 'GET' && path === '/rooms')) {
      return listRoomsHandler(event);
    }
    if (
      routeKey === 'GET /rooms/{roomId}' ||
      (method === 'GET' && /^\/rooms\/[^/]+$/.test(path) && path !== '/rooms/available')
    ) {
      return getRoomDetailsHandler(event);
    }
    if (routeKey === 'POST /admin/rooms' || (method === 'POST' && path === '/admin/rooms')) {
      return createRoomHandler(event);
    }
    if (
      routeKey === 'PATCH /admin/rooms/{id}' ||
      (method === 'PATCH' && /^\/admin\/rooms\/[^/]+$/.test(path))
    ) {
      return updateRoomHandler(event);
    }

    return unknownRouteHandler(event);
  };
}

export const handler = createRoomsHandler();
