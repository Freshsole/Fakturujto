export type Supplier = {
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

export type Buyer = {
  name: string;
  address: string;
  ico: string;
  dic: string;
};

export type LineItem = {
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  /** Barevný pruh vlevo na faktuře (jako „Odměny“ ve šabloně) */
  highlighted?: boolean;
};

export type InvoiceStatus = "paid" | "unpaid";

export type Invoice = {
  id?: number;
  supplier: Supplier;
  buyer: Buyer;
  number: string;
  constantSymbol: string;
  issueDate: string;
  dueDate: string;
  paymentMethod: string;
  lineItems: LineItem[];
  status: InvoiceStatus;
};

export type StoredInvoice = Invoice & { id: number };
