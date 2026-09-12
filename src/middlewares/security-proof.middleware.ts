import { NextFunction, Request, Response } from 'express';
import { SecurityProofScope, validateSecurityProof } from '../services/security-proof.service';

export const requireSecurityProof = (scope: SecurityProofScope) => (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  if (!req.user || !req.user.restaurantId || !req.accessTokenFingerprint) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  const proof = req.header('X-Security-Proof');
  if (!proof || !validateSecurityProof(proof, {
    userId: req.user.id,
    restaurantId: req.user.restaurantId,
    scope,
    accessTokenFingerprint: req.accessTokenFingerprint,
  })) {
    res.status(403).json({ error: 'A valid security proof is required for this action' });
    return;
  }

  next();
};
