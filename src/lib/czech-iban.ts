import { CZECH_ACCOUNT_BODY_REGEX } from "../data/bank-codes";

/** Modulo 97 pro dlouhé číselné řetězce (ISO 13616 / ISO 7064). */
function mod97String(digits: string): number {
  let r = 0;
  for (let i = 0; i < digits.length; i++) {
    r = (r * 10 + parseInt(digits[i], 10)) % 97;
  }
  return r;
}

/**
 * Z části účtu před lomítkem (např. 19-1234567890 nebo 123-456) vytvoří 6+10 číslic pro BBAN.
 */
export function parseCzechAccountBodyForIban(body: string): { prefix6: string; account10: string } | null {
  const t = body.trim();
  const m = t.match(CZECH_ACCOUNT_BODY_REGEX);
  if (!m) return null;
  const prefixRaw = (m[1] ?? "").replace(/\D/g, "");
  const accountRaw = m[2].replace(/\D/g, "");
  const prefix6 = prefixRaw.padStart(6, "0").slice(-6);
  const account10 = accountRaw.padStart(10, "0").slice(-10);
  return { prefix6, account10 };
}

/**
 * Český IBAN bez mezer (24 znaků): CZ + 2 kontrolní + 20 číslic BBAN (4 kód banky + 16 číslo účtu).
 */
export function computeCzechIban(bankCode4: string, accountBody: string): string | null {
  const bank = bankCode4.replace(/\D/g, "").padStart(4, "0").slice(-4);
  if (bank.length !== 4) return null;
  const parts = parseCzechAccountBodyForIban(accountBody);
  if (!parts) return null;
  const bban = bank + parts.prefix6 + parts.account10;
  if (bban.length !== 20) return null;
  const extended = bban + "123500";
  const remainder = mod97String(extended);
  const check = String(98 - remainder).padStart(2, "0");
  return `CZ${check}${bban}`;
}

export function formatIbanSpaced(iban: string): string {
  const clean = iban.replace(/\s/g, "").toUpperCase();
  if (!clean) return "";
  return clean.replace(/(.{4})/g, "$1 ").trim();
}
