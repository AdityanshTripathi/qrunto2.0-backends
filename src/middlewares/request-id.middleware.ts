import type { RequestHandler } from 'express';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { getRequestId, withRequestId } from '../lib/request-context';
import { logStructured } from '../lib/safe-error';
import { monitoringMetrics, SLOW_MS } from '../lib/monitoring-metrics';

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
    // Health polling/internal probes and long-lived socket polling must not
    // dilute API error rates or look like slow business requests. Never retain URLs.
    const path = (req.url ?? '').split('?')[0]!;
    const apiRequest = path.startsWith('/api/') && !path.startsWith('/api/internal/');
    // Engine.IO's WebSocket upgrade response has headers but no finish emitter.
    res.once?.('finish', () => withRequestId(requestId, () => {
      // No URLs, query strings, bodies, or headers are recorded.
      const durationMs = Math.round(performance.now() - started);
      if (apiRequest) monitoringMetrics.request(res.statusCode, durationMs);
      const failed = res.statusCode >= 500;
      const slow = apiRequest && durationMs >= SLOW_MS;
      logStructured(failed ? 'error' : slow ? 'warn' : 'info', 'http', 'request.complete',
        failed ? 'failed' : slow ? 'slow' : 'completed', 'HTTP request completed', {
        code: failed && path === '/ready' ? 'READINESS_UNHEALTHY' : failed ? 'HTTP_5XX' : slow ? 'HTTP_SLOW' : 'OK', apiRequest,
        method: req.method, statusCode: res.statusCode,
        durationMs,
      });
    }));
    next();
  });
}
