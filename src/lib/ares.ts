import type { Buyer } from "./types";

const ARES_URL = "https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty";

/** Záznam z ARES (GET jeden subjekt i položka z vyhledávání). */
export function mapAresEconomicSubject(v: Record<string, unknown>): Buyer | null {
  const name = typeof v.obchodniJmeno === "string" ? v.obchodniJmeno : "";
  const sidlo = v.sidlo as Record<string, unknown> | undefined;
  const address = typeof sidlo?.textovaAdresa === "string" ? sidlo.textovaAdresa : "";
  const icoOut = typeof v.ico === "string" ? v.ico : "";
  const dic = typeof v.dic === "string" ? v.dic : "";
  if (!name || !icoOut) return null;
  return {
    name,
    address,
    ico: icoOut,
    dic,
  };
}

/** Stejná logika jako Tauri `fetch_ares` – veřejné API má CORS *. */
export async function fetchAresFromWeb(icoRaw: string, signal?: AbortSignal): Promise<Buyer> {
  const ico = icoRaw.trim().replace(/\s/g, "");
  if (ico.length < 8) {
    throw new Error("Zadejte platné IČO (8 číslic).");
  }
  const res = await fetch(`${ARES_URL}/${encodeURIComponent(ico)}`, {
    headers: { Accept: "application/json" },
    signal,
  });
  if (!res.ok) {
    throw new Error(`ARES odpověděl chybou (${res.status}).`);
  }
  const v = (await res.json()) as Record<string, unknown>;
  if (v.kod === "NENALEZENO") {
    throw new Error(typeof v.popis === "string" ? v.popis : "Subjekt nenalezen");
  }
  const mapped = mapAresEconomicSubject(v);
  if (!mapped) {
    throw new Error("ARES nevrátil název subjektu.");
  }
  return mapped;
}

function readEkonomickeSubjekty(data: Record<string, unknown>): unknown[] {
  const raw = data.ekonomickeSubjekty;
  return Array.isArray(raw) ? raw : [];
}

/**
 * POST /vyhledat – podle obchodního jména, nebo přesné IČO (8 číslic).
 * Vrací max. 5 záznamů (pořadí z ARES).
 */
export async function searchAresFromWeb(queryRaw: string, signal?: AbortSignal): Promise<Buyer[]> {
  const q = queryRaw.trim();
  if (!q) return [];

  const compact = q.replace(/\s/g, "");
  const digitsOnly = /^\d+$/.test(compact);

  if (digitsOnly) {
    if (compact.length === 8) {
      try {
        return [await fetchAresFromWeb(compact, signal)];
      } catch {
        return [];
      }
    }
    return [];
  }

  if (q.length < 2) return [];

  const res = await fetch(`${ARES_URL}/vyhledat`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ obchodniJmeno: q }),
    signal,
  });
  if (!res.ok) return [];

  const data = (await res.json()) as Record<string, unknown>;
  const list = readEkonomickeSubjekty(data);

  const out: Buyer[] = [];
  for (const item of list) {
    if (typeof item !== "object" || item === null) continue;
    const b = mapAresEconomicSubject(item as Record<string, unknown>);
    if (b) out.push(b);
    if (out.length >= 5) break;
  }
  return out;
}

/** Min. 2 znaky názvu, nebo přesných 8 číslic IČO – pak spouštíme dotaz do ARES. */
export function isAresClientSearchQuery(q: string): boolean {
  const t = q.trim();
  const d = t.replace(/\s/g, "");
  return t.length >= 2 || /^\d{8}$/.test(d);
}

/** Sloučí výsledky ARES s uloženými odběrateli (max. 5 celkem, bez duplicit IČ). */
export function mergeAresWithLocal(aresHits: Buyer[], local: Buyer[], query: string, max = 5): Buyer[] {
  const q = query.trim().toLowerCase();
  const compactIco = query.replace(/\s/g, "");
  const seen = new Set<string>();
  const out: Buyer[] = [];

  for (const b of aresHits) {
    if (out.length >= max) break;
    const key = b.ico || b.name;
    if (!key || seen.has(key)) continue;
    out.push(b);
    seen.add(key);
  }

  for (const b of local) {
    if (out.length >= max) break;
    const key = b.ico || b.name;
    if (!key || seen.has(key)) continue;
    const hay = `${b.name} ${b.ico} ${b.address}`.toLowerCase();
    if (hay.includes(q) || (compactIco.length >= 3 && b.ico.includes(compactIco))) {
      out.push(b);
      seen.add(key);
    }
  }

  return out;
}
