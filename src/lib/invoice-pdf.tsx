import {
  Document,
  Font,
  Image,
  Link,
  Page,
  StyleSheet,
  Text,
  View,
  pdf,
} from "@react-pdf/renderer";
import interLatinExt400 from "@fontsource/inter/files/inter-latin-ext-400-normal.woff?url";
import interLatinExt400Italic from "@fontsource/inter/files/inter-latin-ext-400-italic.woff?url";
import interLatinExt500 from "@fontsource/inter/files/inter-latin-ext-500-normal.woff?url";
import interLatinExt700 from "@fontsource/inter/files/inter-latin-ext-700-normal.woff?url";
import interLatinExt900 from "@fontsource/inter/files/inter-latin-ext-900-normal.woff?url";
import { formatAmountCs, formatCzk, formatDateCs, invoiceTotal, lineTotal } from "./format";
import { formatIbanSpaced } from "./czech-iban";
import type { Invoice, LineItem } from "./types";
import { buildInvoiceQrDataUrl } from "./invoice-qr";

/** Sladěno s `invoice-template.html` (Tailwind slate + MD3 tokeny). */
const COLORS = {
  onSurface: "#1b1b1e",
  onSurfaceVariant: "#504251",
  surface: "#fbf9fc",
  surfaceLow: "#f5f3f6",
  surfaceHigh: "#e9e7ea",
  surfaceLowest: "#ffffff",
  outlineVariant: "#d4c1d3",
  primary: "#71008c",
  primaryContainer: "#9317b2",
  onPrimaryContainer: "#f7bdff",
  white: "#ffffff",
  /** Tailwind slate-500 — nadpisy „Platební údaje“, „Odběratel“ */
  slate500: "#64748b",
  /** Tailwind slate-400 — Účet, IBAN, … */
  slate400: "#94a3b8",
  slate600: "#475569",
};

/** Lokální Inter (WOFF) z npm, bez CDN. */
let fontsDone = false;
function registerFontsOnce(): void {
  if (fontsDone) return;
  fontsDone = true;
  Font.register({
    family: "Inter",
    fonts: [
      { src: interLatinExt400, fontWeight: 400 },
      { src: interLatinExt400Italic, fontWeight: 400, fontStyle: "italic" },
      { src: interLatinExt500, fontWeight: 500 },
      { src: interLatinExt700, fontWeight: 700 },
      { src: interLatinExt900, fontWeight: 900 },
    ],
  });
}

