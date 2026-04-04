/** Čísla účtu (část před lomítkem) — předvolba a číslo účtu. */
export const CZECH_ACCOUNT_BODY_REGEX = /^(?:([0-9]{2,6})-)?([0-9]{2,10})$/;

export type CzechBank = {
  code: string;
  name: string;
  swift: string;
};

/** Zdroj: Bank-codes.csv (kód, název, SWIFT). */
export const CZECH_BANKS: CzechBank[] = [
  { code: "0100", name: "Komerční banka, a.s.", swift: "KOMBCZPP" },
  { code: "0300", name: "Československá obchodní banka, a. s.", swift: "CEKOCZPP" },
  { code: "0600", name: "MONETA Money Bank, a.s.", swift: "AGBACZPP" },
  { code: "0710", name: "ČESKÁ NÁRODNÍ BANKA", swift: "CNBACZPP" },
  { code: "0800", name: "Česká spořitelna, a.s.", swift: "GIBACZPX" },
  { code: "2010", name: "Fio banka, a.s.", swift: "FIOBCZPP" },
  { code: "2060", name: "Citfin, spořitelní družstvo", swift: "CITFCZPP" },
  { code: "2070", name: "TRINITY BANK a.s.", swift: "MPUBCZPP" },
  { code: "2100", name: "ČSOB Hypoteční banka, a.s.", swift: "" },
  { code: "2200", name: "Peněžní dům, spořitelní družstvo", swift: "" },
  { code: "2220", name: "Artesa, spořitelní družstvo", swift: "ARTTCZPP" },
  { code: "2250", name: "Banka CREDITAS a.s.", swift: "CTASCZ22" },
  { code: "2260", name: "NEY spořitelní družstvo", swift: "" },
  { code: "2600", name: "Citibank Europe plc, organizační složka", swift: "CITICZPX" },
  { code: "2700", name: "UniCredit Bank Czech Republic and Slovakia, a.s.", swift: "BACXCZPP" },
  { code: "3030", name: "Air Bank a.s.", swift: "AIRACZPP" },
  { code: "3060", name: "PKO BP S.A., Czech Branch", swift: "BPKOCZPP" },
  { code: "3500", name: "ING Bank N.V.", swift: "INGBCZPP" },
  { code: "4300", name: "Národní rozvojová banka, a.s.", swift: "NROZCZPP" },
  { code: "5500", name: "Raiffeisenbank a.s.", swift: "RZBCCZPP" },
  { code: "5800", name: "J&T BANKA, a.s.", swift: "JTBPCZPP" },
  { code: "6000", name: "PPF banka a.s.", swift: "PMBPCZPP" },
  { code: "6200", name: "COMMERZBANK Aktiengesellschaft, pobočka Praha", swift: "COBACZPX" },
  { code: "6210", name: "mBank S.A., organizační složka", swift: "BREXCZPP" },
  { code: "6300", name: "BNP Paribas S.A., pobočka Česká republika", swift: "GEBACZPP" },
  { code: "6363", name: "Partners Banka, a.s.", swift: "PTBNCZPP" },
  { code: "6600", name: "Banking Circle S.A., Czech Republic", swift: "" },
  { code: "6700", name: "Všeobecná úverová banka a.s., pobočka Praha", swift: "SUBACZPP" },
  { code: "6800", name: "Sberbank CZ, a.s. v likvidaci", swift: "VBOECZ2X" },
  { code: "7910", name: "Deutsche Bank Aktiengesellschaft Filiale Prag", swift: "DEUTCZPX" },
  { code: "7950", name: "Raiffeisen stavební spořitelna a.s.", swift: "" },
  { code: "7960", name: "ČSOB Stavební spořitelna, a.s.", swift: "" },
  { code: "7970", name: "MONETA Stavební Spořitelna, a.s.", swift: "" },
  { code: "7990", name: "Modrá pyramida stavební spořitelna, a.s.", swift: "" },
  { code: "8030", name: "Volksbank Raiffeisenbank Nordoberpfalz eG", swift: "GENOCZ21" },
  { code: "8040", name: "Oberbank AG pobočka Česká republika", swift: "OBKLCZ2X" },
  { code: "8060", name: "Stavební spořitelna České spořitelny, a.s.", swift: "" },
  { code: "8090", name: "Česká exportní banka, a.s.", swift: "CZEECZPP" },
  { code: "8150", name: "HSBC Continental Europe, Czech Republic", swift: "MIDLCZPP" },
  { code: "8190", name: "Sparkasse Oberlausitz-Niederschlesien", swift: "" },
  { code: "8198", name: "FAS finance company s.r.o.", swift: "FFCSCZP1" },
  { code: "8220", name: "Payment execution s.r.o.", swift: "PAERCZP1" },
  { code: "8250", name: "Bank of China (CEE) Ltd. Prague Branch", swift: "BKCHCZPP" },
  { code: "8255", name: "Bank of Communications Co., Ltd., Prague Branch", swift: "COMMCZPP" },
  { code: "8265", name: "Industrial and Commercial Bank of China Limited", swift: "ICBKCZPP" },
  { code: "8500", name: "Multitude Bank p.l.c.", swift: "" },
  { code: "8610", name: "Devizová burza a.s.", swift: "" },
  { code: "8660", name: "PAYMONT, UAB", swift: "" },
];

export function parseStoredBankAccount(stored: string): { body: string; bankCode: string } {
  const t = stored.trim();
  const idx = t.lastIndexOf("/");
  if (idx === -1) return { body: t, bankCode: "" };
  return { body: t.slice(0, idx).trim(), bankCode: t.slice(idx + 1).trim().replace(/\s/g, "") };
}

export function joinBankAccount(body: string, bankCode: string): string {
  const b = body.trim();
  const c = bankCode.trim().replace(/\s/g, "");
  if (!b && !c) return "";
  if (!c) return b;
  if (!b) return `/${c}`;
  return `${b}/${c}`;
}

export function isValidAccountBody(body: string): boolean {
  const t = body.trim();
  if (t === "") return true;
  return CZECH_ACCOUNT_BODY_REGEX.test(t);
}

export function findCzechBankByCode(code: string): CzechBank | undefined {
  const c = code.replace(/\D/g, "");
  if (c.length !== 4) return undefined;
  return CZECH_BANKS.find((b) => b.code === c);
}
