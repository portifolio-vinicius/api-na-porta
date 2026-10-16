import { randomUUID } from 'node:crypto';
import { Catch, HttpException } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { Request, Response } from 'express';

interface ErrorEnvelope {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly details: readonly string[];
    readonly requestId: string;
  };
}

@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();
    const status = exception instanceof HttpException ? exception.getStatus() : 500;
    const requestId = getRequestId(request.header('x-request-id'));
    const errorResponse = exception instanceof HttpException ? exception.getResponse() : undefined;
    const details = status < 500 ? extractDetails(errorResponse) : [];
    const message = status >= 500 ? 'Erro interno' : extractMessage(errorResponse, status);

    const body: ErrorEnvelope = {
      error: {
        code: errorCode(status),
        message,
        details,
        requestId,
      },
    };
    if (status >= 500) {
      const errorType = exception instanceof Error ? exception.constructor.name : 'UnknownError';
      process.stderr.write(`${JSON.stringify({
        level: 'error',
        event: 'http_error',
        requestId,
        method: request.method,
        route: request.route?.path ?? 'unmatched',
        status,
        errorType,
      })}\n`);
    }
    response.setHeader('X-Request-ID', requestId);
    response.status(status).json(body);
  }
}

function getRequestId(candidate: string | undefined): string {
  return candidate && /^[a-f0-9-]{1,64}$/i.test(candidate) ? candidate : randomUUID();
}

function extractMessage(response: string | object | undefined, status: number): string {
  if (typeof response === 'string') {
    return response;
  }
  if (response && 'message' in response && typeof response.message === 'string') {
    return response.message;
  }
  if (status === 401) {
    return 'Não autenticado';
  }
  if (status === 403) {
    return 'Acesso negado';
  }
  if (status === 404) {
    return 'Recurso não encontrado';
  }
  if (status === 409) {
    return 'Conflito de dados';
  }
  if (status === 429) {
    return 'Muitas solicitações';
  }
  return 'Dados inválidos';
}

function extractDetails(response: string | object | undefined): readonly string[] {
  if (!response || typeof response !== 'object' || !('message' in response)) {
    return [];
  }
  const messages = response.message;
  if (Array.isArray(messages)) {
    return messages.filter((message): message is string => typeof message === 'string');
  }
  return [];
}

function errorCode(status: number): string {
  switch (status) {
    case 400:
      return 'VALIDATION_ERROR';
    case 401:
      return 'AUTHENTICATION_ERROR';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'CONFLICT';
    case 429:
      return 'RATE_LIMITED';
    default:
      return status >= 500 ? 'INTERNAL_ERROR' : 'HTTP_ERROR';
  }
}