const styles = StyleSheet.create({
  page: {
    fontFamily: "Inter",
    fontSize: 9,
    color: COLORS.onSurface,
    paddingTop: 36,
    paddingBottom: 40,
    paddingHorizontal: 40,
  },
  title: {
    fontSize: 24,
    fontWeight: 800,
    marginBottom: 4,
  },
  vsLabel: {
    fontSize: 7,
    letterSpacing: 0.5,
    color: COLORS.slate500,
    fontWeight: 600,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  vsValue: {
    fontSize: 14,
    fontWeight: 600,
  },
  row: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
    alignItems: "stretch",
  },
  flex1: { flex: 1 },
  flex2: { flex: 2 },
  cardGrey: {
    backgroundColor: COLORS.surfaceLow,
    borderRadius: 10,
    padding: 12,
  },
  cardOutlined: {
    backgroundColor: COLORS.surfaceLowest,
    borderWidth: 1,
    borderColor: "#f1eaf3",
    borderRadius: 10,
    padding: 12,
  },
  /** Dodavatel — text-primary */
  cardTitlePrimary: {
    fontSize: 7,
    fontWeight: 700,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: COLORS.primary,
    marginBottom: 8,
  },
  /** Odběratel, Platební údaje — text-slate-500 */
  cardTitleMuted: {
    fontSize: 7,
    fontWeight: 700,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: COLORS.slate500,
    marginBottom: 8,
  },
  nameBold: {
    fontSize: 11,
    fontWeight: 700,
    marginBottom: 4,
  },
  bodyLine: {
    fontSize: 9,
    color: COLORS.onSurfaceVariant,
    marginBottom: 2,
  },
  supplierFooter: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#efe5f0",
    fontSize: 7,
    fontStyle: "italic",
    color: COLORS.slate400,
    lineHeight: 1.2,
  },
  paymentLabel: {
    fontSize: 7,
    color: COLORS.slate400,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  paymentValue: {
    fontSize: 9,
    fontWeight: 700,
    marginBottom: 8,
    color: COLORS.onSurface,
  },
  paymentGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: 12,
    rowGap: 6,
  },
  paymentHalfCell: {
    width: "48%",
  },
  paymentFullCell: {
    width: "100%",
  },
  /** Pravý sloupec: stejná výška jako platební box (flex stretch + třetiny). */
  paymentMetaColumn: {
    flex: 1,
    flexDirection: "column",
    gap: 8,
    minHeight: 0,
  },
  metaBox: {
    flex: 1,
    backgroundColor: COLORS.surfaceLowest,
    borderWidth: 1,
    borderColor: "#f1eaf3",
    borderRadius: 10,
    padding: 12,
    justifyContent: "center",
  },
  metaBoxLabel: {
    fontSize: 7,
    fontWeight: 700,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: COLORS.slate500,
    marginBottom: 4,
  },
  metaBoxValue: {
    fontSize: 16,
    fontWeight: 900,
    color: COLORS.onSurface,
  },
  dueBox: {
    flex: 1,
    backgroundColor: COLORS.primaryContainer,
    borderRadius: 10,
    padding: 12,
    justifyContent: "center",
  },
  dueLabel: {
    fontSize: 7,
    fontWeight: 700,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: COLORS.onPrimaryContainer,
    marginBottom: 4,
    opacity: 0.85,
  },
  dueValue: {
    fontSize: 16,
    fontWeight: 900,
    color: COLORS.onPrimaryContainer,
  },
  totalBar: {
    marginTop: 16,
    backgroundColor: COLORS.onSurface,
    borderRadius: 24,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  totalLeft: {
    flex: 1,
    paddingRight: 12,
  },
  totalLabel: {
    fontSize: 7,
    fontWeight: 700,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: COLORS.white,
    opacity: 0.6,
    marginBottom: 4,
  },
  totalAmount: {
    fontSize: 22,
    fontWeight: 900,
    color: COLORS.white,
  },
  totalSub: {
    fontSize: 9,
    fontWeight: 500,
    color: COLORS.white,
    opacity: 0.8,
    marginTop: 2,
  },
  qrWrap: {
    width: 88,
    height: 88,
    backgroundColor: COLORS.white,
    borderRadius: 8,
    padding: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  qrImg: {
    width: 76,
    height: 76,
  },
  contactRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
    marginTop: 14,
    paddingHorizontal: 2,
  },
  contactBlock: {
    minWidth: 120,
  },
  contactLabel: {
    fontSize: 7,
    fontWeight: 700,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: COLORS.slate400,
    marginBottom: 3,
  },
  contactValue: {
    fontSize: 9,
  },
  link: {
    color: COLORS.primary,
    textDecoration: "none",
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 700,
    color: COLORS.onSurface,
  },
  sectionHeader: {
    marginTop: 18,
    marginBottom: 8,
    paddingHorizontal: 2,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  lineCountBadge: {
    backgroundColor: COLORS.surfaceHigh,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    fontSize: 7,
    fontWeight: 700,
    color: COLORS.slate600,
  },
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#efe5f0",
    paddingBottom: 6,
    paddingTop: 2,
    paddingHorizontal: 8,
    marginBottom: 0,
  },
  th: {
    fontSize: 7,
    fontWeight: 700,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: COLORS.slate400,
  },
  tableRow: {
    flexDirection: "row",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 8,
    marginTop: 4,
    alignItems: "center",
  },
  rowHighlight: {
    borderLeftWidth: 2,
    borderLeftColor: COLORS.primary,
    paddingLeft: 6,
    marginLeft: -6,
  },
});

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

