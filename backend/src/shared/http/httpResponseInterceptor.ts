import { randomUUID } from 'node:crypto';
import type { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import type { Response } from 'express';
import { map } from 'rxjs';
import type { Observable } from 'rxjs';
import { Messages } from './messages.js';
import type { SuccessResponse } from './messages.js';

export class HttpResponseInterceptor implements NestInterceptor<unknown, SuccessResponse<unknown> | undefined> {
  intercept(context: ExecutionContext, next: CallHandler<unknown>): Observable<SuccessResponse<unknown> | undefined> {
    const response = context.switchToHttp().getResponse<Response>();
    return next.handle().pipe(map((data: unknown) => {
      if (response.statusCode === 204) return undefined;
      const existingId: unknown = response.locals.requestId;
      const requestId = typeof existingId === 'string' ? existingId : randomUUID();
      response.setHeader('X-Request-ID', requestId);
      return Messages.success(data, response.statusCode, requestId);
    }));
  }
}
