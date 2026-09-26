import { Router } from "express";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import { suppliers, users } from "../db/schema.js";
import { hashPassword } from "../lib/password.js";
import { toPublicUser } from "../lib/types.js";
import { requireAdmin, requireAuth, type AuthedRequest } from "../middleware/auth.js";

export const usersRouter = Router();

usersRouter.use(requireAuth, requireAdmin);

usersRouter.get("/", async (_req, res) => {
  const rows = await db.select().from(users).orderBy(asc(users.createdAt));
  res.json({ users: rows.map(toPublicUser) });
});

const inviteSchema = z.object({
  fullName: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(["admin", "user"]).optional(),
  profile: z
    .object({
      companyName: z.string().optional(),
      ico: z.string().optional(),
      dic: z.string().optional(),
      address: z.string().optional(),
    })
    .optional(),
});

usersRouter.post("/", async (req, res) => {
  try {
    const body = inviteSchema.parse(req.body);
    const email = body.email.trim().toLowerCase();
    const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (existing.length > 0) {
      res.status(409).json({ error: "Uživatel s tímto e-mailem již existuje." });
      return;
    }
    const passwordHash = await hashPassword(body.password);
    const profile = body.profile ?? {};
    const [row] = await db
      .insert(users)
      .values({
        fullName: body.fullName.trim(),
        email,
        passwordHash,
        role: body.role ?? "user",
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

    res.status(201).json({ user: toPublicUser(row) });
  } catch (e) {
    if (e instanceof z.ZodError) {
      res.status(400).json({ error: "Neplatná data." });
      return;
    }
    console.error(e);
    res.status(500).json({ error: "Vytvoření uživatele selhalo." });
  }
});

usersRouter.patch("/:id/role", async (req: AuthedRequest, res) => {
  try {
    const role = z.enum(["admin", "user"]).parse(req.body?.role);
    const id = String(req.params.id);
    if (req.user!.id === id && role !== "admin") {
      res.status(400).json({ error: "Aktuální administrátor si nemůže odebrat roli admin." });
      return;
    }
    const all = await db.select().from(users);
    const target = all.find((u) => u.id === id);
    if (!target) {
      res.status(404).json({ error: "Uživatel nenalezen." });
      return;
    }
    const next = all.map((u) => (u.id === id ? { ...u, role } : u));
    if (!next.some((u) => u.role === "admin")) {
      res.status(400).json({ error: "V systému musí zůstat alespoň jeden administrátor." });
      return;
    }
    await db.update(users).set({ role }).where(eq(users.id, id));
    const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    res.json({ user: toPublicUser(row) });
  } catch (e) {
    if (e instanceof z.ZodError) {
      res.status(400).json({ error: "Neplatná role." });
      return;
    }
    console.error(e);
    res.status(500).json({ error: "Změna role selhala." });
  }
});

usersRouter.delete("/:id", async (req: AuthedRequest, res) => {
  try {
    const id = String(req.params.id);
    if (req.user!.id === id) {
      res.status(400).json({ error: "Nelze smazat právě přihlášeného uživatele." });
      return;
    }
    const all = await db.select().from(users);
    const target = all.find((u) => u.id === id);
    if (!target) {
      res.status(404).json({ error: "Uživatel nenalezen." });
      return;
    }
    const left = all.filter((u) => u.id !== id);
    if (left.length > 0 && !left.some((u) => u.role === "admin")) {
      await db.update(users).set({ role: "admin" }).where(eq(users.id, left[0].id));
    }
    await db.delete(users).where(eq(users.id, id));
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Smazání selhalo." });
  }
});
