/**
 * Czech Short Payment Descriptor (SPAYD) for QR payments.
 * @see https://qr-platba.cz/pro-vyvojare/specifikace-formatu/
 */

function normalizeIban(raw: string): string {
  return raw.replace(/\s/g, "").toUpperCase();
}

/** Minimální kontrola formátu IBAN před QR (bez kontrolních číslic). */
export function isIbanPlausibleForSpayd(iban: string): boolean {
  const acc = normalizeIban(iban);
  return /^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(acc) && acc.length >= 15 && acc.length <= 34;
}

/**
 * Vrátí řetězec SPD*1.0… pro QR platbu, nebo `null` pokud chybí platný IBAN.
 */
export function buildSpayd(params: {
  iban: string;
  amount: number;
  vs: string;
  msg?: string;
}): string | null {
  const acc = normalizeIban(params.iban);
  if (!isIbanPlausibleForSpayd(acc)) return null;

  const am = params.amount.toFixed(2);
  const vs = params.vs.replace(/\D/g, "").slice(0, 10);
  let msg = (params.msg ?? "").replace(/\*/g, " ").slice(0, 60);
  msg = msg.trim();

  const cc = acc.startsWith("SK") ? "EUR" : "CZK";
  const parts = ["SPD*1.0", `ACC:${acc}`, `AM:${am}`, `CC:${cc}`, `VS:${vs}`];
  if (msg.length > 0) {
    parts.push(`MSG:${msg}`);
  }
  return parts.join("*");
}
