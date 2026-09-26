import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  fullName: text("full_name").notNull().default(""),
  email: varchar("email", { length: 320 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: varchar("role", { length: 16 }).notNull().default("user"),
  companyName: text("company_name").notNull().default(""),
  ico: text("ico").notNull().default(""),
  dic: text("dic").notNull().default(""),
  address: text("address").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const suppliers = pgTable("suppliers", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull().default(""),
  address: text("address").notNull().default(""),
  ico: text("ico").notNull().default(""),
  neplavecDph: boolean("neplavec_dph").notNull().default(true),
  bankAccount: text("bank_account").notNull().default(""),
  iban: text("iban").notNull().default(""),
  swift: text("swift").notNull().default(""),
  email: text("email").notNull().default(""),
  phone: text("phone").notNull().default(""),
  web: text("web").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const invoices = pgTable("invoices", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  number: text("number").notNull().default(""),
  status: varchar("status", { length: 16 }).notNull().default("unpaid"),
  payload: jsonb("payload").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const publicInvoiceSubmissions = pgTable("public_invoice_submissions", {
  id: uuid("id").defaultRandom().primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  source: text("source").notNull().default("public-free-invoice"),
  contactEmail: text("contact_email").notNull().default(""),
  gdprAccepted: boolean("gdpr_accepted").notNull().default(false),
  termsAccepted: boolean("terms_accepted").notNull().default(false),
  invoice: jsonb("invoice").notNull(),
});
