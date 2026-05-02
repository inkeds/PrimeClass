import type { FastifyReply, FastifyRequest } from 'fastify';

type ErrorPayload = {
  httpStatus: number;
  code: number;
  message: string;
  data?: unknown;
};

export function sendOk(
  request: FastifyRequest,
  reply: FastifyReply,
  data: unknown,
  message = 'ok',
) {
  return reply.code(200).send({
    code: 0,
    message,
    data,
    request_id: request.id,
  });
}

export function sendList(
  request: FastifyRequest,
  reply: FastifyReply,
  list: unknown[],
  page = 1,
  pageSize = 20,
  total = 0,
) {
  return sendOk(request, reply, {
    list,
    pagination: {
      page,
      page_size: pageSize,
      total,
    },
  });
}

export function sendTodo(request: FastifyRequest, reply: FastifyReply, resourceName: string) {
  return reply.code(501).send({
    code: 50001,
    message: `${resourceName} not implemented yet`,
    data: null,
    request_id: request.id,
  });
}

export function sendError(request: FastifyRequest, reply: FastifyReply, payload: ErrorPayload) {
  return reply.code(payload.httpStatus).send({
    code: payload.code,
    message: payload.message,
    data: payload.data ?? null,
    request_id: request.id,
  });
}
