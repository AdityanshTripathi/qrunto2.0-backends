import type { RequestHandler } from 'express';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { getRequestId, withRequestId } from '../lib/request-context';
import { logStructured } from '../lib/safe-error';

export const requestIdMiddleware: RequestHandler = (req, res, next) => {
  traceHttpRequest(req, res, () => {
    res.locals.requestId = getRequestId();
    next();
  });
};

export function traceHttpRequest(req: IncomingMessage, res: ServerResponse, next: () => void): void {
  withRequestId(req.headers['x-request-id'], () => {
    const requestId = getRequestId()!;
    res.setHeader('X-Request-ID', requestId);
    const started = performance.now();
    // Engine.IO's WebSocket upgrade response has headers but no finish emitter.
    res.once?.('finish', () => withRequestId(requestId, () => {
      // No URLs, query strings, bodies, or headers are recorded.
      logStructured('info', 'http', 'request.complete', 'completed', 'HTTP request completed', {
        method: req.method, statusCode: res.statusCode,
        durationMs: Math.round(performance.now() - started),
      });
    }));
    next();
  });
}
