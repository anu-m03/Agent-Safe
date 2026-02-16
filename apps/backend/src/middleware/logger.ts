import { Request, Response, NextFunction } from 'express';

/**
 * Simple request logger middleware.
 * TODO: Replace with structured logging (pino / winston).
 */
export function requestLogger(req: Request, _res: Response, next: NextFunction): void {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
}
