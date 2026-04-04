import { invoke } from "@tauri-apps/api/core";
import { fetchAresFromWeb } from "./ares";
import { getSessionUserId } from "./auth";
import type { Buyer, Invoice, LineItem, StoredInvoice, Supplier } from "./types";

const LS_INV = "faktura_app_invoices";
const LS_SUP = "faktura_app_supplier";
const LS_PUBLIC_SUBMISSIONS = "fakturujto_public_invoice_submissions_v1";

function userScopedKey(base: string): string {
  const id = getSessionUserId();
  if (!id) return base;
  return `${base}__${id}`;
}

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

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

function normalizeLineItem(raw: unknown): LineItem {
  const empty: LineItem = { description: "", quantity: 1, unit: "ks", unitPrice: 0, highlighted: false };
  if (!raw || typeof raw !== "object") return empty;
  const l = raw as Record<string, unknown>;
  const q = typeof l.quantity === "number" && Number.isFinite(l.quantity) ? l.quantity : 1;
  const up = typeof l.unitPrice === "number" && Number.isFinite(l.unitPrice) ? l.unitPrice : 0;
  return {
    description: typeof l.description === "string" ? l.description : "",
    quantity: q,
    unit: typeof l.unit === "string" ? l.unit : "ks",
    unitPrice: up,
    highlighted: l.highlighted === true,
  };
}

function normalizeInvoice(raw: unknown): StoredInvoice | null {
  if (!raw || typeof raw !== "object") return null;
  const inv = raw as Record<string, unknown>;
  const id = typeof inv.id === "number" && Number.isFinite(inv.id) ? inv.id : null;
  if (id == null) return null;
  const supplier = normalizeSupplier(inv.supplier);
  const buyerRaw = inv.buyer;
  const buyer =
    buyerRaw && typeof buyerRaw === "object"
      ? (buyerRaw as import("./types").Buyer)
      : { name: "", address: "", ico: "", dic: "" };
  const lineItemsRaw = inv.lineItems;
  const lineItems = Array.isArray(lineItemsRaw)
    ? lineItemsRaw.map(normalizeLineItem)
    : [normalizeLineItem(null)];
  return {
    id,
    supplier,
    buyer: {
      name: typeof buyer.name === "string" ? buyer.name : "",
      address: typeof buyer.address === "string" ? buyer.address : "",
      ico: typeof buyer.ico === "string" ? buyer.ico : "",
      dic: typeof buyer.dic === "string" ? buyer.dic : "",
    },
    number: typeof inv.number === "string" ? inv.number : "",
    constantSymbol: typeof inv.constantSymbol === "string" ? inv.constantSymbol : "0308",
    issueDate: typeof inv.issueDate === "string" ? inv.issueDate : "",
    dueDate: typeof inv.dueDate === "string" ? inv.dueDate : "",
    paymentMethod: typeof inv.paymentMethod === "string" ? inv.paymentMethod : "Převodem",
    lineItems,
    status: inv.status === "paid" ? "paid" : "unpaid",
  };
}

async function browserListInvoices(): Promise<StoredInvoice[]> {
  const raw = localStorage.getItem(userScopedKey(LS_INV));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown[];
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeInvoice).filter((x): x is StoredInvoice => x != null);
  } catch {
    return [];
  }
}

async function browserSaveInvoice(invoice: Invoice): Promise<number> {
  const list = [...(await browserListInvoices())];
  if (invoice.id != null) {
    const idx = list.findIndex((x) => x.id === invoice.id);
    const row: StoredInvoice = { ...invoice, id: invoice.id };
    if (idx >= 0) list[idx] = row;
    else list.push(row);
    localStorage.setItem(userScopedKey(LS_INV), JSON.stringify(list));
    return invoice.id;
  }
  const nextId = Math.max(0, ...list.map((x) => x.id)) + 1;
  const row: StoredInvoice = { ...invoice, id: nextId };
  list.push(row);
  localStorage.setItem(userScopedKey(LS_INV), JSON.stringify(list));
  return nextId;
}

async function browserDeleteInvoice(id: number): Promise<void> {
  const list = (await browserListInvoices()).filter((x) => x.id !== id);
  localStorage.setItem(userScopedKey(LS_INV), JSON.stringify(list));
}

async function browserGetSupplier(): Promise<Supplier> {
  const raw = localStorage.getItem(userScopedKey(LS_SUP));
  if (!raw) return defaultSupplier();
  try {
    return normalizeSupplier(JSON.parse(raw));
  } catch {
    return defaultSupplier();
  }
}

async function browserSaveSupplier(s: Supplier): Promise<void> {
  localStorage.setItem(userScopedKey(LS_SUP), JSON.stringify(s));
}

export async function apiListInvoices(): Promise<StoredInvoice[]> {
  if (isTauri()) return invoke<StoredInvoice[]>("invoices_list");
  return browserListInvoices();
}

export async function apiSaveInvoice(invoice: Invoice): Promise<number> {
  if (isTauri()) return invoke<number>("invoice_save", { invoice });
  return browserSaveInvoice(invoice);
}

export async function apiDeleteInvoice(id: number): Promise<void> {
  if (isTauri()) return invoke<void>("invoice_delete", { id });
  return browserDeleteInvoice(id);
}

export async function apiGetSupplier(): Promise<Supplier> {
  if (isTauri()) return invoke<Supplier>("supplier_get");
  return browserGetSupplier();
}

export async function apiSaveSupplier(supplier: Supplier): Promise<void> {
  if (isTauri()) return invoke<void>("supplier_save", { supplier });
  return browserSaveSupplier(supplier);
}

export type AresBuyer = Buyer;

export async function apiFetchAres(ico: string): Promise<AresBuyer> {
  if (isTauri()) return invoke<AresBuyer>("fetch_ares", { ico });
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

async function browserSavePublicInvoiceSubmission(row: PublicInvoiceSubmission): Promise<void> {
  const raw = localStorage.getItem(LS_PUBLIC_SUBMISSIONS);
  let list: PublicInvoiceSubmission[] = [];
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) list = parsed as PublicInvoiceSubmission[];
    } catch {
      list = [];
    }
  }
  list.push(row);
  localStorage.setItem(LS_PUBLIC_SUBMISSIONS, JSON.stringify(list));
}

export async function apiSavePublicInvoiceSubmission(row: PublicInvoiceSubmission): Promise<void> {
  if (isTauri()) {
    try {
      await invoke<void>("public_invoice_submission_save", { row });
      return;
    } catch {
      /* fallback pro dev bez tauri commandu */
    }
  }
  await browserSavePublicInvoiceSubmission(row);
}
