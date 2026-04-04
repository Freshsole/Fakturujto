import { invoiceTotal } from "./format";
import type { Buyer, StoredInvoice } from "./types";

export type BuyerDirectoryEntry = {
  buyer: Buyer;
  /** Počet faktur s datem vystavení v daném roce */
  invoicesThisYear: number;
  /** Součet částek (invoiceTotal) za tento rok */
  totalThisYear: number;
};

/**
 * Jedineční odběratelé z uložených faktur s agregací za kalendářní rok.
 * Jako klíč slouží IČ (jinak název). Poslední známá verze údajů z nejnovější faktury.
 */
export function buildBuyerDirectoryStats(
  invoices: StoredInvoice[],
  year = new Date().getFullYear(),
): BuyerDirectoryEntry[] {
  const sorted = [...invoices].sort((a, b) => b.id - a.id);
  const keyToBuyer = new Map<string, Buyer>();
  const keyCount = new Map<string, number>();
  const keySum = new Map<string, number>();

  for (const inv of sorted) {
    const key = (inv.buyer.ico || inv.buyer.name).trim();
    if (!key) continue;
    if (!keyToBuyer.has(key)) keyToBuyer.set(key, inv.buyer);
    const invYear = parseInt(inv.issueDate.slice(0, 4), 10);
    if (invYear === year) {
      keyCount.set(key, (keyCount.get(key) ?? 0) + 1);
      const add = invoiceTotal(inv);
      keySum.set(key, Math.round(((keySum.get(key) ?? 0) + add) * 100) / 100);
    }
  }

  const out: BuyerDirectoryEntry[] = [];
  for (const [key, buyer] of keyToBuyer) {
    out.push({
      buyer,
      invoicesThisYear: keyCount.get(key) ?? 0,
      totalThisYear: keySum.get(key) ?? 0,
    });
  }
  out.sort((a, b) => {
    if (b.invoicesThisYear !== a.invoicesThisYear) return b.invoicesThisYear - a.invoicesThisYear;
    if (b.totalThisYear !== a.totalThisYear) return b.totalThisYear - a.totalThisYear;
    return (a.buyer.name || "").localeCompare(b.buyer.name || "", "cs");
  });
  return out;
}
