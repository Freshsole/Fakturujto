import type { StoredInvoice } from "./types";

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function plusDaysIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Next invoice number as YYYY + 4-digit sequence based on existing numbers. */
export function suggestedNumber(invoices: StoredInvoice[]): string {
  const y = new Date().getFullYear();
  const prefix = String(y);
  let max = 0;
  for (const inv of invoices) {
    const n = inv.number;
    if (n.startsWith(prefix) && n.length >= prefix.length + 1) {
      const rest = parseInt(n.slice(prefix.length), 10);
      if (!Number.isNaN(rest)) max = Math.max(max, rest);
    }
  }
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}
