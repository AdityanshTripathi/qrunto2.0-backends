// Never emit raw exceptions: connection errors can contain credentials and URLs.
const messages: Record<string, string> = {
  ECONNREFUSED: 'Connection refused', ECONNRESET: 'Connection reset',
  ETIMEDOUT: 'Connection timed out', ENOTFOUND: 'DNS lookup failed',
  EAI_AGAIN: 'DNS temporarily unavailable', WRONGPASS: 'Redis authentication failed',
  NOAUTH: 'Redis authentication required', NOPERM: 'Redis command not permitted',
  CERT_HAS_EXPIRED: 'TLS certificate expired',
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: 'TLS certificate verification failed',
  ERR_TLS_CERT_ALTNAME_INVALID: 'TLS hostname verification failed',
  P1001: 'Database unreachable', P1000: 'Database authentication failed',
  P2021: 'Database table missing', P2022: 'Database column missing',
  P2024: 'Database pool timeout', P2028: 'Database transaction failed',
  '42P01': 'Database table missing', '42703': 'Database column missing',
};

export function safeError(error: unknown): { code: string; message: string } {
  if (error instanceof StageError) return { code: error.code, message: error.message };
  if (error instanceof Error) {
    const code = (error as Error & { code?: unknown }).code;
    if (typeof code === 'string' && messages[code]) return { code, message: messages[code]! };
    const prefix = error.message.split(' ')[0]!;
    if (messages[prefix]) return { code: prefix, message: messages[prefix]! };
    if (error.message === 'Redis unavailable: configure REDIS_URL')
      return { code: 'REDIS_CONFIG_MISSING', message: 'Redis configuration missing' };
    if (error.message === 'Invalid REDIS_URL: expected a redis:// or rediss:// connection URL')
      return { code: 'REDIS_CONFIG_INVALID', message: 'Redis configuration invalid' };
  }
  return { code: 'UNKNOWN', message: 'Unclassified internal failure (details withheld)' };
}

export class StageError extends Error {
  readonly code: string;
  constructor(readonly stage: string, error: unknown) {
    const safe = safeError(error);
    super(safe.message);
    this.code = safe.code;
  }
}

export function logSafeError(stage: string, error: unknown): void {
  console.error('[CRM Scheduler] Failure', {
    stage: error instanceof StageError ? error.stage : stage, ...safeError(error),
  });
}
