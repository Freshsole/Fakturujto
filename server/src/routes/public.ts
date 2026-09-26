import { Router } from "express";
import { z } from "zod";
import { db } from "../db/index.js";
import { publicInvoiceSubmissions } from "../db/schema.js";

export const publicRouter = Router();

const submissionSchema = z.object({
  createdAt: z.string().optional(),
  source: z.string().optional(),
  contactEmail: z.string().email().or(z.literal("")),
  gdprAccepted: z.boolean(),
  termsAccepted: z.boolean(),
  invoice: z.unknown(),
});

publicRouter.post("/invoice-submissions", async (req, res) => {
  try {
    const body = submissionSchema.parse(req.body);
    const [row] = await db
      .insert(publicInvoiceSubmissions)
      .values({
        source: body.source || "public-free-invoice",
        contactEmail: body.contactEmail || "",
        gdprAccepted: body.gdprAccepted,
        termsAccepted: body.termsAccepted,
        invoice: body.invoice as object,
      })
      .returning({ id: publicInvoiceSubmissions.id });
    res.status(201).json({ id: row.id });
  } catch (e) {
    if (e instanceof z.ZodError) {
      res.status(400).json({ error: "Neplatná data." });
      return;
    }
    console.error(e);
    res.status(500).json({ error: "Uložení selhalo." });
  }
});
