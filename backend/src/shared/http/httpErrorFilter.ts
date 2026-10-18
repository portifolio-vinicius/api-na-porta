import { randomUUID } from 'node:crypto';
import { Catch, HttpException } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { Request, Response } from 'express';

import { Messages } from './messages.js';

@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();
    const parserType = exception && typeof exception === 'object' && 'type' in exception ? exception.type : undefined;
    const status = exception instanceof HttpException ? exception.getStatus() : parserType === 'entity.parse.failed' ? 400 : parserType === 'entity.too.large' ? 413 : 500;
    const existingId: unknown = response.locals.requestId;
    const requestId = typeof existingId === 'string' ? existingId : getRequestId(request.header('x-request-id'));
    const errorResponse = exception instanceof HttpException ? exception.getResponse() : undefined;
    const details = status < 500 ? extractDetails(errorResponse) : [];
    const message = extractMessage(errorResponse);

    const body = Messages.error(status, requestId, message, details);
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

function extractMessage(response: string | object | undefined): string | undefined {
  if (typeof response === 'string') {
    return response;
  }
  if (response && 'message' in response && typeof response.message === 'string') {
    return response.message;
  }
  return undefined;
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
