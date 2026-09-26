import { Router } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import { suppliers } from "../db/schema.js";
import type { SupplierBody } from "../lib/types.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";

export const supplierRouter = Router();

supplierRouter.use(requireAuth);

const supplierSchema = z.object({
  name: z.string(),
  address: z.string(),
  ico: z.string(),
  neplavecDph: z.boolean(),
  bankAccount: z.string(),
  iban: z.string(),
  swift: z.string(),
  email: z.string(),
  phone: z.string(),
  web: z.string(),
});

function emptySupplier(): SupplierBody {
  return {
    name: "",
    address: "",
    ico: "",
    neplavecDph: true,
    bankAccount: "",
    iban: "",
    swift: "",
    email: "",
    phone: "",
    web: "",
  };
}

function rowToSupplier(row: typeof suppliers.$inferSelect): SupplierBody {
  return {
    name: row.name,
    address: row.address,
    ico: row.ico,
    neplavecDph: row.neplavecDph,
    bankAccount: row.bankAccount,
    iban: row.iban,
    swift: row.swift,
    email: row.email,
    phone: row.phone,
    web: row.web,
  };
}

supplierRouter.get("/", async (req: AuthedRequest, res) => {
  const [row] = await db.select().from(suppliers).where(eq(suppliers.userId, req.user!.id)).limit(1);
  res.json({ supplier: row ? rowToSupplier(row) : emptySupplier() });
});

supplierRouter.put("/", async (req: AuthedRequest, res) => {
  try {
    const body = supplierSchema.parse(req.body);
    const [existing] = await db
      .select()
      .from(suppliers)
      .where(eq(suppliers.userId, req.user!.id))
      .limit(1);

    if (existing) {
      const [row] = await db
        .update(suppliers)
        .set({ ...body, updatedAt: new Date() })
        .where(eq(suppliers.userId, req.user!.id))
        .returning();
      res.json({ supplier: rowToSupplier(row) });
      return;
    }

    const [row] = await db
      .insert(suppliers)
      .values({ userId: req.user!.id, ...body })
      .returning();
    res.json({ supplier: rowToSupplier(row) });
  } catch (e) {
    if (e instanceof z.ZodError) {
      res.status(400).json({ error: "Neplatná data dodavatele." });
      return;
    }
    console.error(e);
    res.status(500).json({ error: "Uložení dodavatele selhalo." });
  }
});
