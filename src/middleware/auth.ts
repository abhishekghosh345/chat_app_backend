import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/auth';
import { SessionService } from '../services/SessionService';
import { JwtPayload } from '../types';

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
      sessionId?: string;
    }
  }
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.warn('[authMiddleware] 401 Missing authorization token', {
        path: req.path,
        method: req.method,
      });
      return res.status(401).json({ error: 'Missing authorization token' });
    }

    const token = authHeader.substring(7);
    const payload = verifyAccessToken(token);

    if (!payload) {
      console.warn('[authMiddleware] 401 Invalid or expired token', {
        path: req.path,
        method: req.method,
      });
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // Verify session is still valid
    const session = await SessionService.getSessionById(payload.sessionId);
    if (!session) {
      console.warn('[authMiddleware] 401 Session not found or expired', {
        path: req.path,
        method: req.method,
        sessionId: payload.sessionId,
      });
      return res.status(401).json({ error: 'Session not found or expired' });
    }


    req.user = payload;
    req.sessionId = payload.sessionId;
    next();
    return;
  } catch (error) {
    res.status(401).json({ error: 'Authentication failed' });
    return;
  }
}



export function optionalAuthMiddleware(req: Request, _res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const payload = verifyAccessToken(token);

      if (payload) {
        req.user = payload;
      }
    }

    next();
  } catch (error) {
    // Continue without auth
    next();
  }
}
