import type { NextFunction, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { verifyToken, type JwtPayload } from "../lib/jwt.js";
import { toPublicUser, type PublicUser } from "../lib/types.js";

export type AuthedRequest = Request & {
  auth?: JwtPayload;
  user?: PublicUser;
};

export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      res.status(401).json({ error: "Nejste přihlášen." });
      return;
    }
    const token = header.slice(7).trim();
    if (!token) {
      res.status(401).json({ error: "Nejste přihlášen." });
      return;
    }
    const payload = verifyToken(token);
    const [row] = await db.select().from(users).where(eq(users.id, payload.sub)).limit(1);
    if (!row) {
      res.status(401).json({ error: "Neplatná session." });
      return;
    }
    req.auth = payload;
    req.user = toPublicUser(row);
    next();
  } catch {
    res.status(401).json({ error: "Neplatná session." });
  }
}

export function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== "admin") {
    res.status(403).json({ error: "Pouze administrátor." });
    return;
  }
  next();
}
