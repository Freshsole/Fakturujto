import { Router } from "express";
import { count, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import { suppliers, users } from "../db/schema.js";
import { signToken } from "../lib/jwt.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { toPublicUser } from "../lib/types.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";

export const authRouter = Router();

const registerSchema = z.object({
  fullName: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  profile: z
    .object({
      companyName: z.string().optional(),
      ico: z.string().optional(),
      dic: z.string().optional(),
      address: z.string().optional(),
    })
    .optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const passwordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6),
});

authRouter.post("/register", async (req, res) => {
  try {
    const body = registerSchema.parse(req.body);
    const email = body.email.trim().toLowerCase();
    const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (existing.length > 0) {
      res.status(409).json({ error: "Uživatel s tímto e-mailem již existuje." });
      return;
    }

    const [{ value: userCount }] = await db.select({ value: count() }).from(users);
    const role = userCount === 0 ? "admin" : "user";
    const passwordHash = await hashPassword(body.password);
    const profile = body.profile ?? {};

    const [row] = await db
      .insert(users)
      .values({
        fullName: body.fullName.trim(),
        email,
        passwordHash,
        role,
        companyName: profile.companyName?.trim() || "",
        ico: profile.ico?.trim() || "",
        dic: profile.dic?.trim() || "",
        address: profile.address?.trim() || "",
      })
      .returning();

    await db.insert(suppliers).values({
      userId: row.id,
      name: row.companyName || row.fullName,
      address: row.address,
      ico: row.ico,
      email: row.email,
    });

    const publicUser = toPublicUser(row);
    const token = signToken({ sub: row.id, email: row.email, role: publicUser.role });
    res.status(201).json({ token, user: publicUser });
  } catch (e) {
    if (e instanceof z.ZodError) {
      res.status(400).json({ error: "Neplatná data registrace." });
      return;
    }
    console.error(e);
    res.status(500).json({ error: "Registrace selhala." });
  }
});

authRouter.post("/login", async (req, res) => {
  try {
    const body = loginSchema.parse(req.body);
    const email = body.email.trim().toLowerCase();
    const [row] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!row || !(await verifyPassword(body.password, row.passwordHash))) {
      res.status(401).json({ error: "Neplatný e-mail nebo heslo." });
      return;
    }
    const publicUser = toPublicUser(row);
    const token = signToken({ sub: row.id, email: row.email, role: publicUser.role });
    res.json({ token, user: publicUser });
  } catch (e) {
    if (e instanceof z.ZodError) {
      res.status(400).json({ error: "Neplatná data přihlášení." });
      return;
    }
    console.error(e);
    res.status(500).json({ error: "Přihlášení selhalo." });
  }
});

authRouter.get("/me", requireAuth, async (req: AuthedRequest, res) => {
  res.json({ user: req.user });
});

authRouter.post("/logout", (_req, res) => {
  res.json({ ok: true });
});

authRouter.post("/password", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const body = passwordSchema.parse(req.body);
    const [row] = await db.select().from(users).where(eq(users.id, req.user!.id)).limit(1);
    if (!row || !(await verifyPassword(body.currentPassword, row.passwordHash))) {
      res.status(400).json({ error: "Neplatné aktuální heslo." });
      return;
    }
    const passwordHash = await hashPassword(body.newPassword);
    await db.update(users).set({ passwordHash }).where(eq(users.id, row.id));
    res.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) {
      res.status(400).json({ error: "Neplatná data." });
      return;
    }
    console.error(e);
    res.status(500).json({ error: "Změna hesla selhala." });
  }
});
