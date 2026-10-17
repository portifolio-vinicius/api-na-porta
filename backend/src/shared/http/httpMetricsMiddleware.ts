import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { appendFile } from 'node:fs/promises';
import type { RequestHandler } from 'express';

type CacheOutcome = 'hit' | 'miss' | 'bypass';
const requestContext = new AsyncLocalStorage<{ cacheOutcome: CacheOutcome }>();
export function recordHttpCacheOutcome(outcome: CacheOutcome): void {
  const context = requestContext.getStore();
  if (context) context.cacheOutcome = outcome;
}

/** Whole HTTP pipeline measurement. No bodies, credentials, query strings or resource IDs. */
export function createHttpMetricsMiddleware(file?: string): {
  middleware: RequestHandler;
  flush: () => Promise<void>;
} {
  let pending = Promise.resolve();
  let queued = 0;
  let failed = false;
  const middleware: RequestHandler = (request, response, next) => {
    const requestId = /^[a-f0-9-]{1,64}$/i.test(request.header('x-request-id') ?? '')
      ? request.header('x-request-id')! : randomUUID();
    request.headers['x-request-id'] = requestId;
    response.locals.requestId = requestId;
    response.setHeader('X-Request-ID', requestId);
    const context = { cacheOutcome: 'bypass' as CacheOutcome };
    let requestBodyBytes = 0;
    request.on('data', (chunk: Buffer) => { requestBodyBytes += chunk.byteLength; });
    const started = performance.now();
    let emitted = false;
    const record = (completed: boolean): void => {
      if (emitted) return;
      emitted = true;
      // Only known route templates are allowed to reach telemetry.
      const path: unknown = request.route?.path;
      const known = new Set(['/health/ready', '/api/v1/auth/login', '/api/v1/orders', '/api/v1/orders/:id']);
      const route = typeof path === 'string' && known.has(path) ? path : 'unmatched';
      const log = { level: 'info', event: 'http_request', requestId, method: request.method, route,
        statusCode: completed ? response.statusCode : null, durationMs: performance.now() - started };
      process.stdout.write(`${JSON.stringify(log)}\n`);
      if (!file) return;
      if (queued >= 1024) { failed = true; return; }
      const sample = JSON.stringify({ requestId, method: request.method, route,
        statusCode: completed ? response.statusCode : null,
        serverDurationMs: performance.now() - started, requestBodyBytes, cacheOutcome: context.cacheOutcome,
        outcome: completed ? 'completed' : 'aborted' });
      queued += 1;
      pending = pending.then(() => appendFile(file, `${sample}\n`, { mode: 0o600 }))
        .catch(() => { failed = true; }).finally(() => { queued -= 1; });
    };
    response.once('finish', () => record(true));
    response.once('close', () => record(response.writableFinished));
    requestContext.run(context, next);
  };
  return { middleware, flush: async (): Promise<void> => {
    await pending;
    if (failed) throw new Error('Coleta HTTP incompleta.');
  } };
}
