export function formatCzk(amount: number): string {
  return (
    new Intl.NumberFormat("cs-CZ", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount) + " Kč"
  );
}

export function formatCzkCompact(amount: number): string {
  return new Intl.NumberFormat("cs-CZ", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount) + " Kč";
}

/** ISO yyyy-mm-dd → d. m. yyyy */
export function formatDateCs(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map((x) => parseInt(x, 10));
  if (!y || !m || !d) return iso;
  return `${d}. ${m}. ${y}`;
}

/** Vstup „14. 5. 2024“ / „14.05.2024“ → ISO yyyy-mm-dd nebo null */
export function parseDateCs(s: string): string | null {
  const t = s.trim().replace(/\s+/g, "");
  const m = t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return null;
  const d = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  const y = parseInt(m[3], 10);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Částka bez měny (např. buňka cena/j.) */
export function formatAmountCs(amount: number): string {
  return new Intl.NumberFormat("cs-CZ", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/** „2 500,00“ / „2500,5“ → číslo */
export function parseAmountCs(s: string): number | null {
  const t = s.trim().replace(/\s/g, "").replace(",", ".");
  if (t === "" || t === "-") return null;
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

/** Z řetězce před kurzorem vytvoří „čistý“ prefix (číslice + max. jedna desetinná čárka). */
function cleanAmountPrefix(raw: string, end: number): string {
  let out = "";
  let hasSep = false;
  const lim = Math.min(end, raw.length);
  for (let i = 0; i < lim; i++) {
    const ch = raw[i];
    if (/\d/.test(ch)) out += ch;
    else if ((ch === "," || ch === ".") && !hasSep) {
      out += ",";
      hasSep = true;
    }
  }
  return out;
}

/** Celý vstup → čistý řetězec číslic a jedné čárky. */
function cleanAmountFull(raw: string): string {
  return cleanAmountPrefix(raw, raw.length);
}

function formatIntWithSpaces(intDigits: string): string {
  if (!intDigits) return "";
  let res = "";
  let n = 0;
  for (let i = intDigits.length - 1; i >= 0; i--) {
    if (n > 0 && n % 3 === 0) res = " " + res;
    res = intDigits[i] + res;
    n++;
  }
  return res;
}

/**
 * Formátuje částku při psaní (mezery v celé části), zachová pozici kurzoru.
 */
export function formatAmountWhileTyping(raw: string, cursor: number): { text: string; cursor: number } {
  const full = cleanAmountFull(raw);
  const comma = full.indexOf(",");
  const intRaw = comma === -1 ? full : full.slice(0, comma);
  const decRaw = comma === -1 ? "" : full.slice(comma + 1);
  const intDigits = intRaw.replace(/\D/g, "");
  const decDigits = decRaw.replace(/\D/g, "").slice(0, 4);

  let formatted = formatIntWithSpaces(intDigits);
  if (comma !== -1) {
    formatted += "," + decDigits;
  }

  const prefixClean = cleanAmountPrefix(raw, Math.min(cursor, raw.length));
  let best = 0;
  for (let pos = 0; pos <= formatted.length; pos++) {
    if (cleanAmountPrefix(formatted, pos) === prefixClean) best = pos;
  }
  return { text: formatted, cursor: best };
}

export function lineTotal(item: { quantity: number; unitPrice: number }): number {
  return Math.round(item.quantity * item.unitPrice * 100) / 100;
}

export function invoiceTotal(inv: { lineItems: { quantity: number; unitPrice: number }[] }): number {
  return Math.round(inv.lineItems.reduce((s, l) => s + lineTotal(l), 0) * 100) / 100;
}
