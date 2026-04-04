import QRCode from "qrcode";
import { invoiceTotal } from "./format";
import type { Invoice } from "./types";
import { buildSpayd } from "./spayd";

export async function buildInvoiceQrDataUrl(inv: Invoice): Promise<string> {
  const total = invoiceTotal(inv);
  const variableSymbol = inv.number.trim() || inv.constantSymbol.trim();
  const spaydLine = buildSpayd({
    iban: inv.supplier.iban,
    amount: total,
    vs: variableSymbol,
    msg: `Faktura ${variableSymbol || inv.number}`,
  });
  const qrPayload =
    spaydLine ??
    `Faktura — doplňte platný IBAN dodavatele v nastavení. Částka ${total.toFixed(2)} CZK, VS: ${variableSymbol.replace(/\D/g, "").slice(0, 10) || "—"}.`;
  return QRCode.toDataURL(qrPayload, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 240,
    color: { dark: "#0A010D", light: "#ffffff" },
  });
}
