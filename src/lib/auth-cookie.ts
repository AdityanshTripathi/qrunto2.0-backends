import type { CookieOptions, Request, Response } from 'express';
import { buildAllowedOrigins, isOriginAllowed } from '../config/cors';

export const REFRESH_COOKIE_NAME = 'ordio_refresh';
export const REFRESH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function refreshCookieOptions(
  env: NodeJS.ProcessEnv = process.env,
): CookieOptions {
  const production = env.NODE_ENV === 'production';

  return {
    httpOnly: true,
    secure: production,
    sameSite: production ? 'none' : 'lax',
    path: '/api/auth',
    maxAge: REFRESH_COOKIE_MAX_AGE_MS,
  };
}

export function setRefreshCookie(
  res: Response,
  refreshToken: string,
  expiresAt?: Date,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const options = refreshCookieOptions(env);

  if (expiresAt) {
    options.maxAge = Math.max(
      0,
      expiresAt.getTime() - Date.now(),
    );
  }

  res.cookie(
    REFRESH_COOKIE_NAME,
    refreshToken,
    options,
  );
}

export function clearRefreshCookie(
  res: Response,
  env: NodeJS.ProcessEnv = process.env,
): void {
  const { maxAge: _maxAge, ...options } = refreshCookieOptions(env);

  res.clearCookie(
    REFRESH_COOKIE_NAME,
    options,
  );
}

function readCookie(req: Request, name: string): string | null {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return null;

  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;

    const key = part.slice(0, separator).trim();
    if (key !== name) continue;

    const rawValue = part.slice(separator + 1).trim();

    try {
      return decodeURIComponent(rawValue);
    } catch {
      return null;
    }
  }

  return null;
}

export function readRefreshCookie(req: Request): string | null {
  return readCookie(req, REFRESH_COOKIE_NAME);
}

/**
 * Cookie-authenticated state-changing auth endpoints must come from one of
 * the explicitly trusted frontend origins. This protects cross-site
 * SameSite=None refresh cookies from CSRF.
 */
export function hasTrustedAuthOrigin(
  req: Request,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const origin = req.headers.origin;
  if (!origin) return false;

  return isOriginAllowed(
    origin,
    buildAllowedOrigins(env),
  );
}