import { Router } from "express";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import { invoices } from "../db/schema.js";
import type { InvoicePayload, StoredInvoice } from "../lib/types.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";

export const invoicesRouter = Router();

invoicesRouter.use(requireAuth);

const lineItemSchema = z.object({
  description: z.string(),
  quantity: z.number(),
  unit: z.string(),
  unitPrice: z.number(),
  highlighted: z.boolean().optional(),
});

const invoiceSchema = z.object({
  id: z.number().optional().nullable(),
  supplier: z.object({
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
  }),
  buyer: z.object({
    name: z.string(),
    address: z.string(),
    ico: z.string(),
    dic: z.string(),
  }),
  number: z.string(),
  constantSymbol: z.string(),
  issueDate: z.string(),
  dueDate: z.string(),
  paymentMethod: z.string(),
  lineItems: z.array(lineItemSchema),
  status: z.enum(["paid", "unpaid"]),
});

function rowToStored(row: typeof invoices.$inferSelect): StoredInvoice {
  const payload = row.payload as InvoicePayload;
  return {
    id: row.id,
    supplier: payload.supplier,
    buyer: payload.buyer,
    number: row.number || payload.number,
    constantSymbol: payload.constantSymbol,
    issueDate: payload.issueDate,
    dueDate: payload.dueDate,
    paymentMethod: payload.paymentMethod,
    lineItems: payload.lineItems,
    status: row.status === "paid" ? "paid" : "unpaid",
  };
}

function toPayload(body: z.infer<typeof invoiceSchema>): InvoicePayload {
  return {
    supplier: body.supplier,
    buyer: body.buyer,
    number: body.number,
    constantSymbol: body.constantSymbol,
    issueDate: body.issueDate,
    dueDate: body.dueDate,
    paymentMethod: body.paymentMethod,
    lineItems: body.lineItems,
    status: body.status,
  };
}

invoicesRouter.get("/", async (req: AuthedRequest, res) => {
  const rows = await db
    .select()
    .from(invoices)
    .where(eq(invoices.userId, req.user!.id))
    .orderBy(desc(invoices.id));
  res.json({ invoices: rows.map(rowToStored) });
});

invoicesRouter.post("/", async (req: AuthedRequest, res) => {
  try {
    const body = invoiceSchema.parse(req.body);
    const payload = toPayload(body);
    const [row] = await db
      .insert(invoices)
      .values({
        userId: req.user!.id,
        number: body.number,
        status: body.status,
        payload,
      })
      .returning();
    res.status(201).json({ id: row.id, invoice: rowToStored(row) });
  } catch (e) {
    if (e instanceof z.ZodError) {
      res.status(400).json({ error: "Neplatná faktura." });
      return;
    }
    console.error(e);
    res.status(500).json({ error: "Uložení faktury selhalo." });
  }
});

invoicesRouter.put("/:id", async (req: AuthedRequest, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Neplatné ID." });
      return;
    }
    const body = invoiceSchema.parse(req.body);
    const payload = toPayload(body);
    const [existing] = await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.id, id), eq(invoices.userId, req.user!.id)))
      .limit(1);
    if (!existing) {
      res.status(404).json({ error: "Faktura nenalezena." });
      return;
    }
    const [row] = await db
      .update(invoices)
      .set({
        number: body.number,
        status: body.status,
        payload,
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, id))
      .returning();
    res.json({ id: row.id, invoice: rowToStored(row) });
  } catch (e) {
    if (e instanceof z.ZodError) {
      res.status(400).json({ error: "Neplatná faktura." });
      return;
    }
    console.error(e);
    res.status(500).json({ error: "Uložení faktury selhalo." });
  }
});

invoicesRouter.delete("/:id", async (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Neplatné ID." });
    return;
  }
  const deleted = await db
    .delete(invoices)
    .where(and(eq(invoices.id, id), eq(invoices.userId, req.user!.id)))
    .returning({ id: invoices.id });
  if (deleted.length === 0) {
    res.status(404).json({ error: "Faktura nenalezena." });
    return;
  }
  res.json({ ok: true });
});