function AddressLines({ text }: { text: string }) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  return (
    <>
      {lines.map((line, i) => (
        <Text key={i} style={styles.bodyLine}>
          {line.trim()}
        </Text>
      ))}
    </>
  );
}

function LineItemRow({ row, index }: { row: LineItem; index: number }) {
  const lt = lineTotal(row);
  const qtyStr = formatQtyCs(row.quantity);
  const stripeStyle = { backgroundColor: index % 2 === 0 ? COLORS.surfaceLowest : COLORS.surface };
  return (
    <View wrap={false} style={[styles.tableRow, stripeStyle, row.highlighted ? styles.rowHighlight : {}]}>
      <View style={{ width: "42%" }}>
        <Text style={{ fontSize: 9, fontWeight: 700 }}>{row.description}</Text>
      </View>
      <View style={{ width: "18%", alignItems: "flex-end" }}>
        <Text style={{ fontSize: 9, color: COLORS.onSurfaceVariant }}>
          {qtyStr} {row.unit}
        </Text>
      </View>
      <View style={{ width: "20%", alignItems: "flex-end" }}>
        <Text style={{ fontSize: 9, color: COLORS.onSurfaceVariant }}>{formatCzk(row.unitPrice)}</Text>
      </View>
      <View style={{ width: "20%", alignItems: "flex-end" }}>
        <Text style={{ fontSize: 9, fontWeight: 700 }}>{formatCzk(lt)}</Text>
      </View>
    </View>
  );
}

export type InvoicePdfDocumentProps = {
  inv: Invoice;
  qrDataUrl: string;
};

