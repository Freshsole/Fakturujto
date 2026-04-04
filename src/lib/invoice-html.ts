import templateRaw from "../assets/invoice-template.html?raw";
import { formatIbanSpaced } from "./czech-iban";
import { formatAmountCs, formatCzk, formatDateCs, invoiceTotal, lineTotal } from "./format";
import { buildInvoiceQrDataUrl } from "./invoice-qr";
import { downloadInvoicePdfReact } from "./invoice-pdf";
import type { Invoice, LineItem } from "./types";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/'/g, "&#39;");
}

function addressToHtml(address: string): string {
  return escapeHtml(address).replace(/\n/g, "<br/>");
}

function replaceAll(src: string, key: string, value: string): string {
  return src.split(key).join(value);
}

function formatQtyCs(n: number): string {
  return new Intl.NumberFormat("cs-CZ", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function lineCountLabel(n: number): string {
  if (n === 1) return "1 POLOŽKA";
  if (n >= 2 && n <= 4) return `${n} POLOŽKY`;
  return `${n} POLOŽEK`;
}

function webHref(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t.replace(/^\/+/, "")}`;
}

function buildContactBlock(email: string, phone: string, web: string): string {
  const e = email.trim();
  const p = phone.trim();
  const w = web.trim();
  if (!e && !p && !w) {
    return '<p class="text-[0.625rem] text-slate-400 px-1 leading-relaxed">Kontaktní údaje dodavatele nejsou vyplněny. Doplňte je v <span class="font-semibold text-slate-500">Nastavení dodavatele</span> (e-mail, telefon, web).</p>';
  }
  let html =
    '<div class="invoice-contact-row flex flex-col sm:flex-row flex-wrap gap-x-6 gap-y-2 px-1 text-xs">';
  if (e) {
    html += `<div><p class="text-[0.625rem] uppercase tracking-[0.05em] font-bold text-slate-400 mb-0.5">Email</p><a class="font-medium text-primary hover:underline break-all" href="mailto:${escapeAttr(e)}">${escapeHtml(e)}</a></div>`;
  }
  if (p) {
    html += `<div><p class="text-[0.625rem] uppercase tracking-[0.05em] font-bold text-slate-400 mb-0.5">Telefon</p><p class="font-medium tabular-numbers">${escapeHtml(p)}</p></div>`;
  }
  if (w) {
    const href = webHref(w);
    html += `<div><p class="text-[0.625rem] uppercase tracking-[0.05em] font-bold text-slate-400 mb-0.5">Web</p><a class="font-medium text-primary hover:underline break-all" href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(w)}</a></div>`;
  }
  html += "</div>";
  return html;
}

function buildLineItemsHtml(items: LineItem[]): string {
  return items
    .map((row, i) => {
      const lt = lineTotal(row);
      const qtyStr = formatQtyCs(row.quantity);
      const stripe = i % 2 === 0 ? "bg-surface-container-lowest" : "bg-surface";
      const hi = row.highlighted ? " border-l-2 border-primary" : "";
      const rowClass = `grid grid-cols-12 gap-2 px-2 py-2 ${stripe} rounded-lg items-center text-xs${hi}`;
      return `<div class="${rowClass}">
<div class="col-span-6 font-semibold">${escapeHtml(row.description)}</div>
<div class="col-span-2 text-right tabular-numbers text-on-surface-variant">${escapeHtml(qtyStr)} ${escapeHtml(row.unit)}</div>
<div class="col-span-2 text-right tabular-numbers text-on-surface-variant">${formatCzk(row.unitPrice)}</div>
<div class="col-span-2 text-right font-bold tabular-numbers">${formatCzk(lt)}</div>
</div>`;
    })
    .join("");
}

export async function buildInvoiceHtml(inv: Invoice): Promise<string> {
  const total = invoiceTotal(inv);
  const variableSymbol = inv.number.trim() || inv.constantSymbol.trim();
  const qrDataUrl = await buildInvoiceQrDataUrl(inv);

  const supplierVatLine = inv.supplier.neplavecDph ? "Neplátce DPH" : "Plátce DPH";

  const buyerDicLine = inv.buyer.dic.trim()
    ? `<span class="opacity-50">DIČ:</span> ${escapeHtml(inv.buyer.dic)}`
    : '<span class="opacity-50">DIČ:</span> —';

  const lineItemsHtml = buildLineItemsHtml(inv.lineItems);
  const contactBlock = buildContactBlock(inv.supplier.email, inv.supplier.phone, inv.supplier.web);

  let html = templateRaw;
  const ibanDisplay = formatIbanSpaced(inv.supplier.iban) || "—";
  const swiftDisplay = inv.supplier.swift.trim() || "—";

  const map: Record<string, string> = {
    "{{VARIABLE_SYMBOL}}": escapeHtml(variableSymbol.length > 0 ? variableSymbol : "—"),
    "{{PAYMENT_METHOD}}": escapeHtml(inv.paymentMethod),
    "{{SUPPLIER_NAME}}": escapeHtml(inv.supplier.name),
    "{{SUPPLIER_ADDRESS}}": addressToHtml(inv.supplier.address),
    "{{SUPPLIER_IC}}": escapeHtml(inv.supplier.ico),
    "{{SUPPLIER_VAT_LINE}}": escapeHtml(supplierVatLine),
    "{{BUYER_NAME}}": escapeHtml(inv.buyer.name),
    "{{BUYER_ADDRESS}}": addressToHtml(inv.buyer.address),
    "{{BUYER_IC}}": escapeHtml(inv.buyer.ico),
    "{{BUYER_DIC_LINE}}": buyerDicLine,
    "{{ISSUE_DATE}}": escapeHtml(formatDateCs(inv.issueDate)),
    "{{DUE_DATE}}": escapeHtml(formatDateCs(inv.dueDate)),
    "{{BANK_ACCOUNT}}": escapeHtml(inv.supplier.bankAccount.trim() || "—"),
    "{{IBAN}}": escapeHtml(ibanDisplay),
    "{{SWIFT}}": escapeHtml(swiftDisplay),
    "{{LINE_ITEMS_HTML}}": lineItemsHtml,
    "{{LINE_COUNT_LABEL}}": escapeHtml(lineCountLabel(inv.lineItems.length)),
    "{{TOTAL_AMOUNT}}": escapeHtml(formatAmountCs(total)),
    "{{QR_DATA_URL}}": qrDataUrl,
    "{{CONTACT_BLOCK}}": contactBlock,
  };
  for (const [k, v] of Object.entries(map)) {
    html = replaceAll(html, k, v);
  }
  return html;
}

const TAILWIND_SETTLE_MS = 2000;

/**
 * Jediný spolehlivý výstup jako dřív: stejná HTML šablona + tiskové styly prohlížeče.
 * V dialogu zvolte „Uložit jako PDF“ (nebo tiskárnu).
 */
export async function printInvoicePdf(inv: Invoice): Promise<void> {
  const html = await buildInvoiceHtml(inv);
  const iframe = document.createElement("iframe");
  iframe.setAttribute(
    "style",
    "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden",
  );
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument;
  if (!doc) {
    iframe.remove();
    throw new Error("Nelze vytvořit náhled tisku.");
  }
  const win = iframe.contentWindow;
  if (!win) {
    iframe.remove();
    throw new Error("Nelze vytvořit náhled tisku.");
  }
  doc.open();
  doc.write(html);
  doc.close();

  const cleanup = () => {
    iframe.remove();
  };

  const runPrint = () => {
    setTimeout(() => {
      doc.title = "\u200b";
      win.focus();
      win.print();
      setTimeout(cleanup, 1200);
    }, TAILWIND_SETTLE_MS);
  };

  if (doc.readyState === "complete") {
    runPrint();
  } else {
    win.addEventListener("load", runPrint, { once: true });
  }
}

/** Vektorové PDF (@react-pdf/renderer) — přímé stažení souboru bez tiskového dialogu. */
export async function downloadInvoicePdf(inv: Invoice): Promise<void> {
  await downloadInvoicePdfReact(inv);
}
