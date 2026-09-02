import type { CorsOptions } from 'cors';

const DEVELOPMENT_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

export interface CorsEnvironment {
  NODE_ENV?: string;
  CORS_ALLOWED_ORIGINS?: string;
  FRONTEND_URL?: string;
  ADMIN_URL?: string;
}

const parseOrigin = (value: string): string => {
  if (value.includes('*')) throw new Error('Wildcard CORS origins are not allowed');
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.origin !== value.replace(/\/$/, '')) {
    throw new Error(`Invalid CORS origin: ${value}`);
  }
  return url.origin;
};

export const buildAllowedOrigins = (env: CorsEnvironment): ReadonlySet<string> => {
  const environment = env.NODE_ENV ?? 'development';
  const configured = [
    ...(env.CORS_ALLOWED_ORIGINS ?? '').split(','),
    env.FRONTEND_URL ?? '',
    env.ADMIN_URL ?? '',
  ]
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map(parseOrigin);

  if (environment === 'production' && configured.length === 0) {
    throw new Error('A trusted CORS origin must be configured in production');
  }

  if (environment === 'development') configured.push(...DEVELOPMENT_ORIGINS);
  return new Set(configured);
};

export const isOriginAllowed = (
  origin: string | undefined,
  allowedOrigins: ReadonlySet<string>,
): boolean => !origin || allowedOrigins.has(origin);

export const createCorsOptions = (env: CorsEnvironment): CorsOptions => {
  const allowedOrigins = buildAllowedOrigins(env);
  return {
    origin(origin, callback) {
      if (isOriginAllowed(origin, allowedOrigins)) return callback(null, true);
      return callback(new Error('Origin is not allowed by CORS'));
    },
    methods: ['GET', 'HEAD', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    credentials: false,
  };
};

export const corsOptions = createCorsOptions(process.env);
