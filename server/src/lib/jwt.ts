import jwt from "jsonwebtoken";

export type JwtPayload = {
  sub: string;
  email: string;
  role: "admin" | "user";
};

function secret(): string {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 16) {
    throw new Error("JWT_SECRET must be set (min 16 characters)");
  }
  return s;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, secret(), { expiresIn: "30d" });
}

export function verifyToken(token: string): JwtPayload {
  const decoded = jwt.verify(token, secret());
  if (!decoded || typeof decoded !== "object") throw new Error("Invalid token");
  const p = decoded as jwt.JwtPayload;
  if (typeof p.sub !== "string" || typeof p.email !== "string") throw new Error("Invalid token");
  const role = p.role === "admin" ? "admin" : "user";
  return { sub: p.sub, email: p.email, role };
}
