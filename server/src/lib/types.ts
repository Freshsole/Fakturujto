import type { users } from "../db/schema.js";

export type UserRole = "admin" | "user";

export type PublicUser = {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  profile: {
    companyName: string;
    ico: string;
    dic: string;
    address: string;
  };
  createdAt: string;
};

export function toPublicUser(row: typeof users.$inferSelect): PublicUser {
  return {
    id: row.id,
    fullName: row.fullName,
    email: row.email,
    role: row.role === "admin" ? "admin" : "user",
    profile: {
      companyName: row.companyName,
      ico: row.ico,
      dic: row.dic,
      address: row.address,
    },
    createdAt: row.createdAt.toISOString(),
  };
}

export type SupplierBody = {
  name: string;
  address: string;
  ico: string;
  neplavecDph: boolean;
  bankAccount: string;
  iban: string;
  swift: string;
  email: string;
  phone: string;
  web: string;
};

export type InvoicePayload = {
  supplier: SupplierBody;
  buyer: { name: string; address: string; ico: string; dic: string };
  number: string;
  constantSymbol: string;
  issueDate: string;
  dueDate: string;
  paymentMethod: string;
  lineItems: Array<{
    description: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    highlighted?: boolean;
  }>;
  status: "paid" | "unpaid";
};

export type StoredInvoice = InvoicePayload & { id: number };
