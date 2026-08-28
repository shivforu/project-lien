import type { NextFunction, Request, Response } from "express";
import type { OrgRole } from "@project-lien/db";
import { InvalidTokenError, verifyToken, type AccessTokenClaims } from "./jwt.js";

export interface AuthenticatedRequest extends Request {
  auth?: AccessTokenClaims;
}

/**
 * Extracts and verifies the Bearer access token, attaching `req.auth`
 * ({ sub, organizationId, role }) for downstream tenant-scoping and RBAC
 * (docs/REQUIREMENTS_MATRIX.md #33). Every `/api/v1` route except `/auth/login` requires
 * this.
 */
export function requireAuth(accessSecret: string) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Missing or malformed Authorization header" } });
      return;
    }
    const token = header.slice("Bearer ".length);
    try {
      req.auth = verifyToken(token, accessSecret);
      next();
    } catch (err) {
      if (err instanceof InvalidTokenError) {
        res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Invalid or expired token" } });
        return;
      }
      throw err;
    }
  };
}

/** Role-based access control — org-scoped roles only (docs/SECURITY.md). */
export function requireRole(...roles: OrgRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.auth) {
      res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Not authenticated" } });
      return;
    }
    if (!roles.includes(req.auth.role)) {
      res.status(403).json({ error: { code: "FORBIDDEN", message: `Requires one of roles: ${roles.join(", ")}` } });
      return;
    }
    next();
  };
}
