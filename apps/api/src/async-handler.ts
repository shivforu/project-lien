import type { NextFunction, Request, RequestHandler, Response } from "express";

/**
 * Express 4 does not route a rejected promise from an async handler to error-handling
 * middleware on its own (that's an Express 5 behavior) — every async route in this app is
 * wrapped with this so a thrown/rejected error reaches app.ts's centralized error handler
 * instead of hanging the request or crashing the process.
 */
export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
