import { fetchAresFromWeb } from "./ares";
import { apiFetch } from "./http";
import type { Buyer, Invoice, StoredInvoice, Supplier } from "./types";

function defaultSupplier(): Supplier {
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

function normalizeSupplier(raw: unknown): Supplier {
  const d = defaultSupplier();
  if (!raw || typeof raw !== "object") return d;
  const s = raw as Record<string, unknown>;
  return {
    ...d,
    name: typeof s.name === "string" ? s.name : d.name,
    address: typeof s.address === "string" ? s.address : d.address,
    ico: typeof s.ico === "string" ? s.ico : d.ico,
    neplavecDph: typeof s.neplavecDph === "boolean" ? s.neplavecDph : d.neplavecDph,
    bankAccount: typeof s.bankAccount === "string" ? s.bankAccount : d.bankAccount,
    iban: typeof s.iban === "string" ? s.iban : d.iban,
    swift: typeof s.swift === "string" ? s.swift : d.swift,
    email: typeof s.email === "string" ? s.email : d.email,
    phone: typeof s.phone === "string" ? s.phone : d.phone,
    web: typeof s.web === "string" ? s.web : d.web,
  };
}

export async function apiListInvoices(): Promise<StoredInvoice[]> {
  const data = await apiFetch<{ invoices: StoredInvoice[] }>("/api/invoices");
  return Array.isArray(data.invoices) ? data.invoices : [];
}

export async function apiSaveInvoice(invoice: Invoice): Promise<number> {
  if (invoice.id != null) {
    const data = await apiFetch<{ id: number }>(`/api/invoices/${invoice.id}`, {
      method: "PUT",
      body: invoice,
    });
    return data.id;
  }
  const data = await apiFetch<{ id: number }>("/api/invoices", {
    method: "POST",
    body: invoice,
  });
  return data.id;
}

export async function apiDeleteInvoice(id: number): Promise<void> {
  await apiFetch<{ ok: boolean }>(`/api/invoices/${id}`, { method: "DELETE" });
}

export async function apiGetSupplier(): Promise<Supplier> {
  const data = await apiFetch<{ supplier: unknown }>("/api/supplier");
  return normalizeSupplier(data.supplier);
}

export async function apiSaveSupplier(supplier: Supplier): Promise<void> {
  await apiFetch<{ supplier: unknown }>("/api/supplier", {
    method: "PUT",
    body: supplier,
  });
}

export type AresBuyer = Buyer;

export async function apiFetchAres(ico: string): Promise<AresBuyer> {
  return fetchAresFromWeb(ico);
}

export type PublicInvoiceSubmission = {
  createdAt: string;
  source: "public-free-invoice";
  invoice: Invoice;
  contactEmail: string;
  gdprAccepted: boolean;
  termsAccepted: boolean;
};

export async function apiSavePublicInvoiceSubmission(row: PublicInvoiceSubmission): Promise<void> {
  await apiFetch<{ id: string }>("/api/public/invoice-submissions", {
    method: "POST",
    auth: false,
    body: row,
  });
}
