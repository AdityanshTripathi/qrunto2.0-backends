import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';

export const SECURITY_PROOF_SCOPES = ['analytics', 'subscription', 'settings'] as const;
export type SecurityProofScope = typeof SECURITY_PROOF_SCOPES[number];

const SECURITY_PROOF_AUDIENCE = 'ordio-security-proof';
const SECURITY_PROOF_ISSUER = 'ordio';
export const SECURITY_PROOF_TTL_SECONDS = 5 * 60;

interface SecurityProofClaims extends jwt.JwtPayload {
  typ: 'security-proof';
  ver: 1;
  sub: string;
  tenant: string;
  scope: SecurityProofScope;
  session: string;
  jti: string;
}

function signingSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET environment variable is required');
  return secret;
}

export function isSecurityProofScope(value: unknown): value is SecurityProofScope {
  return typeof value === 'string' && (SECURITY_PROOF_SCOPES as readonly string[]).includes(value);
}

export function issueSecurityProof(input: {
  userId: string;
  restaurantId: string;
  scope: SecurityProofScope;
  accessTokenFingerprint: string;
}): { proof: string; expiresAt: string } {
  const expiresAt = new Date(Date.now() + SECURITY_PROOF_TTL_SECONDS * 1000);
  const proof = jwt.sign({
    typ: 'security-proof',
    ver: 1,
    sub: input.userId,
    tenant: input.restaurantId,
    scope: input.scope,
    session: input.accessTokenFingerprint,
    jti: randomUUID(),
  }, signingSecret(), {
    algorithm: 'HS256',
    audience: SECURITY_PROOF_AUDIENCE,
    issuer: SECURITY_PROOF_ISSUER,
    expiresIn: SECURITY_PROOF_TTL_SECONDS,
  });
  return { proof, expiresAt: expiresAt.toISOString() };
}

export function validateSecurityProof(proof: string, expected: {
  userId: string;
  restaurantId: string;
  scope: SecurityProofScope;
  accessTokenFingerprint: string;
}): boolean {
  try {
    const claims = jwt.verify(proof, signingSecret(), {
      algorithms: ['HS256'],
      audience: SECURITY_PROOF_AUDIENCE,
      issuer: SECURITY_PROOF_ISSUER,
    }) as SecurityProofClaims;
    return claims.typ === 'security-proof'
      && claims.ver === 1
      && claims.sub === expected.userId
      && claims.tenant === expected.restaurantId
      && claims.scope === expected.scope
      && claims.session === expected.accessTokenFingerprint
      && typeof claims.jti === 'string';
  } catch {
    return false;
  }
}
