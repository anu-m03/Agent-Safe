import { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

/**
 * Request logger middleware — attaches a unique requestId to every
 * incoming request and logs method + path.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const requestId = crypto.randomUUID().slice(0, 8);
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${requestId}] ${req.method} ${req.path}`);
  next();
}