export function InvoicePdfDocument({ inv, qrDataUrl }: InvoicePdfDocumentProps) {
  registerFontsOnce();
  const total = invoiceTotal(inv);
  const variableSymbol = inv.number.trim() || inv.constantSymbol.trim();
  const vsDisplay = variableSymbol.length > 0 ? variableSymbol : "—";
  const supplierVatLine = inv.supplier.neplavecDph ? "Neplátce DPH" : "Plátce DPH";
  const buyerDic = inv.buyer.dic.trim() || "—";
  const ibanDisplay = formatIbanSpaced(inv.supplier.iban) || "—";
  const swiftDisplay = inv.supplier.swift.trim() || "—";
  const bankAccount = inv.supplier.bankAccount.trim() || "—";

  const e = inv.supplier.email.trim();
  const p = inv.supplier.phone.trim();
  const w = inv.supplier.web.trim();

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Faktura</Text>
        <Text style={styles.vsLabel}>Číslo dokladu (variabilní symbol)</Text>
        <Text style={styles.vsValue}>{vsDisplay}</Text>

        <View style={styles.row}>
          <View style={[styles.cardGrey, styles.flex1]}>
            <Text style={styles.cardTitlePrimary}>Dodavatel</Text>
            <Text style={styles.nameBold}>{inv.supplier.name}</Text>
            <AddressLines text={inv.supplier.address} />
            <Text style={[styles.bodyLine, { marginTop: 4 }]}>IČ: {inv.supplier.ico}</Text>
            <Text style={styles.bodyLine}>{supplierVatLine}</Text>
            <Text style={styles.supplierFooter}>
              Podnikatel je zapsán v živnostenském rejstříku.
            </Text>
          </View>
          <View style={[styles.cardOutlined, styles.flex1]}>
            <Text style={styles.cardTitleMuted}>Odběratel</Text>
            <Text style={styles.nameBold}>{inv.buyer.name}</Text>
            <AddressLines text={inv.buyer.address} />
            <Text style={[styles.bodyLine, { marginTop: 4 }]}>IČ: {inv.buyer.ico}</Text>
            <Text style={styles.bodyLine}>DIČ: {buyerDic}</Text>
          </View>
        </View>

        <View style={styles.row}>
          <View style={[styles.cardGrey, styles.flex2]}>
            <Text style={styles.cardTitleMuted}>Platební údaje</Text>
            <View style={styles.paymentGrid}>
              <View style={styles.paymentHalfCell}>
                <Text style={styles.paymentLabel}>Účet</Text>
                <Text style={styles.paymentValue}>{bankAccount}</Text>
              </View>
              <View style={styles.paymentHalfCell}>
                <Text style={styles.paymentLabel}>Metoda</Text>
                <Text style={styles.paymentValue}>{inv.paymentMethod}</Text>
              </View>
              <View style={styles.paymentFullCell}>
                <Text style={styles.paymentLabel}>IBAN</Text>
                <Text style={styles.paymentValue}>{ibanDisplay}</Text>
              </View>
              <View style={styles.paymentHalfCell}>
                <Text style={styles.paymentLabel}>SWIFT / BIC</Text>
                <Text style={[styles.paymentValue, { marginBottom: 0 }]}>{swiftDisplay}</Text>
              </View>
            </View>
          </View>
          <View style={styles.paymentMetaColumn}>
            <View style={styles.metaBox}>
              <Text style={styles.metaBoxLabel}>Vystaveno</Text>
              <Text style={styles.metaBoxValue}>{formatDateCs(inv.issueDate)}</Text>
            </View>
            <View style={styles.dueBox}>
              <Text style={styles.dueLabel}>Splatnost</Text>
              <Text style={styles.dueValue}>{formatDateCs(inv.dueDate)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.totalBar}>
          <View style={styles.totalLeft}>
            <Text style={styles.totalLabel}>Celkem k úhradě</Text>
            <Text style={styles.totalAmount}>{formatAmountCs(total)}</Text>
            <Text style={styles.totalSub}>českých korun</Text>
          </View>
          <View style={styles.qrWrap}>
            <Image src={qrDataUrl} style={styles.qrImg} />
          </View>
        </View>

        {(e || p || w) && (
          <View style={styles.contactRow}>
            {e ? (
              <View style={styles.contactBlock}>
                <Text style={styles.contactLabel}>Email</Text>
                <Link src={`mailto:${e}`} style={styles.link}>
                  <Text style={[styles.contactValue, styles.link]}>{e}</Text>
                </Link>
              </View>
            ) : null}
            {p ? (
              <View style={styles.contactBlock}>
                <Text style={styles.contactLabel}>Telefon</Text>
                <Text style={styles.contactValue}>{p}</Text>
              </View>
            ) : null}
            {w ? (
              <View style={styles.contactBlock}>
                <Text style={styles.contactLabel}>Web</Text>
                <Link src={webHref(w)} style={styles.link}>
                  <Text style={[styles.contactValue, styles.link]}>{w}</Text>
                </Link>
              </View>
            ) : null}
          </View>
        )}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Položky faktury</Text>
          <Text style={styles.lineCountBadge}>{lineCountLabel(inv.lineItems.length)}</Text>
        </View>
        <View style={styles.tableHeader}>
          <Text style={[styles.th, { width: "42%" }]}>Popis úkonu</Text>
          <Text style={[styles.th, { width: "18%", textAlign: "right" }]}>Množství</Text>
          <Text style={[styles.th, { width: "20%", textAlign: "right" }]}>Cena / j.</Text>
          <Text style={[styles.th, { width: "20%", textAlign: "right" }]}>Celkem</Text>
        </View>
        {inv.lineItems.map((row, i) => (
          <LineItemRow key={i} row={row} index={i} />
        ))}
      </Page>
    </Document>
  );
}

function pdfFileName(inv: Invoice): string {
  const base = inv.number.trim() || (inv.id != null ? String(inv.id) : "faktura");
  const safe = base.replace(/[/\\?%*:|"<>]/g, "-").slice(0, 80);
  return `faktura-${safe}.pdf`;
}

export async function downloadInvoicePdfReact(inv: Invoice): Promise<void> {
  registerFontsOnce();
  const qrDataUrl = await buildInvoiceQrDataUrl(inv);
  const blob = await pdf(<InvoicePdfDocument inv={inv} qrDataUrl={qrDataUrl} />).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = pdfFileName(inv);
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
