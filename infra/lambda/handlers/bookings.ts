import {
  adminListBookingsQuerySchema,
  bookingPathParamsSchema,
  createBookingSchema,
  listBookingsQuerySchema,
  updateBookingStatusSchema,
} from '../schemas/booking.schema';
import { BookingService } from '../services/booking.service';
import type { RepositoryContext } from '../repositories/interfaces/repository-context';
import { notFoundError, validationError } from '../shared/api-error';
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

function getHeaderCaseInsensitive(
  headers: Record<string, string | undefined> | undefined,
  headerName: string,
): string | undefined {
  if (!headers) return undefined;
  const target = headerName.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === target && value !== undefined) {
      return value;
    }
  }
  return undefined;
}

function getOptionalStudentName(event: ApiGatewayHttpV2Event): string | undefined {
  const claims = event.requestContext?.authorizer?.jwt?.claims;
  if (!claims || typeof claims !== 'object') return undefined;
  const candidate = claims['name'] ?? claims['cognito:username'] ?? claims['username'];
  return typeof candidate === 'string' && candidate.trim().length > 0
    ? candidate.trim()
    : undefined;
}

export function createBookingsHandler(
  getRepos: () => RepositoryContext = getRuntimeRepositoryContext,
): (event: ApiGatewayHttpV2Event) => Promise<ApiGatewayHttpV2Result> {
  const createBookingHandler = withApiHandler(
    { policy: 'AUTHENTICATED_USER', expectedScope: 'classspace/bookings/write' },
    async (event, context) => {
      if (!context.caller) {
        throw new Error('Missing authenticated caller context.');
      }
      const body = parseJsonBody(event, createBookingSchema);
      const idempotencyKey = getHeaderCaseInsensitive(event.headers, 'idempotency-key');
      const studentName = getOptionalStudentName(event);

      const service = new BookingService(getRepos());
      const result = await service.createBooking(
        context.caller.userId,
        body,
        idempotencyKey,
        studentName,
      );

      context.logger.info('Booking processed', {
        bookingId: result.booking.bookingId,
        idempotentReplay: result.idempotentReplay,
        status: result.booking.status,
      });

      if (result.idempotentReplay) {
        return successResponse(result.booking, context.requestId, 200);
      }
      return createdResponse(result.booking, context.requestId);
    },
  );

  const listMyBookingsHandler = withApiHandler(
    { policy: 'AUTHENTICATED_USER', expectedScope: 'classspace/read' },
    async (event, context) => {
      if (!context.caller) {
        throw new Error('Missing authenticated caller context.');
      }
      const query = parseQueryParams(event, listBookingsQuerySchema);
      const service = new BookingService(getRepos());
      const result = await service.listMyBookings(context.caller.userId, query);
      return successResponse(result, context.requestId);
    },
  );

  const getBookingByIdHandler = withApiHandler(
    { policy: 'AUTHENTICATED_USER', expectedScope: 'classspace/read' },
    async (event, context) => {
      if (!context.caller) {
        throw new Error('Missing authenticated caller context.');
      }
      const { id } = parsePathParams(event, bookingPathParamsSchema);
      const service = new BookingService(getRepos());
      const booking = await service.getBookingById(context.caller, id);
      return successResponse(booking, context.requestId);
    },
  );

  const cancelBookingHandler = withApiHandler(
    { policy: 'AUTHENTICATED_USER', expectedScope: 'classspace/bookings/write' },
    async (event, context) => {
      if (!context.caller) {
        throw new Error('Missing authenticated caller context.');
      }
      const { id } = parsePathParams(event, bookingPathParamsSchema);
      const service = new BookingService(getRepos());
      const booking = await service.cancelBooking(context.caller, id);
      context.logger.info('Booking cancelled', { bookingId: booking.bookingId });
      return successResponse(booking, context.requestId);
    },
  );

  const adminUpdateBookingStatusHandler = withApiHandler(
    { policy: 'ADMIN_GROUP_REQUIRED', expectedScope: 'classspace/admin' },
    async (event, context) => {
      if (!context.caller) {
        throw new Error('Missing authenticated admin context.');
      }
      const { id } = parsePathParams(event, bookingPathParamsSchema);
      const body = parseJsonBody(event, updateBookingStatusSchema);
      const service = new BookingService(getRepos());

      let updated;
      if (body.status === 'APPROVED') {
        updated = await service.approveBooking(id);
      } else if (body.status === 'REJECTED') {
        updated = await service.rejectBooking(id);
      } else if (body.status === 'CANCELLED') {
        updated = await service.cancelBooking(context.caller, id);
      } else {
        throw validationError('Unsupported booking status transition.');
      }

      context.logger.info('Admin booking status updated', {
        bookingId: updated.bookingId,
        status: updated.status,
      });
      return successResponse(updated, context.requestId);
    },
  );

  const adminListBookingsHandler = withApiHandler(
    { policy: 'ADMIN_GROUP_REQUIRED', expectedScope: 'classspace/admin' },
    async (event, context) => {
      const query = parseQueryParams(event, adminListBookingsQuerySchema);
      const service = new BookingService(getRepos());
      const result = await service.listAdminBookings(query);
      return successResponse(result, context.requestId);
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

    if (routeKey === 'POST /bookings' || (method === 'POST' && path === '/bookings')) {
      return createBookingHandler(event);
    }
    if (routeKey === 'GET /bookings/me' || (method === 'GET' && path === '/bookings/me')) {
      return listMyBookingsHandler(event);
    }
    if (
      routeKey === 'PATCH /bookings/{id}/cancel' ||
      (method === 'PATCH' && /^\/bookings\/[^/]+\/cancel$/.test(path))
    ) {
      return cancelBookingHandler(event);
    }
    if (
      routeKey === 'GET /bookings/{id}' ||
      (method === 'GET' && /^\/bookings\/[^/]+$/.test(path) && path !== '/bookings/me')
    ) {
      return getBookingByIdHandler(event);
    }
    if (
      routeKey === 'PATCH /admin/bookings/{id}' ||
      (method === 'PATCH' && /^\/admin\/bookings\/[^/]+$/.test(path))
    ) {
      return adminUpdateBookingStatusHandler(event);
    }
    if (
      routeKey === 'GET /admin/bookings' ||
      (method === 'GET' && path === '/admin/bookings')
    ) {
      return adminListBookingsHandler(event);
    }

    return unknownRouteHandler(event);
  };
}

export const handler = createBookingsHandler();
