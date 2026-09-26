import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type ReactNode,
} from "react";
import {
  Link,
  Navigate,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import {
  apiDeleteInvoice,
  apiFetchAres,
  apiGetSupplier,
  apiListInvoices,
  apiSavePublicInvoiceSubmission,
  apiSaveInvoice,
  apiSaveSupplier,
} from "./lib/api";
import {
  changePassword,
  clearSession,
  deleteUser,
  fetchSessionUser,
  inviteUser,
  listUsers,
  loginUser,
  registerUser,
  updateUserRole,
  type AppUser,
  type UserRole,
} from "./lib/auth";
import { todayIso, plusDaysIso, suggestedNumber } from "./lib/dates-and-numbers";
import {
  formatAmountCs,
  formatAmountWhileTyping,
  formatCzk,
  formatDateCs,
  invoiceTotal,
  lineTotal,
  parseAmountCs,
  parseDateCs,
} from "./lib/format";
import { isAresClientSearchQuery, mergeAresWithLocal, searchAresFromWeb } from "./lib/ares";
import { buildBuyerDirectoryStats, type BuyerDirectoryEntry } from "./lib/buyer-directory";
import { downloadInvoicePdf } from "./lib/invoice-html";
import type { Buyer, Invoice, InvoiceStatus, LineItem, StoredInvoice, Supplier } from "./lib/types";
import { BankAccountField } from "./components/BankAccountField";
import { EditorialDateField } from "./components/EditorialDateField";
import { findCzechBankByCode, isValidAccountBody, parseStoredBankAccount } from "./data/bank-codes";
import { computeCzechIban, formatIbanSpaced } from "./lib/czech-iban";
import fakturujtoLogoFull from "./assets/fakturujto-logo-full.svg";

function emptyBuyer(): Buyer {
  return { name: "", address: "", ico: "", dic: "" };
}

function emptyLine(): LineItem {
  return { description: "", quantity: 1, unit: "ks", unitPrice: 0, highlighted: false };
}

function newInvoice(supplier: Supplier, invoices: StoredInvoice[]): Invoice {
  return {
    supplier: structuredClone(supplier),
    buyer: emptyBuyer(),
    number: suggestedNumber(invoices),
    constantSymbol: "0308",
    issueDate: todayIso(),
    dueDate: plusDaysIso(14),
    paymentMethod: "Převodem",
    lineItems: [emptyLine()],
    status: "unpaid",
  };
}

function Icon({
  name,
  filled,
  className = "text-base",
}: {
  name: string;
  filled?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`material-symbols-outlined ${className}`}
      style={filled ? { fontVariationSettings: "'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24" } : undefined}
    >
      {name}
    </span>
  );
}

function navItemClass(active: boolean) {
  return active
    ? "flex items-center gap-2.5 px-3 py-2.5 bg-white text-primary rounded-lg shadow-geist-sm border border-outline-variant/50 text-sm font-semibold geist-transition cursor-pointer w-full text-left"
    : "flex items-center gap-2.5 px-3 py-2.5 text-ink/65 hover:bg-white/60 geist-transition cursor-pointer rounded-lg group text-sm w-full text-left";
}

type InvoiceEditorRouteExtras = {
  clientQuery: string;
  setClientQuery: (s: string) => void;
  setBuyerDropdownSuppressed: (v: boolean) => void;
  buyerDropdownSuppressed: boolean;
  buyerSuggestions: Buyer[];
  aresSearchLoading: boolean;
  aresDropdownEmpty: boolean;
  onSelectBuyer: (b: Buyer) => void;
  onSave: () => void;
  onSaveAndIssue: () => void;
  onDelete: () => void;
  onTogglePaid: () => void;
  onPdf: () => void;
  busy: boolean;
  buyerDirectory: BuyerDirectoryEntry[];
  showPastBuyersDirectory: boolean;
};

const LS_PENDING_FREE_INVOICE = "fakturujto_pending_free_invoice_v1";

function guestSupplier(): Supplier {
  return {
    name: "",
    address: "",
    ico: "",
    neplavecDph: true,
    bankAccount: "",
    iban: "",
    swift: "",
    email: "",
    phone: "",
    web: "",
  };
}

function savePendingFreeInvoice(inv: Invoice): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(LS_PENDING_FREE_INVOICE, JSON.stringify(inv));
}

function consumePendingFreeInvoice(): Invoice | null {
  if (typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem(LS_PENDING_FREE_INVOICE);
  if (!raw) return null;
  localStorage.removeItem(LS_PENDING_FREE_INVOICE);
  try {
    const parsed = JSON.parse(raw) as Invoice;
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.lineItems)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function NewInvoicePage(
  props: {
    supplierProfile: Supplier;
    invoices: StoredInvoice[];
    navigate: ReturnType<typeof useNavigate>;
    draft: Invoice | null;
    setDraft: (d: Invoice | null) => void;
  } & InvoiceEditorRouteExtras,
) {
  const { supplierProfile, invoices, navigate, draft, setDraft, ...ed } = props;

  useEffect(() => {
    if (!supplierProfile) return;
    setDraft(newInvoice(supplierProfile, invoices));
    ed.setClientQuery("");
    ed.setBuyerDropdownSuppressed(false);
    return () => setDraft(null);
    // invoices záměrně mimo závislosti — obnova seznamu z API by neměla smazat rozpracovanou fakturu
    // eslint-disable-next-line react-hooks/exhaustive-deps -- init jen při vstupu / změně profilu dodavatele
  }, [supplierProfile]);

  if (!draft) {
    return <p className="text-xs text-on-surface-variant p-6">Připravuji formulář…</p>;
  }

  return (
    <InvoiceEditor
      draft={draft}
      setDraft={setDraft}
      clientQuery={ed.clientQuery}
      setClientQuery={(v) => {
        ed.setBuyerDropdownSuppressed(false);
        ed.setClientQuery(v);
      }}
      setBuyerDropdownSuppressed={ed.setBuyerDropdownSuppressed}
      buyerDropdownSuppressed={ed.buyerDropdownSuppressed}
      buyerSuggestions={ed.buyerSuggestions}
      aresSearchLoading={ed.aresSearchLoading}
      aresDropdownEmpty={ed.aresDropdownEmpty}
      onSelectBuyer={ed.onSelectBuyer}
      onSave={ed.onSave}
      onSaveAndIssue={ed.onSaveAndIssue}
      onDelete={ed.onDelete}
      onTogglePaid={ed.onTogglePaid}
      onPdf={ed.onPdf}
      onCancel={() => navigate("/prehled")}
      busy={ed.busy}
      buyerDirectory={props.buyerDirectory}
      showPastBuyersDirectory={props.showPastBuyersDirectory}
    />
  );
}

function EditInvoicePage(
  props: {
    invoices: StoredInvoice[];
    navigate: ReturnType<typeof useNavigate>;
    draft: Invoice | null;
    setDraft: (d: Invoice | null) => void;
  } & InvoiceEditorRouteExtras,
) {
  const { id: invoiceId } = useParams<{ id: string }>();
  const { invoices, navigate, draft, setDraft, ...ed } = props;

  useEffect(() => {
    if (!invoiceId) {
      navigate("/faktury", { replace: true });
      return;
    }
    const numId = Number(invoiceId);
    if (!Number.isFinite(numId)) {
      navigate("/faktury", { replace: true });
      return;
    }
    const inv = invoices.find((i) => i.id === numId);
    if (!inv) {
      if (invoices.length === 0) return;
      navigate("/faktury", { replace: true });
      return;
    }
    setDraft(structuredClone(inv));
    ed.setClientQuery(inv.buyer.name);
    ed.setBuyerDropdownSuppressed(true);
    return () => setDraft(null);
  }, [invoiceId, invoices, navigate]);

  if (!invoiceId || !draft || draft.id !== Number(invoiceId)) {
    return <p className="text-xs text-on-surface-variant p-6">Načítám fakturu…</p>;
  }

  return (
    <InvoiceEditor
      draft={draft}
      setDraft={setDraft}
      clientQuery={ed.clientQuery}
      setClientQuery={(v) => {
        ed.setBuyerDropdownSuppressed(false);
        ed.setClientQuery(v);
      }}
      setBuyerDropdownSuppressed={ed.setBuyerDropdownSuppressed}
      buyerDropdownSuppressed={ed.buyerDropdownSuppressed}
      buyerSuggestions={ed.buyerSuggestions}
      aresSearchLoading={ed.aresSearchLoading}
      aresDropdownEmpty={ed.aresDropdownEmpty}
      onSelectBuyer={ed.onSelectBuyer}
      onSave={ed.onSave}
      onSaveAndIssue={ed.onSaveAndIssue}
      onDelete={ed.onDelete}
      onTogglePaid={ed.onTogglePaid}
      onPdf={ed.onPdf}
      onCancel={() => navigate("/prehled")}
      busy={ed.busy}
      buyerDirectory={props.buyerDirectory}
      showPastBuyersDirectory={props.showPastBuyersDirectory}
    />
  );
}

function PublicInvoicePage(
  props: {
    navigate: ReturnType<typeof useNavigate>;
    draft: Invoice | null;
    setDraft: (d: Invoice | null) => void;
    onSelectBuyer: (b: Buyer) => void;
    onRequireAuth: (draft: Invoice, mode: "login" | "register") => void;
  } & Pick<
    InvoiceEditorRouteExtras,
    | "clientQuery"
    | "setClientQuery"
    | "setBuyerDropdownSuppressed"
    | "buyerDropdownSuppressed"
    | "buyerSuggestions"
    | "aresSearchLoading"
    | "aresDropdownEmpty"
  >,
) {
  const [modalOpen, setModalOpen] = useState(false);
  const [publicEmail, setPublicEmail] = useState("");
  const [agreeGdpr, setAgreeGdpr] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [localBusy, setLocalBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [supplierAresQuery, setSupplierAresQuery] = useState("");
  const [supplierAresHits, setSupplierAresHits] = useState<Buyer[]>([]);
  const [supplierAresLoading, setSupplierAresLoading] = useState(false);
  const [supplierAresLastFinishedQuery, setSupplierAresLastFinishedQuery] = useState<string | null>(null);
  const [supplierAresDropdownSuppressed, setSupplierAresDropdownSuppressed] = useState(false);
  const [buyerAresQuery, setBuyerAresQuery] = useState("");
  const [buyerAresHits, setBuyerAresHits] = useState<Buyer[]>([]);
  const [buyerAresLoading, setBuyerAresLoading] = useState(false);
  const [buyerAresLastFinishedQuery, setBuyerAresLastFinishedQuery] = useState<string | null>(null);
  const [buyerAresDropdownSuppressed, setBuyerAresDropdownSuppressed] = useState(false);
  const supplierAresWrapRef = useRef<HTMLDivElement>(null);
  const buyerAresWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setModalOpen(false);
    setLocalError(null);
    props.setDraft(newInvoice(guestSupplier(), []));
    props.setClientQuery("");
    props.setBuyerDropdownSuppressed(false);
    return () => props.setDraft(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const q = supplierAresQuery.trim();
    if (!isAresClientSearchQuery(q)) {
      setSupplierAresHits([]);
      setSupplierAresLastFinishedQuery(null);
      setSupplierAresLoading(false);
      return;
    }
    const ac = new AbortController();
    const timer = window.setTimeout(async () => {
      setSupplierAresLoading(true);
      try {
        const hits = await searchAresFromWeb(q, ac.signal);
        if (!ac.signal.aborted) {
          setSupplierAresHits(hits);
          setSupplierAresLastFinishedQuery(q);
        }
      } catch {
        if (!ac.signal.aborted) {
          setSupplierAresHits([]);
          setSupplierAresLastFinishedQuery(q);
        }
      } finally {
        if (!ac.signal.aborted) setSupplierAresLoading(false);
      }
    }, 380);
    return () => {
      window.clearTimeout(timer);
      ac.abort();
    };
  }, [supplierAresQuery]);

  useEffect(() => {
    const q = buyerAresQuery.trim();
    if (!isAresClientSearchQuery(q)) {
      setBuyerAresHits([]);
      setBuyerAresLastFinishedQuery(null);
      setBuyerAresLoading(false);
      return;
    }
    const ac = new AbortController();
    const timer = window.setTimeout(async () => {
      setBuyerAresLoading(true);
      try {
        const hits = await searchAresFromWeb(q, ac.signal);
        if (!ac.signal.aborted) {
          setBuyerAresHits(hits);
          setBuyerAresLastFinishedQuery(q);
        }
      } catch {
        if (!ac.signal.aborted) {
          setBuyerAresHits([]);
          setBuyerAresLastFinishedQuery(q);
        }
      } finally {
        if (!ac.signal.aborted) setBuyerAresLoading(false);
      }
    }, 380);
    return () => {
      window.clearTimeout(timer);
      ac.abort();
    };
  }, [buyerAresQuery]);

  useEffect(() => {
    function onDocPointerDown(ev: PointerEvent) {
      const target = ev.target as Node | null;
      if (!target) return;
      if (supplierAresWrapRef.current && !supplierAresWrapRef.current.contains(target)) {
        setSupplierAresDropdownSuppressed(true);
      }
      if (buyerAresWrapRef.current && !buyerAresWrapRef.current.contains(target)) {
        setBuyerAresDropdownSuppressed(true);
      }
    }
    document.addEventListener("pointerdown", onDocPointerDown);
    return () => document.removeEventListener("pointerdown", onDocPointerDown);
  }, []);

  if (!props.draft) {
    return <p className="text-xs text-on-surface-variant p-6">Připravuji formulář…</p>;
  }
  const draft = props.draft;
  const supplierAresTrim = supplierAresQuery.trim();
  const buyerAresTrim = buyerAresQuery.trim();
  const supplierAresEmpty =
    isAresClientSearchQuery(supplierAresTrim) &&
    !supplierAresLoading &&
    supplierAresLastFinishedQuery === supplierAresTrim &&
    supplierAresHits.length === 0;
  const buyerAresEmpty =
    isAresClientSearchQuery(buyerAresTrim) &&
    !buyerAresLoading &&
    buyerAresLastFinishedQuery === buyerAresTrim &&
    buyerAresHits.length === 0;
  const showSupplierAresDropdown =
    !supplierAresDropdownSuppressed &&
    isAresClientSearchQuery(supplierAresTrim) &&
    (supplierAresLoading || supplierAresHits.length > 0 || supplierAresEmpty);
  const showBuyerAresDropdown =
    !buyerAresDropdownSuppressed &&
    isAresClientSearchQuery(buyerAresTrim) &&
    (buyerAresLoading || buyerAresHits.length > 0 || buyerAresEmpty);

  const canContinue = /\S+@\S+\.\S+/.test(publicEmail.trim()) && agreeGdpr && agreeTerms;
  const draftWithRequiredEmail: Invoice = {
    ...draft,
    supplier: { ...draft.supplier, email: publicEmail.trim() || draft.supplier.email },
  };

  function normalizeAresAddress(address: string): string {
    return address
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean)
      .join("\n");
  }

  function applySupplierFromAres(b: Buyer) {
    props.setDraft({
      ...draft,
      supplier: {
        ...draft.supplier,
        name: b.name || draft.supplier.name,
        ico: b.ico || draft.supplier.ico,
        address: normalizeAresAddress(b.address),
      },
    });
    setSupplierAresQuery(b.ico || b.name);
    setSupplierAresDropdownSuppressed(true);
  }

  function applyBuyerFromAres(b: Buyer) {
    props.setDraft({
      ...draft,
      buyer: {
        ...draft.buyer,
        name: b.name || draft.buyer.name,
        ico: b.ico || draft.buyer.ico,
        address: normalizeAresAddress(b.address),
      },
    });
    setBuyerAresQuery(b.ico || b.name);
    setBuyerAresDropdownSuppressed(true);
  }

  function missingRequiredFields(inv: Invoice): string[] {
    const missing: string[] = [];
    if (!inv.supplier.name.trim()) missing.push("Dodavatel: název/jméno");
    if (!inv.supplier.address.trim()) missing.push("Dodavatel: adresa");
    if (!inv.supplier.ico.trim()) missing.push("Dodavatel: IČ");
    if (!inv.buyer.name.trim()) missing.push("Odběratel: název/jméno");
    if (!inv.buyer.address.trim()) missing.push("Odběratel: adresa");
    if (!inv.buyer.ico.trim()) missing.push("Odběratel: IČ");
    return missing;
  }

  function preparePublicInvoice(requireConsents: boolean): Invoice | null {
    const missing = missingRequiredFields(draft);
    if (missing.length > 0) {
      setLocalError(`Doplňte povinné údaje: ${missing.join(", ")}`);
      return null;
    }

    const bank = parseStoredBankAccount(draft.supplier.bankAccount);
    const bankCodeDigits = bank.bankCode.replace(/\D/g, "");
    if (!bank.body.trim() || bankCodeDigits.length !== 4) {
      setLocalError("Vyplňte platný bankovní účet ve tvaru číslo/kód banky (např. 123456789/0800).");
      return null;
    }
    if (!isValidAccountBody(bank.body)) {
      setLocalError("Číslo bankovního účtu je neplatné. Opravte ho prosím.");
      return null;
    }
    const ibanRaw = computeCzechIban(bankCodeDigits, bank.body);
    if (!ibanRaw) {
      setLocalError("Z bankovního účtu se nepodařilo vygenerovat IBAN. Zkontrolujte formát účtu.");
      return null;
    }
    const bankRow = findCzechBankByCode(bankCodeDigits);
    const swift = bankRow?.swift?.trim() ?? "";
    if (!swift) {
      setLocalError("Pro zadaný kód banky nelze určit SWIFT/BIC. Upravte účet a zkuste to znovu.");
      return null;
    }

    if (requireConsents && !canContinue) {
      setLocalError("Vyplňte e-mail a potvrďte souhlasy.");
      return null;
    }

    const prepared: Invoice = {
      ...draft,
      supplier: {
        ...draft.supplier,
        bankAccount: `${bank.body.trim()}/${bankCodeDigits}`,
        iban: formatIbanSpaced(ibanRaw),
        swift,
        email: publicEmail.trim() || draft.supplier.email,
      },
    };
    return prepared;
  }

  function tryOpenModal() {
    const prepared = preparePublicInvoice(false);
    if (!prepared) return;
    props.setDraft(prepared);
    setLocalError(null);
    setModalOpen(true);
  }

  async function persistPublicSubmission(inv: Invoice): Promise<void> {
    await apiSavePublicInvoiceSubmission({
      createdAt: new Date().toISOString(),
      source: "public-free-invoice",
      invoice: inv,
      contactEmail: publicEmail.trim(),
      gdprAccepted: agreeGdpr,
      termsAccepted: agreeTerms,
    });
  }

  async function goAuth(mode: "login" | "register") {
    const prepared = preparePublicInvoice(true);
    if (!prepared) return;
    setLocalBusy(true);
    setLocalError(null);
    try {
      props.setDraft(prepared);
      await persistPublicSubmission(prepared);
      props.onRequireAuth(prepared, mode);
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : String(e));
    } finally {
      setLocalBusy(false);
    }
  }

  async function downloadWithoutAccount() {
    const prepared = preparePublicInvoice(true);
    if (!prepared) return;
    setLocalBusy(true);
    setLocalError(null);
    try {
      props.setDraft(prepared);
      await persistPublicSubmission(prepared);
      await downloadInvoicePdf(prepared);
      setModalOpen(false);
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : String(e));
    } finally {
      setLocalBusy(false);
    }
  }

  return (
    <div className="bg-surface text-on-surface min-h-screen">
      <header className="sticky top-0 z-50 bg-surface/80 backdrop-blur-xl border-b border-outline-variant/20">
        <nav className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <button type="button" onClick={() => props.navigate("/")} className="cursor-pointer">
            <span
              aria-label="Fakturujto"
              className="inline-block h-7 w-[148px] bg-primary"
              style={{
                WebkitMask: `url(${fakturujtoLogoFull}) center / contain no-repeat`,
                mask: `url(${fakturujtoLogoFull}) center / contain no-repeat`,
              }}
            />
          </button>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => props.onRequireAuth(draftWithRequiredEmail, "login")}
              className="text-sm font-medium text-on-surface-variant hover:text-primary cursor-pointer"
            >
              Přihlásit se
            </button>
            <button
              type="button"
              onClick={() => props.onRequireAuth(draftWithRequiredEmail, "register")}
              className="px-4 py-2 rounded-lg bg-primary text-on-primary text-sm font-semibold cursor-pointer"
            >
              Registrovat se
            </button>
          </div>
        </nav>
      </header>

      <main className="max-w-[1120px] mx-auto px-6 py-8 space-y-6">
        <header className="mb-1">
          <h1 className="text-2xl font-semibold tracking-geist-heading leading-geist-tight text-on-surface">Faktura zdarma</h1>
          <p className="text-on-surface-variant/65 text-[12px] font-medium tracking-wide mt-1">
            Bez účtu můžete fakturu vytvořit a stáhnout. Pro uložení do rozhraní se přihlaste.
          </p>
          {localError && <p className="text-xs text-error mt-2">{localError}</p>}
        </header>

        <section className="app-panel p-5 sm:p-6 grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <h2 className="text-[10px] font-semibold tracking-wide text-outline uppercase mb-3">Dodavatel (povinné)</h2>
            <div className="space-y-3">
              <div ref={supplierAresWrapRef} className="relative">
                <LabeledField
                  label="IČ"
                  value={supplierAresQuery}
                  onChange={(v) => {
                    setSupplierAresDropdownSuppressed(false);
                    setSupplierAresQuery(v);
                    const asDigits = v.replace(/\D/g, "");
                    if (/^\d{1,8}$/.test(asDigits) && asDigits === v.trim()) {
                      props.setDraft({ ...draft, supplier: { ...draft.supplier, ico: asDigits } });
                    }
                  }}
                />
                {showSupplierAresDropdown && (
                  <ul
                    className="absolute z-30 mt-1 w-full app-panel p-0 max-h-64 overflow-auto text-sm shadow-geist-md rounded-lg border-outline-variant/50"
                    role="listbox"
                  >
                    {supplierAresLoading && supplierAresHits.length === 0 && !supplierAresEmpty && (
                      <li className="px-4 py-3 text-xs text-on-surface-variant flex items-center gap-2 border-b border-outline-variant/20">
                        <span className="h-3.5 w-3.5 shrink-0 rounded-full border-2 border-primary/25 border-t-primary animate-spin" />
                        Načítám z ARES…
                      </li>
                    )}
                    {supplierAresEmpty && <li className="px-4 py-3 text-xs text-on-surface-variant">Žádná shoda v ARES.</li>}
                    {supplierAresHits.map((b) => (
                      <li key={b.ico + b.name} role="option">
                        <button
                          type="button"
                          className="w-full text-left px-4 py-2.5 geist-transition hover:bg-surface-container-low border-b border-outline-variant/20 last:border-b-0"
                          onClick={() => applySupplierFromAres(b)}
                        >
                          <span className="font-medium text-on-surface text-sm block leading-snug">{b.name}</span>
                          <span className="text-[11px] text-on-surface-variant mt-0.5 block">IČ {b.ico}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <LabeledField
                label="Název / jméno"
                value={draft.supplier.name}
                onChange={(v) => props.setDraft({ ...draft, supplier: { ...draft.supplier, name: v } })}
              />
              <LabeledTextarea
                label="Adresa"
                value={draft.supplier.address}
                onChange={(v) => props.setDraft({ ...draft, supplier: { ...draft.supplier, address: v } })}
              />
            </div>
          </div>
          <div>
            <h2 className="text-[10px] font-semibold tracking-wide text-outline uppercase mb-3">Odběratel (povinné)</h2>
            <div className="space-y-3">
              <div ref={buyerAresWrapRef} className="relative">
                <LabeledField
                  label="IČ"
                  value={buyerAresQuery}
                  onChange={(v) => {
                    setBuyerAresDropdownSuppressed(false);
                    setBuyerAresQuery(v);
                    const asDigits = v.replace(/\D/g, "");
                    if (/^\d{1,8}$/.test(asDigits) && asDigits === v.trim()) {
                      props.setDraft({ ...draft, buyer: { ...draft.buyer, ico: asDigits } });
                    }
                  }}
                />
                {showBuyerAresDropdown && (
                  <ul
                    className="absolute z-30 mt-1 w-full app-panel p-0 max-h-64 overflow-auto text-sm shadow-geist-md rounded-lg border-outline-variant/50"
                    role="listbox"
                  >
                    {buyerAresLoading && buyerAresHits.length === 0 && !buyerAresEmpty && (
                      <li className="px-4 py-3 text-xs text-on-surface-variant flex items-center gap-2 border-b border-outline-variant/20">
                        <span className="h-3.5 w-3.5 shrink-0 rounded-full border-2 border-primary/25 border-t-primary animate-spin" />
                        Načítám z ARES…
                      </li>
                    )}
                    {buyerAresEmpty && <li className="px-4 py-3 text-xs text-on-surface-variant">Žádná shoda v ARES.</li>}
                    {buyerAresHits.map((b) => (
                      <li key={b.ico + b.name} role="option">
                        <button
                          type="button"
                          className="w-full text-left px-4 py-2.5 geist-transition hover:bg-surface-container-low border-b border-outline-variant/20 last:border-b-0"
                          onClick={() => applyBuyerFromAres(b)}
                        >
                          <span className="font-medium text-on-surface text-sm block leading-snug">{b.name}</span>
                          <span className="text-[11px] text-on-surface-variant mt-0.5 block">IČ {b.ico}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <LabeledField
                label="Název / jméno"
                value={draft.buyer.name}
                onChange={(v) => props.setDraft({ ...draft, buyer: { ...draft.buyer, name: v } })}
              />
              <LabeledTextarea
                label="Adresa"
                value={draft.buyer.address}
                onChange={(v) => props.setDraft({ ...draft, buyer: { ...draft.buyer, address: v } })}
              />
            </div>
          </div>
        </section>

        <InvoiceEditor
          draft={draft}
          setDraft={props.setDraft}
          clientQuery={props.clientQuery}
          setClientQuery={(v) => {
            props.setBuyerDropdownSuppressed(false);
            props.setClientQuery(v);
          }}
          setBuyerDropdownSuppressed={props.setBuyerDropdownSuppressed}
          buyerDropdownSuppressed={props.buyerDropdownSuppressed}
          buyerSuggestions={props.buyerSuggestions}
          aresSearchLoading={props.aresSearchLoading}
          aresDropdownEmpty={props.aresDropdownEmpty}
          onSelectBuyer={props.onSelectBuyer}
          onSave={tryOpenModal}
          onSaveAndIssue={tryOpenModal}
          onDelete={() => props.setDraft(newInvoice(guestSupplier(), []))}
          onTogglePaid={() => {
            /* veřejná stránka bez přepínání úhrad */
          }}
          onPdf={tryOpenModal}
          onCancel={() => props.navigate("/")}
          busy={localBusy}
          buyerDirectory={[]}
          showPastBuyersDirectory={false}
          publicMode
        />
      </main>

      <footer className="mt-14 border-t border-outline-variant/20 bg-surface-container-low">
        <div className="max-w-7xl mx-auto px-6 py-8 flex flex-col sm:flex-row gap-3 items-center justify-between">
          <p className="text-[11px] text-on-surface-variant">© 2026 Fakturujto · Faktura zdarma</p>
          <div className="text-[11px] text-on-surface-variant flex items-center gap-4">
            <a href="#" className="hover:text-primary">
              GDPR
            </a>
            <a href="#" className="hover:text-primary">
              Obchodní podmínky
            </a>
          </div>
        </div>
      </footer>

      {modalOpen && (
        <div className="fixed inset-0 z-[80] bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-xl rounded-2xl bg-surface-container-lowest border border-outline-variant/35 shadow-2xl p-6 sm:p-7">
            <h2 className="text-lg font-bold text-on-surface mb-2">Nejste přihlášen</h2>
            <p className="text-sm text-on-surface-variant mb-5 leading-relaxed">
              Tato faktura se bez přihlášení neuloží do vašeho rozhraní. Přihlaste se nebo se registrujte pro uložení.
            </p>

            <div className="space-y-3 mb-5">
              <label className="block">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">E-mail (povinné)</span>
                <input
                  type="email"
                  value={publicEmail}
                  onChange={(e) => setPublicEmail(e.target.value)}
                  className="mt-1.5 w-full px-3 py-2.5 rounded-lg bg-surface-container-low border border-outline-variant/35 focus:ring-2 focus:ring-primary/20"
                  placeholder="vas@email.cz"
                />
              </label>
              <label className="flex items-start gap-2.5 text-xs text-on-surface-variant">
                <input
                  type="checkbox"
                  checked={agreeGdpr}
                  onChange={(e) => setAgreeGdpr(e.target.checked)}
                  className="mt-0.5 rounded border-outline-variant"
                />
                Souhlasím se zpracováním osobních údajů (GDPR).
              </label>
              <label className="flex items-start gap-2.5 text-xs text-on-surface-variant">
                <input
                  type="checkbox"
                  checked={agreeTerms}
                  onChange={(e) => setAgreeTerms(e.target.checked)}
                  className="mt-0.5 rounded border-outline-variant"
                />
                Souhlasím s obchodními podmínkami.
              </label>
              {localError && <p className="text-xs text-error">{localError}</p>}
            </div>

            <div className="flex flex-col sm:flex-row gap-2.5">
              <button
                type="button"
                disabled={!canContinue || localBusy}
                onClick={() => {
                  goAuth("login").catch(() => {
                    /* chyba je v localError */
                  });
                }}
                className="flex-1 px-4 py-2.5 rounded-lg bg-primary text-on-primary text-sm font-semibold disabled:opacity-50 cursor-pointer"
              >
                Přihlásit se a uložit
              </button>
              <button
                type="button"
                disabled={!canContinue || localBusy}
                onClick={() => {
                  goAuth("register").catch(() => {
                    /* chyba je v localError */
                  });
                }}
                className="flex-1 px-4 py-2.5 rounded-lg bg-primary-container text-on-primary-container text-sm font-semibold disabled:opacity-50 cursor-pointer"
              >
                Registrovat se a uložit
              </button>
              <button
                type="button"
                disabled={localBusy}
                onClick={downloadWithoutAccount}
                className="flex-1 px-4 py-2.5 rounded-lg border border-outline-variant/40 text-sm font-semibold text-on-surface disabled:opacity-50 cursor-pointer"
              >
                Stáhnout fakturu
              </button>
            </div>
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="mt-3 text-xs text-on-surface-variant hover:text-on-surface cursor-pointer"
            >
              Zavřít
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const [authReady, setAuthReady] = useState(false);
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [invoices, setInvoices] = useState<StoredInvoice[]>([]);
  const [supplierProfile, setSupplierProfile] = useState<Supplier | null>(null);
  const [draft, setDraft] = useState<Invoice | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [clientQuery, setClientQuery] = useState("");
  const [aresSearchHits, setAresSearchHits] = useState<Buyer[]>([]);
  const [aresSearchLoading, setAresSearchLoading] = useState(false);
  const [lastAresFinishedQuery, setLastAresFinishedQuery] = useState<string | null>(null);
  const [buyerDropdownSuppressed, setBuyerDropdownSuppressed] = useState(false);
  const [supplierSearchQuery, setSupplierSearchQuery] = useState("");
  const [supplierAresHits, setSupplierAresHits] = useState<Buyer[]>([]);
  const [supplierAresLoading, setSupplierAresLoading] = useState(false);
  const [supplierLastAresQuery, setSupplierLastAresQuery] = useState<string | null>(null);
  const [supplierDropdownSuppressed, setSupplierDropdownSuppressed] = useState(false);

  const refresh = useCallback(async () => {
    setErr(null);
    const [list, sup] = await Promise.all([apiListInvoices(), apiGetSupplier()]);
    setInvoices(list);
    setSupplierProfile(sup);
  }, []);

  const refreshUsers = useCallback(async (asAdmin: boolean) => {
    if (!asAdmin) {
      setUsers([]);
      return;
    }
    try {
      setUsers(await listUsers());
    } catch {
      setUsers([]);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const sessionUser = await fetchSessionUser();
      if (cancelled) return;
      setCurrentUser(sessionUser);
      await refreshUsers(sessionUser?.role === "admin");
      if (!cancelled) setAuthReady(true);
    })().catch(() => {
      if (!cancelled) {
        setCurrentUser(null);
        setUsers([]);
        setAuthReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [refreshUsers]);

  useEffect(() => {
    if (!currentUser) return;
    refresh().catch((e) => setErr(String(e)));
  }, [currentUser, refresh]);

  useEffect(() => {
    if (!currentUser) return;
    const pending = consumePendingFreeInvoice();
    if (!pending) return;
    setBusy(true);
    setErr(null);
    apiSaveInvoice(pending)
      .then(async (id) => {
        const saved = { ...pending, id };
        setDraft(saved);
        await refresh();
        navigate(`/faktura/${id}`, { replace: true });
      })
      .catch((e) => setErr(String(e)))
      .finally(() => setBusy(false));
  }, [currentUser, navigate, refresh]);

  const paidTotal = useMemo(
    () =>
      invoices.filter((i) => i.status === "paid").reduce((s, i) => s + invoiceTotal(i), 0),
    [invoices],
  );
  const unpaidTotal = useMemo(
    () =>
      invoices.filter((i) => i.status === "unpaid").reduce((s, i) => s + invoiceTotal(i), 0),
    [invoices],
  );

  const recent = useMemo(() => invoices.slice(0, 12), [invoices]);

  const pastBuyers = useMemo(() => {
    const map = new Map<string, Buyer>();
    for (const inv of invoices) {
      const key = (inv.buyer.ico || inv.buyer.name).trim();
      if (key) map.set(key, inv.buyer);
    }
    return [...map.values()];
  }, [invoices]);

  const buyerDirectoryStats = useMemo(() => buildBuyerDirectoryStats(invoices), [invoices]);

  const onSettingsPage = location.pathname === "/nastaveni";

  useEffect(() => {
    if (location.pathname === "/nastaveni") {
      setSupplierSearchQuery("");
      setSupplierAresHits([]);
      setSupplierLastAresQuery(null);
      setSupplierAresLoading(false);
      setSupplierDropdownSuppressed(false);
    }
  }, [location.pathname]);

  const onInvoiceFormPage =
    location.pathname === "/vystavit-fakturu" || /^\/faktura\/\d+$/.test(location.pathname);

  useEffect(() => {
    if (!onInvoiceFormPage) {
      setAresSearchHits([]);
      setLastAresFinishedQuery(null);
      setAresSearchLoading(false);
      return;
    }
    const q = clientQuery.trim();
    if (!isAresClientSearchQuery(q)) {
      setAresSearchHits([]);
      setLastAresFinishedQuery(null);
      setAresSearchLoading(false);
      return;
    }

    setAresSearchHits([]);
    setLastAresFinishedQuery(null);

    const ac = new AbortController();
    const timer = window.setTimeout(async () => {
      setAresSearchLoading(true);
      try {
        const hits = await searchAresFromWeb(q, ac.signal);
        if (!ac.signal.aborted) {
          setAresSearchHits(hits);
          setLastAresFinishedQuery(q);
        }
      } catch (e: unknown) {
        if (ac.signal.aborted) return;
        setAresSearchHits([]);
        setLastAresFinishedQuery(q);
      } finally {
        if (!ac.signal.aborted) setAresSearchLoading(false);
      }
    }, 380);

    return () => {
      window.clearTimeout(timer);
      ac.abort();
    };
  }, [clientQuery, onInvoiceFormPage]);

  useEffect(() => {
    if (!onSettingsPage) {
      setSupplierAresHits([]);
      setSupplierLastAresQuery(null);
      setSupplierAresLoading(false);
      return;
    }
    const q = supplierSearchQuery.trim();
    if (!isAresClientSearchQuery(q)) {
      setSupplierAresHits([]);
      setSupplierLastAresQuery(null);
      setSupplierAresLoading(false);
      return;
    }

    setSupplierAresHits([]);
    setSupplierLastAresQuery(null);

    const ac = new AbortController();
    const timer = window.setTimeout(async () => {
      setSupplierAresLoading(true);
      try {
        const hits = await searchAresFromWeb(q, ac.signal);
        if (!ac.signal.aborted) {
          setSupplierAresHits(hits);
          setSupplierLastAresQuery(q);
        }
      } catch {
        if (!ac.signal.aborted) {
          setSupplierAresHits([]);
          setSupplierLastAresQuery(q);
        }
      } finally {
        if (!ac.signal.aborted) setSupplierAresLoading(false);
      }
    }, 380);

    return () => {
      window.clearTimeout(timer);
      ac.abort();
    };
  }, [supplierSearchQuery, onSettingsPage]);

  const supplierSuggestions = useMemo(
    () => mergeAresWithLocal(supplierAresHits, [], supplierSearchQuery, 5),
    [supplierAresHits, supplierSearchQuery],
  );

  const sqTrim = supplierSearchQuery.trim();
  const supplierAresDropdownEmpty =
    onSettingsPage &&
    isAresClientSearchQuery(sqTrim) &&
    !supplierAresLoading &&
    supplierLastAresQuery === sqTrim &&
    supplierSuggestions.length === 0;

  const buyerSuggestions = useMemo(
    () => mergeAresWithLocal(aresSearchHits, pastBuyers, clientQuery, 5),
    [aresSearchHits, pastBuyers, clientQuery],
  );

  const cqTrim = clientQuery.trim();
  const aresDropdownEmpty =
    onInvoiceFormPage &&
    isAresClientSearchQuery(cqTrim) &&
    !aresSearchLoading &&
    lastAresFinishedQuery === cqTrim &&
    buyerSuggestions.length === 0;

  function openInvoice(inv: StoredInvoice) {
    setSidebarOpen(false);
    navigate(`/faktura/${inv.id}`);
  }

  function handlePublicRequireAuth(inv: Invoice, mode: "login" | "register") {
    savePendingFreeInvoice(inv);
    navigate(mode === "login" ? "/prihlaseni" : "/registrace");
  }

  async function handleLogin(email: string, password: string) {
    const user = await loginUser(email, password);
    setCurrentUser(user);
    await refreshUsers(user.role === "admin");
    setErr(null);
    navigate("/prehled", { replace: true });
  }

  async function handleRegister(input: {
    fullName: string;
    email: string;
    password: string;
    ico: string;
    companyName: string;
  }) {
    const normalizedIco = input.ico.trim();
    const profile = {
      companyName: input.companyName.trim(),
      ico: normalizedIco,
      dic: "",
      address: "",
    };
    if (normalizedIco) {
      try {
        const ares = await apiFetchAres(normalizedIco);
        profile.companyName = ares.name || profile.companyName;
        profile.address = ares.address || "";
        profile.dic = ares.dic || "";
      } catch {
        /* registrace má i bez ARES pokračovat */
      }
    }
    const user = await registerUser({
      fullName: input.fullName,
      email: input.email,
      password: input.password,
      profile,
    });
    setCurrentUser(user);
    await refreshUsers(user.role === "admin");
    setErr(null);
    navigate("/prehled", { replace: true });
  }

  function handleLogout() {
    clearSession();
    setCurrentUser(null);
    setUsers([]);
    setInvoices([]);
    setSupplierProfile(null);
    setDraft(null);
    navigate("/prihlaseni", { replace: true });
  }

  async function handleDeleteUser(id: string) {
    if (currentUser?.role !== "admin") throw new Error("Pouze administrátor může mazat uživatele.");
    if (currentUser?.id === id) {
      throw new Error("Nelze smazat právě přihlášeného uživatele.");
    }
    await deleteUser(id);
    await refreshUsers(true);
  }

  async function handleSetUserRole(id: string, role: UserRole) {
    if (currentUser?.role !== "admin") throw new Error("Pouze administrátor může měnit role.");
    if (currentUser?.id === id && role !== "admin") {
      throw new Error("Aktuální administrátor si nemůže odebrat roli admin.");
    }
    await updateUserRole(id, role);
    await refreshUsers(true);
    const refreshedSession = await fetchSessionUser();
    if (refreshedSession) setCurrentUser(refreshedSession);
  }

  async function handleChangeOwnPassword(currentPassword: string, newPassword: string) {
    if (!currentUser) throw new Error("Nejste přihlášen.");
    await changePassword(currentPassword, newPassword);
  }

  async function handleInviteUser(input: {
    fullName: string;
    email: string;
    password: string;
    role: UserRole;
    ico: string;
    companyName: string;
  }) {
    if (currentUser?.role !== "admin") throw new Error("Pouze administrátor může zvát uživatele.");
    const normalizedIco = input.ico.trim();
    const profile = {
      companyName: input.companyName.trim(),
      ico: normalizedIco,
      dic: "",
      address: "",
    };
    if (normalizedIco) {
      try {
        const ares = await apiFetchAres(normalizedIco);
        profile.companyName = ares.name || profile.companyName;
        profile.address = ares.address || "";
        profile.dic = ares.dic || "";
      } catch {
        /* ARES fallback */
      }
    }
    await inviteUser({
      fullName: input.fullName,
      email: input.email,
      password: input.password,
      role: input.role,
      profile,
    });
    await refreshUsers(true);
  }

  async function saveDraft() {
    if (!draft) return;
    if (draft.status === "paid") return;
    setBusy(true);
    setErr(null);
    try {
      const id = await apiSaveInvoice(draft);
      setDraft({ ...draft, id });
      await refresh();
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function saveAndIssuePdf() {
    if (!draft) return;
    if (draft.status === "paid") return;
    setBusy(true);
    setErr(null);
    try {
      const id = await apiSaveInvoice(draft);
      const saved = { ...draft, id };
      setDraft(saved);
      await refresh();
      await downloadInvoicePdf(saved);
      navigate(`/faktura/${id}`);
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function removeDraft() {
    if (!draft?.id) {
      navigate("/prehled", { replace: true });
      setDraft(null);
      return;
    }
    if (draft.status === "paid") return;
    if (!confirm("Smazat tuto fakturu?")) return;
    setBusy(true);
    setErr(null);
    try {
      await apiDeleteInvoice(draft.id);
      setDraft(null);
      navigate("/faktury", { replace: true });
      await refresh();
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function togglePaid() {
    if (!draft) return;
    if (draft.status === "paid") {
      if (!confirm("Chcete zrušit proplacení? Faktura bude znovu vedena jako neuhrazená.")) return;
    }
    const next: Invoice = {
      ...draft,
      status: draft.status === "paid" ? "unpaid" : "paid",
    };
    setDraft(next);
    if (next.id != null) {
      setBusy(true);
      setErr(null);
      try {
        await apiSaveInvoice(next);
        await refresh();
      } catch (e) {
        setErr(String(e));
      } finally {
        setBusy(false);
      }
    }
  }

  const saveInvoiceStatusFromList = useCallback(
    async (inv: StoredInvoice, status: InvoiceStatus) => {
      setErr(null);
      try {
        await apiSaveInvoice({ ...inv, status });
        await refresh();
      } catch (e) {
        setErr(String(e));
        throw e;
      }
    },
    [refresh],
  );

  const deleteInvoiceFromList = useCallback(
    async (id: number) => {
      setErr(null);
      try {
        await apiDeleteInvoice(id);
        await refresh();
      } catch (e) {
        setErr(String(e));
        throw e;
      }
    },
    [refresh],
  );

  const fetchSupplierAresByIco = useCallback(async (ico: string) => {
    setBusy(true);
    setErr(null);
    try {
      return await apiFetchAres(ico);
    } catch (e) {
      setErr(String(e));
      throw e;
    } finally {
      setBusy(false);
    }
  }, []);

  async function exportPdf() {
    if (!draft) return;
    setBusy(true);
    try {
      await downloadInvoicePdf(draft);
    } finally {
      setBusy(false);
    }
  }

  async function saveSupplier(s: Supplier) {
    setBusy(true);
    setErr(null);
    try {
      await apiSaveSupplier(s);
      setSupplierProfile(s);
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  }

  function openInvoiceFromBuyer(b: Buyer) {
    const inv = invoices.find((i) => (i.buyer.ico && i.buyer.ico === b.ico) || i.buyer.name === b.name);
    if (inv) openInvoice(inv);
  }

  const selectBuyer = useCallback((b: Buyer) => {
    setDraft((d) => {
      if (!d) return d;
      const addrLines = b.address
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean)
        .join("\n");
      return { ...d, buyer: { ...structuredClone(b), address: addrLines } };
    });
    setClientQuery(b.name);
    setBuyerDropdownSuppressed(true);
  }, []);

  useEffect(() => {
    if (!currentUser || !supplierProfile) return;
    const seed = currentUser.profile;
    const hasSeed =
      !!seed.companyName.trim() ||
      !!seed.ico.trim() ||
      !!seed.address.trim() ||
      !!currentUser.email.trim();
    if (!hasSeed) return;

    const next: Supplier = {
      ...supplierProfile,
      name: seed.companyName || supplierProfile.name,
      ico: seed.ico || supplierProfile.ico,
      address: seed.address || supplierProfile.address,
      email: supplierProfile.email.trim() || currentUser.email.trim(),
    };
    const changed =
      next.name !== supplierProfile.name ||
      next.ico !== supplierProfile.ico ||
      next.address !== supplierProfile.address ||
      next.email !== supplierProfile.email;
    if (!changed) return;

    apiSaveSupplier(next)
      .then(() => setSupplierProfile(next))
      .catch(() => {
        /* ignorujeme, uživatel může údaje vyplnit ručně */
      });
  }, [currentUser, supplierProfile]);

  if (!authReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface text-on-surface">
        <p className="text-xs text-on-surface-variant">Načítám…</p>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <Routes>
        <Route
          path="/"
          element={
            <HomePage
              onLogin={() => navigate("/prihlaseni")}
              onRegister={() => navigate("/registrace")}
              onTryFree={() => navigate("/faktura-zdarma")}
            />
          }
        />
        <Route
          path="/homepage"
          element={
            <HomePage
              onLogin={() => navigate("/prihlaseni")}
              onRegister={() => navigate("/registrace")}
              onTryFree={() => navigate("/faktura-zdarma")}
            />
          }
        />
        <Route
          path="/faktura-zdarma"
          element={
            <PublicInvoicePage
              navigate={navigate}
              draft={draft}
              setDraft={setDraft}
              clientQuery={clientQuery}
              setClientQuery={setClientQuery}
              setBuyerDropdownSuppressed={setBuyerDropdownSuppressed}
              buyerDropdownSuppressed={buyerDropdownSuppressed}
              buyerSuggestions={buyerSuggestions}
              aresSearchLoading={aresSearchLoading}
              aresDropdownEmpty={aresDropdownEmpty}
              onSelectBuyer={selectBuyer}
              onRequireAuth={handlePublicRequireAuth}
            />
          }
        />
        <Route
          path="/prihlaseni"
          element={
            <LoginPage
              onLogin={handleLogin}
              onGoRegister={() => navigate("/registrace")}
              onTryFree={() => navigate("/faktura-zdarma")}
            />
          }
        />
        <Route
          path="/registrace"
          element={
            <RegisterPage
              onRegister={handleRegister}
              onGoLogin={() => navigate("/prihlaseni")}
              onTryFree={() => navigate("/faktura-zdarma")}
            />
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  if (!supplierProfile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface text-on-surface">
        <p className="text-xs text-on-surface-variant">Načítám…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-surface text-on-surface">
      {sidebarOpen && (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          aria-label="Zavřít menu"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`h-screen w-56 fixed left-0 top-0 flex flex-col p-4 gap-1.5 z-40 transition-transform duration-200 ease-out lg:translate-x-0 border-r border-outline-variant/[0.15] bg-surface-container-low/95 backdrop-blur-[28px] supports-[backdrop-filter]:bg-surface-container-low/85 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="mb-6 px-0.5">
          <Link
            to="/prehled"
            onClick={() => setSidebarOpen(false)}
            className="block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          >
            <span
              aria-label="Fakturujto"
              className="block h-6 w-[136px] bg-primary"
              style={{
                WebkitMask: `url(${fakturujtoLogoFull}) center / contain no-repeat`,
                mask: `url(${fakturujtoLogoFull}) center / contain no-repeat`,
              }}
            />
          </Link>
        </div>
        <nav className="space-y-0.5">
          <NavLink
            to="/prehled"
            end
            onClick={() => setSidebarOpen(false)}
            className={({ isActive }) => navItemClass(isActive)}
          >
            <Icon name="dashboard" />
            <span className="font-medium">Přehled</span>
          </NavLink>
          <NavLink
            to="/vystavit-fakturu"
            onClick={() => setSidebarOpen(false)}
            className={() =>
              navItemClass(
                location.pathname === "/vystavit-fakturu" || /^\/faktura\/\d+$/.test(location.pathname),
              )
            }
          >
            <Icon
              name="add_circle"
              filled={location.pathname === "/vystavit-fakturu" || /^\/faktura\/\d+$/.test(location.pathname)}
            />
            <span>Vystavit fakturu</span>
          </NavLink>
          <NavLink
            to="/faktury"
            onClick={() => setSidebarOpen(false)}
            className={({ isActive }) => navItemClass(isActive)}
          >
            <Icon name="description" />
            <span className="font-medium">Faktury</span>
          </NavLink>
          <NavLink
            to="/klienti"
            onClick={() => setSidebarOpen(false)}
            className={({ isActive }) => navItemClass(isActive)}
          >
            <Icon name="group" />
            <span className="font-medium">Klienti</span>
          </NavLink>
          {currentUser.role === "admin" && (
            <NavLink
              to="/uzivatele"
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) => navItemClass(isActive)}
            >
              <Icon name="manage_accounts" />
              <span className="font-medium">Uživatelé</span>
            </NavLink>
          )}
          <NavLink
            to="/nastaveni"
            onClick={() => setSidebarOpen(false)}
            className={({ isActive }) => navItemClass(isActive)}
          >
            <Icon name="settings" />
            <span className="font-medium">Nastavení</span>
          </NavLink>
        </nav>
        <div className="mt-auto pt-4 border-t border-outline-variant/20">
          <button
            type="button"
            onClick={handleLogout}
            className="w-full px-3 py-2.5 rounded-lg border border-outline-variant/35 text-xs font-semibold uppercase tracking-wide text-on-surface-variant hover:bg-surface-container-high geist-transition cursor-pointer"
          >
            Odhlásit se
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0 lg:ml-56 p-7 lg:p-10">
        <div className="lg:hidden flex items-center gap-2 mb-4">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="p-1.5 rounded-md bg-surface-container-low border border-outline-variant/60 geist-transition hover:bg-surface-container-high cursor-pointer"
            aria-label="Menu"
          >
            <Icon name="menu" />
          </button>
          <img src={fakturujtoLogoFull} alt="Fakturujto" className="h-5 w-auto" />
        </div>

        {err && (
          <div className="mb-5 rounded-xl border border-error/30 bg-error-container/20 backdrop-blur-sm px-4 py-3 text-xs text-on-error-container leading-snug shadow-geist-sm">
            {err}
          </div>
        )}

        <Routes>
          <Route path="/" element={<Navigate to="/prehled" replace />} />
          <Route
            path="/prehled"
            element={
              <DashboardOverview
                invoices={invoices}
                paidTotal={paidTotal}
                unpaidTotal={unpaidTotal}
                recent={recent}
                onOpen={openInvoice}
              />
            }
          />
          <Route
            path="/faktury"
            element={
              <InvoicesListPage
                invoices={invoices}
                supplierProfile={supplierProfile}
                onOpen={openInvoice}
                onSaveInvoiceStatus={saveInvoiceStatusFromList}
                onDelete={deleteInvoiceFromList}
                onPdfError={(msg) => setErr(msg)}
              />
            }
          />
          <Route
            path="/vystavit-fakturu"
            element={
              <NewInvoicePage
                supplierProfile={supplierProfile}
                invoices={invoices}
                navigate={navigate}
                draft={draft}
                setDraft={setDraft}
                clientQuery={clientQuery}
                setClientQuery={setClientQuery}
                setBuyerDropdownSuppressed={setBuyerDropdownSuppressed}
                buyerDropdownSuppressed={buyerDropdownSuppressed}
                buyerSuggestions={buyerSuggestions}
                aresSearchLoading={aresSearchLoading}
                aresDropdownEmpty={aresDropdownEmpty}
                onSelectBuyer={selectBuyer}
                onSave={saveDraft}
                onSaveAndIssue={saveAndIssuePdf}
                onDelete={removeDraft}
                onTogglePaid={togglePaid}
                onPdf={exportPdf}
                busy={busy}
                buyerDirectory={buyerDirectoryStats}
                showPastBuyersDirectory
              />
            }
          />
          <Route
            path="/faktura/:id"
            element={
              <EditInvoicePage
                invoices={invoices}
                navigate={navigate}
                draft={draft}
                setDraft={setDraft}
                clientQuery={clientQuery}
                setClientQuery={setClientQuery}
                setBuyerDropdownSuppressed={setBuyerDropdownSuppressed}
                buyerDropdownSuppressed={buyerDropdownSuppressed}
                buyerSuggestions={buyerSuggestions}
                aresSearchLoading={aresSearchLoading}
                aresDropdownEmpty={aresDropdownEmpty}
                onSelectBuyer={selectBuyer}
                onSave={saveDraft}
                onSaveAndIssue={saveAndIssuePdf}
                onDelete={removeDraft}
                onTogglePaid={togglePaid}
                onPdf={exportPdf}
                busy={busy}
                buyerDirectory={buyerDirectoryStats}
                showPastBuyersDirectory={false}
              />
            }
          />
          <Route
            path="/klienti"
            element={<ClientsPage buyers={pastBuyers} onPick={openInvoiceFromBuyer} />}
          />
          <Route
            path="/uzivatele"
            element={
              currentUser.role === "admin" ? (
                <UsersManagementPage
                  users={users}
                  currentUserId={currentUser.id}
                  onDeleteUser={handleDeleteUser}
                  onSetRole={handleSetUserRole}
                  onInviteUser={handleInviteUser}
                  onChangeOwnPassword={handleChangeOwnPassword}
                />
              ) : (
                <Navigate to="/prehled" replace />
              )
            }
          />
          <Route
            path="/nastaveni"
            element={
              <SupplierForm
                initial={supplierProfile}
                onSave={saveSupplier}
                onCancel={() => navigate("/prehled")}
                busy={busy}
                aresQuery={supplierSearchQuery}
                setAresQuery={setSupplierSearchQuery}
                aresSuggestions={supplierSuggestions}
                aresLoading={supplierAresLoading}
                aresEmpty={supplierAresDropdownEmpty}
                aresDropdownSuppressed={supplierDropdownSuppressed}
                setAresDropdownSuppressed={setSupplierDropdownSuppressed}
                fetchAresByIco={fetchSupplierAresByIco}
              />
            }
          />
          <Route path="*" element={<Navigate to="/prehled" replace />} />
        </Routes>

        <footer className="mt-20 pt-8 border-t border-outline-variant/30 flex justify-center opacity-30">
          <div className="flex items-center gap-1.5">
            <Icon name="verified_user" className="text-base" />
            <p className="text-[10px] font-semibold tracking-widest uppercase">The Auditor Secure System</p>
          </div>
        </footer>
      </main>
    </div>
  );
}

function AuthShell(props: {
  title: string;
  subtitle: string;
  children: ReactNode;
  onLogin: () => void;
  onRegister: () => void;
  onTryFree: () => void;
}) {
  return (
    <div className="bg-surface text-on-surface min-h-screen flex flex-col">
      <header className="sticky top-0 z-50 bg-surface/80 backdrop-blur-xl border-b border-outline-variant/20">
        <nav className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <button type="button" onClick={props.onTryFree} className="cursor-pointer">
            <span
              aria-label="Fakturujto"
              className="inline-block h-7 w-[148px] bg-primary"
              style={{
                WebkitMask: `url(${fakturujtoLogoFull}) center / contain no-repeat`,
                mask: `url(${fakturujtoLogoFull}) center / contain no-repeat`,
              }}
            />
          </button>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={props.onLogin}
              className="text-sm font-medium text-on-surface-variant hover:text-primary cursor-pointer"
            >
              Přihlásit se
            </button>
            <button
              type="button"
              onClick={props.onRegister}
              className="px-4 py-2 rounded-lg bg-primary text-on-primary text-sm font-semibold cursor-pointer"
            >
              Registrovat se
            </button>
          </div>
        </nav>
      </header>
      <main className="flex-grow flex items-center justify-center px-6 py-12 relative overflow-hidden subtle-mesh-auth">
        <div className="absolute top-[-10%] right-[-5%] w-[40rem] h-[40rem] rounded-full blur-[100px] opacity-20 pointer-events-none auth-editorial-gradient" />
        <div className="absolute bottom-[-10%] left-[-5%] w-[30rem] h-[30rem] rounded-full blur-[80px] opacity-10 pointer-events-none auth-editorial-gradient" />
        <div className="w-full max-w-[460px] z-10">
          <div className="text-center mb-8">
            <span
              aria-label="Fakturujto"
              className="inline-block h-10 w-[210px] bg-primary mb-5"
              style={{
                WebkitMask: `url(${fakturujtoLogoFull}) center / contain no-repeat`,
                mask: `url(${fakturujtoLogoFull}) center / contain no-repeat`,
              }}
            />
            <h1 className="font-extrabold text-3xl tracking-tight text-on-surface mb-2">{props.title}</h1>
            <p className="text-on-surface-variant text-sm font-medium">{props.subtitle}</p>
          </div>
          <div className="bg-surface-container-lowest rounded-xl p-8 md:p-10 shadow-[0_40px_100px_-20px_rgba(113,0,140,0.04)]">
            {props.children}
          </div>
        </div>
      </main>
      <footer className="border-t border-outline-variant/20 bg-surface-container-low">
        <div className="max-w-7xl mx-auto px-6 py-8 flex flex-col sm:flex-row gap-3 items-center justify-between">
          <p className="text-[11px] text-on-surface-variant">© 2026 Fakturujto</p>
          <div className="text-[11px] text-on-surface-variant flex items-center gap-4">
            <a href="#" className="hover:text-primary">
              GDPR
            </a>
            <a href="#" className="hover:text-primary">
              Obchodní podmínky
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

function HomePage(props: { onLogin: () => void; onRegister: () => void; onTryFree: () => void }) {
  const [headerCompact, setHeaderCompact] = useState(false);

  useEffect(() => {
    const onScroll = () => setHeaderCompact(window.scrollY > 16);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="bg-surface text-on-surface selection:bg-primary-fixed selection:text-primary">
      <header
        className={`sticky top-0 z-50 backdrop-blur-xl transition-all duration-300 ${
          headerCompact ? "px-4 py-3" : "px-0 py-0"
        }`}
      >
        <nav
          className={`max-w-7xl mx-auto flex justify-between items-center transition-all duration-300 ${
            headerCompact
              ? "bg-surface/90 border border-outline-variant/25 rounded-full px-6 py-2.5 shadow-geist-sm"
              : "bg-surface/80 px-6 py-4"
          }`}
        >
          <span
            aria-label="Fakturujto"
            className="inline-block h-7 w-[148px] bg-primary"
            style={{
              WebkitMask: `url(${fakturujtoLogoFull}) center / contain no-repeat`,
              mask: `url(${fakturujtoLogoFull}) center / contain no-repeat`,
            }}
          />
          <div className="hidden md:flex items-center gap-8 text-sm font-medium">
            <a href="#funkce" className="opacity-70 hover:text-primary transition-colors">
              Funkce
            </a>
            <a href="#srovnani" className="opacity-70 hover:text-primary transition-colors">
              Srovnání
            </a>
            <a href="#faq" className="opacity-70 hover:text-primary transition-colors">
              FAQ
            </a>
            <a href="#cenik" className="opacity-70 hover:text-primary transition-colors">
              Ceník
            </a>
          </div>
          <div className="flex items-center gap-3">
            <button type="button" onClick={props.onLogin} className="hidden md:block text-sm opacity-70 hover:text-primary cursor-pointer">
              Přihlásit se
            </button>
            <button
              type="button"
              onClick={props.onRegister}
              className="bg-primary text-white px-5 py-2.5 rounded-md font-medium text-sm active:scale-95 transition-all shadow-lg shadow-primary/20 cursor-pointer"
            >
              Začít zdarma
            </button>
          </div>
        </nav>
      </header>

      <main>
        <section className="relative pt-20 pb-24 overflow-hidden">
          <div className="max-w-7xl mx-auto px-6 text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary-fixed text-on-primary-fixed-variant text-xs font-bold tracking-wider uppercase mb-8">
              <Icon name="bolt" className="text-[14px]" /> Skutečná alternativa k iDokladu
            </div>
            <h1 className="text-5xl md:text-7xl font-extrabold tracking-tighter text-on-surface mb-8 leading-[1.1]">
              Fakturujte <span className="bg-gradient-to-r from-primary to-primary-container bg-clip-text text-transparent">moderně a zdarma</span>
            </h1>
            <p className="max-w-2xl mx-auto text-lg md:text-xl text-on-surface-variant leading-relaxed mb-12">
              Kompletní fakturační systém bez skrytých poplatků. Skutečná alternativa k iDokladu, která vás nic nestojí.
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-4">
              <button
                type="button"
                onClick={props.onRegister}
                className="inline-flex items-center justify-center min-w-[220px] bg-primary hover:bg-primary-container text-white px-8 py-4 rounded-xl font-bold text-lg transition-all shadow-xl shadow-primary/25 active:scale-95 cursor-pointer"
              >
                Registrovat se
              </button>
              <button
                type="button"
                onClick={props.onTryFree}
                className="inline-flex items-center justify-center min-w-[220px] bg-surface-container-high hover:bg-surface-container-highest text-on-surface px-8 py-4 rounded-xl font-bold text-lg transition-all active:scale-95 cursor-pointer"
              >
                Vyzkoušet zdarma
              </button>
            </div>
          </div>
        </section>

        <section id="funkce" className="py-24 bg-surface-container-low">
          <div className="max-w-7xl mx-auto px-6">
            <div className="flex flex-col md:flex-row justify-between items-end mb-16 gap-6">
              <div className="max-w-xl">
                <label className="text-[11px] font-bold tracking-widest text-primary uppercase mb-2 block">Funkce systému</label>
                <h2 className="text-4xl font-extrabold tracking-tight text-on-surface">
                  Vše, co potřebujete pro hladký audit vašeho podnikání
                </h2>
              </div>
              <p className="text-on-surface-variant max-w-md">Zapomeňte na složité tabulky. Rozhraní je navrženo tak, aby vám nepřekáželo v práci.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
              {[
                ["receipt_long", "Jednoduchá fakturace", "Vystavení faktury do 30 vteřin. Automatické našeptávání firem z ARES."],
                ["group", "Správa klientů", "Přehledná databáze kontaktů s historií plateb a platební morálkou."],
                ["query_stats", "Finanční přehledy", "Grafy příjmů a výdajů, které vám pomohou lépe plánovat cashflow."],
                ["smartphone", "Mobilní přístup", "Plně responzivní design optimalizovaný pro telefon i tablet."],
              ].map(([icon, title, text]) => (
                <div key={title} className="bg-surface-container-lowest p-8 rounded-2xl transition-all hover:-translate-y-1">
                  <div className="w-12 h-12 bg-primary-fixed rounded-xl flex items-center justify-center text-primary mb-6">
                    <Icon name={icon} />
                  </div>
                  <h3 className="text-xl font-bold mb-3">{title}</h3>
                  <p className="text-on-surface-variant text-sm leading-relaxed">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="srovnani" className="py-24">
          <div className="max-w-7xl mx-auto px-6">
            <div className="grid lg:grid-cols-2 gap-16 items-start">
              <div>
                <h2 className="text-4xl font-extrabold tracking-tight mb-8">Proč zvolit Fakturujto místo iDokladu?</h2>
                <div className="space-y-6">
                  {[
                    ["Nulová cena, navždy", "Plný tarif zdarma bez omezení počtu faktur."],
                    ["Intuitivní UI", "Čistý editorial design bez zbytečného šumu."],
                    ["Absolutní bezpečnost", "Šifrovaný přenos dat a denní zálohování."],
                  ].map(([title, text]) => (
                    <div key={title} className="flex items-start gap-4">
                      <div className="mt-1 text-primary">
                        <Icon name="check_circle" filled />
                      </div>
                      <div>
                        <h4 className="font-bold text-lg">{title}</h4>
                        <p className="text-on-surface-variant">{text}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-surface-container-lowest p-1 rounded-2xl shadow-2xl border border-outline-variant/20">
                <table className="w-full text-left">
                  <thead className="border-b border-outline-variant/10">
                    <tr>
                      <th className="p-5 text-[11px] uppercase tracking-widest text-on-surface-variant">Funkce</th>
                      <th className="p-5 text-[11px] uppercase tracking-widest text-on-surface">Fakturujto</th>
                      <th className="p-5 text-[11px] uppercase tracking-widest text-on-surface-variant opacity-50">iDoklad</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ["Měsíční paušál", "0 Kč", "od 260 Kč"],
                      ["Limit faktur", "Neomezeně", "Omezeno"],
                      ["Počet klientů", "Neomezeně", "Dle tarifu"],
                      ["Mobilní aplikace", "Web-App", "Ano"],
                    ].map(([a, b, c]) => (
                      <tr key={a} className="border-b border-outline-variant/5 last:border-b-0">
                        <td className="p-5 font-medium">{a}</td>
                        <td className="p-5 font-bold text-primary">{b}</td>
                        <td className="p-5 opacity-60">{c}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>

        <section id="faq" className="py-24">
          <div className="max-w-3xl mx-auto px-6">
            <h2 className="text-3xl font-extrabold tracking-tight text-center mb-12">Často kladené otázky</h2>
            <div className="space-y-4">
              {[
                ["Je systém opravdu zdarma?", "Ano, plnohodnotná verze Fakturujto je zdarma."],
                ["Jak exportovat data pro účetní?", "Faktury lze exportovat do PDF, CSV i XML."],
                ["Lze fakturovat i v cizích měnách?", "Ano, systém podporuje více měn."],
              ].map(([q, a], i) => (
                <details key={q} className="group bg-surface-container-low rounded-xl overflow-hidden" open={i === 0}>
                  <summary className="flex justify-between items-center p-6 cursor-pointer list-none font-bold text-on-surface">
                    {q}
                    <Icon name="expand_more" className="transition-transform group-open:rotate-180" />
                  </summary>
                  <div className="p-6 pt-0 text-on-surface-variant leading-relaxed">{a}</div>
                </details>
              ))}
            </div>
            <div id="cenik" className="mt-20 p-10 bg-primary rounded-3xl text-center text-on-primary shadow-2xl shadow-primary/30">
              <h2 className="text-4xl font-extrabold mb-6">Začněte fakturovat ještě dnes</h2>
              <p className="text-xl mb-8 opacity-90 max-w-lg mx-auto">Přidejte se k uživatelům, kteří neplatí za předražené systémy.</p>
              <button
                type="button"
                onClick={props.onRegister}
                className="bg-surface text-primary px-10 py-4 rounded-xl font-bold text-xl hover:scale-105 transition-transform cursor-pointer"
              >
                Založit účet zdarma
              </button>
            </div>
          </div>
        </section>
      </main>

      <footer className="rounded-t-3xl mt-20 bg-surface-container-low">
        <div className="px-8 py-12 flex flex-col md:flex-row justify-between items-center gap-8 max-w-7xl mx-auto">
          <div className="flex flex-col gap-2">
            <div className="text-lg font-black text-on-surface">Fakturujto</div>
            <p className="text-xs tracking-wide uppercase font-semibold text-on-surface opacity-60">
              © 2026 Fakturujto. Moderní auditor pro vaše podnikání.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-8 text-xs tracking-wide uppercase font-semibold">
            <a href="#" className="opacity-60 hover:opacity-100 hover:text-primary transition-all">
              Obchodní podmínky
            </a>
            <a href="#" className="opacity-60 hover:opacity-100 hover:text-primary transition-all">
              Ochrana údajů
            </a>
            <a href="#" className="opacity-60 hover:opacity-100 hover:text-primary transition-all">
              Kontakt
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

function LoginPage(props: {
  onLogin: (email: string, password: string) => Promise<void>;
  onGoRegister: () => void;
  onTryFree: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [showReset, setShowReset] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <AuthShell
      title="Přihlášení"
      subtitle="Fakturujto — moderní fakturace"
      onLogin={() => {}}
      onRegister={props.onGoRegister}
      onTryFree={props.onTryFree}
    >
      <form
        className="space-y-6"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          setBusy(true);
          try {
            await props.onLogin(email, password);
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="space-y-2">
          <label className="block text-[11px] font-bold uppercase tracking-widest text-on-surface-variant">Email</label>
          <input
            className="w-full px-4 py-3.5 bg-surface-container-low border-0 rounded-md focus:ring-2 focus:ring-primary/20 focus:outline-none text-sm"
            placeholder="vas@email.cz"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <label className="block text-[11px] font-bold uppercase tracking-widest text-on-surface-variant">Heslo</label>
            <button
              type="button"
              onClick={() => setShowReset((s) => !s)}
              className="text-[11px] font-semibold text-primary hover:underline cursor-pointer"
            >
              Zapomenuté heslo?
            </button>
          </div>
          <div className="relative">
            <input
              className="w-full px-4 pr-11 py-3.5 bg-surface-container-low border-0 rounded-md focus:ring-2 focus:ring-primary/20 focus:outline-none text-sm"
              placeholder="••••••••"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant/70 hover:text-primary cursor-pointer"
              aria-label={showPassword ? "Skrýt heslo" : "Zobrazit heslo"}
            >
              <Icon name={showPassword ? "visibility_off" : "visibility"} className="text-base" />
            </button>
          </div>
        </div>
        <label className="flex items-center gap-3 text-sm text-on-surface-variant cursor-pointer">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="h-5 w-5 rounded border-outline-variant text-primary focus:ring-primary/30"
          />
          Zapamatovat si mě
        </label>
        {error && <p className="text-xs text-error">{error}</p>}
        <button
          className="w-full auth-editorial-gradient text-on-primary font-semibold py-4 rounded-md shadow-lg shadow-primary/10 hover:brightness-110 active:scale-[0.98] transition-all text-sm disabled:opacity-60"
          type="submit"
          disabled={busy}
        >
          {busy ? "Přihlašuji…" : "Přihlásit se"}
        </button>
      </form>
      {showReset && (
        <div className="mt-6 rounded-lg border border-outline-variant/30 bg-surface-container-low/50 p-4 space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">Reset hesla</p>
          <p className="text-xs text-on-surface-variant leading-relaxed">
            Reset hesla e-mailem zatím není k dispozici. Po přihlášení si heslo změníte v sekci Uživatelé, nebo požádejte administrátora.
          </p>
        </div>
      )}
      <div className="text-center mt-7">
        <p className="text-sm text-on-surface-variant">
          Ještě nemáte účet?
          <button type="button" onClick={props.onGoRegister} className="font-bold text-primary hover:underline ml-1 cursor-pointer">
            Registrovat se
          </button>
        </p>
      </div>
    </AuthShell>
  );
}

function RegisterPage(props: {
  onRegister: (input: { fullName: string; email: string; password: string; ico: string; companyName: string }) => Promise<void>;
  onGoLogin: () => void;
  onTryFree: () => void;
}) {
  const icoWrapRef = useRef<HTMLDivElement>(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [icoQuery, setIcoQuery] = useState("");
  const [selectedIco, setSelectedIco] = useState("");
  const [companyNameFromAres, setCompanyNameFromAres] = useState("");
  const [aresHits, setAresHits] = useState<Buyer[]>([]);
  const [aresLoading, setAresLoading] = useState(false);
  const [aresLastFinishedQuery, setAresLastFinishedQuery] = useState<string | null>(null);
  const [aresDropdownSuppressed, setAresDropdownSuppressed] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = icoQuery.trim();
    if (!isAresClientSearchQuery(q)) {
      setAresHits([]);
      setAresLastFinishedQuery(null);
      setAresLoading(false);
      return;
    }
    const ac = new AbortController();
    const timer = window.setTimeout(async () => {
      setAresLoading(true);
      try {
        const hits = await searchAresFromWeb(q, ac.signal);
        if (!ac.signal.aborted) {
          setAresHits(hits);
          setAresLastFinishedQuery(q);
        }
      } catch {
        if (!ac.signal.aborted) {
          setAresHits([]);
          setAresLastFinishedQuery(q);
        }
      } finally {
        if (!ac.signal.aborted) setAresLoading(false);
      }
    }, 380);
    return () => {
      window.clearTimeout(timer);
      ac.abort();
    };
  }, [icoQuery]);

  const icoTrim = icoQuery.trim();
  const aresEmpty =
    isAresClientSearchQuery(icoTrim) &&
    !aresLoading &&
    aresLastFinishedQuery === icoTrim &&
    aresHits.length === 0;
  const showAresDropdown =
    !aresDropdownSuppressed &&
    isAresClientSearchQuery(icoTrim) &&
    (aresLoading || aresHits.length > 0 || aresEmpty);

  useEffect(() => {
    function onDocPointerDown(ev: PointerEvent) {
      const target = ev.target as Node | null;
      if (!target) return;
      if (!icoWrapRef.current) return;
      if (!icoWrapRef.current.contains(target)) {
        setAresDropdownSuppressed(true);
      }
    }
    document.addEventListener("pointerdown", onDocPointerDown);
    return () => document.removeEventListener("pointerdown", onDocPointerDown);
  }, []);

  return (
    <AuthShell
      title="Vytvořte si účet"
      subtitle="Začněte spravovat své faktury s Fakturujto"
      onLogin={props.onGoLogin}
      onRegister={() => {}}
      onTryFree={props.onTryFree}
    >
      <form
        className="space-y-6"
        onSubmit={async (e) => {
          e.preventDefault();
          if (password !== confirmPassword) {
            setError("Hesla se neshodují.");
            return;
          }
          setError(null);
          setBusy(true);
          try {
            const normalizedIco = selectedIco || (icoTrim.match(/^\d{8}$/)?.[0] ?? "");
            await props.onRegister({
              fullName,
              email,
              password,
              ico: normalizedIco,
              companyName: companyNameFromAres,
            });
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="space-y-2">
          <label className="block text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant">
            Jméno a příjmení
          </label>
          <input
            className="w-full px-4 py-3 bg-surface-container-low border-0 rounded-md focus:ring-2 focus:ring-primary/20 text-sm"
            placeholder="Jan Novák"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <label className="block text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant">E-mail</label>
          <input
            className="w-full px-4 py-3 bg-surface-container-low border-0 rounded-md focus:ring-2 focus:ring-primary/20 text-sm"
            placeholder="jan@firma.cz"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-2 relative" ref={icoWrapRef}>
          <div className="flex items-center justify-between gap-2">
            <label className="block text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant">IČO</label>
            <span className="text-[10px] text-outline italic">Nepovinné</span>
          </div>
          <input
            className="w-full px-4 py-3 bg-surface-container-low border-0 rounded-md focus:ring-2 focus:ring-primary/20 text-sm"
            placeholder="12345678"
            value={icoQuery}
            onFocus={() => setAresDropdownSuppressed(false)}
            onChange={(e) => {
              setAresDropdownSuppressed(false);
              setSelectedIco("");
              setCompanyNameFromAres("");
              setIcoQuery(e.target.value);
            }}
          />
          {showAresDropdown && (
            <ul className="absolute z-30 mt-1 w-full app-panel p-0 max-h-64 overflow-auto text-sm shadow-geist-md rounded-lg border-outline-variant/50">
              {aresLoading && aresHits.length === 0 && !aresEmpty && (
                <li className="px-4 py-3 text-xs text-on-surface-variant flex items-center gap-2 border-b border-outline-variant/20">
                  <span className="h-3.5 w-3.5 shrink-0 rounded-full border-2 border-primary/25 border-t-primary animate-spin" />
                  Načítám z ARES…
                </li>
              )}
              {aresEmpty && <li className="px-4 py-3 text-xs text-on-surface-variant">Žádná shoda v ARES.</li>}
              {aresHits.map((b) => (
                <li key={b.ico + b.name}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setIcoQuery(b.name);
                      setSelectedIco(b.ico);
                      setCompanyNameFromAres(b.name || "");
                      setAresDropdownSuppressed(true);
                    }}
                    className="w-full text-left px-4 py-2.5 geist-transition hover:bg-surface-container-low border-b border-outline-variant/20 last:border-b-0"
                  >
                    <span className="font-medium text-on-surface text-sm block leading-snug">{b.name}</span>
                    <span className="text-[11px] text-on-surface-variant mt-0.5 block">
                      IČ {b.ico}
                      {b.dic ? ` · DIČ ${b.dic}` : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="grid grid-cols-1 gap-4">
          <div className="space-y-2">
            <label className="block text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant">Heslo</label>
            <div className="relative">
              <input
                className="w-full px-4 pr-11 py-3 bg-surface-container-low border-0 rounded-md focus:ring-2 focus:ring-primary/20 text-sm"
                placeholder="••••••••"
                type={showPassword ? "text" : "password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant/70 hover:text-primary cursor-pointer"
                aria-label={showPassword ? "Skrýt heslo" : "Zobrazit heslo"}
              >
                <Icon name={showPassword ? "visibility_off" : "visibility"} className="text-base" />
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <label className="block text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant">
              Potvrzení hesla
            </label>
            <div className="relative">
              <input
                className="w-full px-4 pr-11 py-3 bg-surface-container-low border-0 rounded-md focus:ring-2 focus:ring-primary/20 text-sm"
                placeholder="••••••••"
                type={showConfirmPassword ? "text" : "password"}
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant/70 hover:text-primary cursor-pointer"
                aria-label={showConfirmPassword ? "Skrýt heslo" : "Zobrazit heslo"}
              >
                <Icon name={showConfirmPassword ? "visibility_off" : "visibility"} className="text-base" />
              </button>
            </div>
          </div>
        </div>
        {error && <p className="text-xs text-error">{error}</p>}
        <button
          disabled={busy}
          className="w-full auth-editorial-gradient text-on-primary font-semibold py-4 rounded-md shadow-lg shadow-primary/20 hover:opacity-90 active:scale-[0.98] transition-all text-sm disabled:opacity-50"
          type="submit"
        >
          Vytvořit účet
        </button>
      </form>
      <div className="text-center mt-7">
        <p className="text-sm text-on-surface-variant">
          Už máte účet?
          <button type="button" onClick={props.onGoLogin} className="text-primary font-semibold hover:underline ml-1 cursor-pointer">
            Přihlaste se
          </button>
        </p>
      </div>
    </AuthShell>
  );
}

function UsersManagementPage(props: {
  users: AppUser[];
  currentUserId: string;
  onDeleteUser: (id: string) => Promise<void>;
  onSetRole: (id: string, role: UserRole) => Promise<void>;
  onInviteUser: (input: {
    fullName: string;
    email: string;
    password: string;
    role: UserRole;
    ico: string;
    companyName: string;
  }) => Promise<void>;
  onChangeOwnPassword: (currentPassword: string, newPassword: string) => Promise<void>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [invite, setInvite] = useState({
    fullName: "",
    email: "",
    password: "",
    role: "user" as UserRole,
    ico: "",
    companyName: "",
  });
  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwNew2, setPwNew2] = useState("");
  const currentUser = props.users.find((u) => u.id === props.currentUserId) ?? null;

  return (
    <div className="max-w-geist-content mx-auto space-y-6">
      <header className="mb-1">
        <h1 className="text-xl font-semibold tracking-geist-heading leading-geist-tight text-on-surface">Správa uživatelů</h1>
        <p className="text-on-surface-variant/55 text-[11px] font-medium tracking-wide mt-0.5">PŘÍSTUPY DO APLIKACE</p>
      </header>
      <section className="rounded-xl border border-outline-variant/35 bg-surface-container-low/80 p-5 sm:p-6 space-y-4">
        {error && <p className="mb-4 text-xs text-error">{error}</p>}
        <ul className="divide-y divide-outline-variant/20">
          {props.users.map((u) => (
            <li key={u.id} className="py-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-on-surface">{u.fullName || "Bez jména"}</p>
                <p className="text-[11px] text-on-surface-variant">
                  {u.email} · <span className="uppercase">{u.role}</span>
                </p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={u.role}
                  disabled={u.id === props.currentUserId}
                  onChange={(e) => {
                    const role = e.target.value as UserRole;
                    void (async () => {
                      try {
                        await props.onSetRole(u.id, role);
                        setError(null);
                      } catch (err) {
                        setError(err instanceof Error ? err.message : String(err));
                      }
                    })();
                  }}
                  className="px-2 py-1 text-xs rounded border border-outline-variant/35 bg-white disabled:opacity-50"
                >
                  <option value="user">user</option>
                  <option value="admin">admin</option>
                </select>
                {u.id === props.currentUserId ? (
                  <span className="text-[10px] uppercase tracking-wide px-2 py-1 rounded bg-primary/10 text-primary font-semibold">
                    Aktuální
                  </span>
                ) : (
                  <button
                    type="button"
                    className="text-xs font-semibold text-error hover:underline cursor-pointer"
                    onClick={() => {
                      void (async () => {
                        try {
                          await props.onDeleteUser(u.id);
                          setError(null);
                        } catch (e) {
                          setError(e instanceof Error ? e.message : String(e));
                        }
                      })();
                    }}
                  >
                    Smazat
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>

        <div className="pt-4 border-t border-outline-variant/25 space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">Pozvat uživatele</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              className="px-3 py-2.5 rounded-md border border-outline-variant/35 bg-white text-sm"
              placeholder="Jméno"
              value={invite.fullName}
              onChange={(e) => setInvite((s) => ({ ...s, fullName: e.target.value }))}
            />
            <input
              className="px-3 py-2.5 rounded-md border border-outline-variant/35 bg-white text-sm"
              placeholder="Email"
              type="email"
              value={invite.email}
              onChange={(e) => setInvite((s) => ({ ...s, email: e.target.value }))}
            />
            <input
              className="px-3 py-2.5 rounded-md border border-outline-variant/35 bg-white text-sm"
              placeholder="Dočasné heslo"
              type="password"
              value={invite.password}
              onChange={(e) => setInvite((s) => ({ ...s, password: e.target.value }))}
            />
            <select
              className="px-3 py-2.5 rounded-md border border-outline-variant/35 bg-white text-sm"
              value={invite.role}
              onChange={(e) => setInvite((s) => ({ ...s, role: e.target.value as UserRole }))}
            >
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
            <input
              className="px-3 py-2.5 rounded-md border border-outline-variant/35 bg-white text-sm"
              placeholder="IČO (volitelné)"
              value={invite.ico}
              onChange={(e) => setInvite((s) => ({ ...s, ico: e.target.value.replace(/\D/g, "").slice(0, 8) }))}
            />
            <input
              className="px-3 py-2.5 rounded-md border border-outline-variant/35 bg-white text-sm"
              placeholder="Název firmy"
              value={invite.companyName}
              onChange={(e) => setInvite((s) => ({ ...s, companyName: e.target.value }))}
            />
          </div>
          <button
            type="button"
            disabled={inviteBusy}
            onClick={async () => {
              setInviteBusy(true);
              try {
                await props.onInviteUser(invite);
                setInvite({
                  fullName: "",
                  email: "",
                  password: "",
                  role: "user",
                  ico: "",
                  companyName: "",
                });
                setError(null);
              } catch (err) {
                setError(err instanceof Error ? err.message : String(err));
              } finally {
                setInviteBusy(false);
              }
            }}
            className="px-4 py-2 rounded-md bg-primary text-on-primary text-xs font-semibold uppercase tracking-wide disabled:opacity-50"
          >
            Pozvat uživatele
          </button>
        </div>

        <div className="pt-4 border-t border-outline-variant/25 space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant">
            Změna hesla ({currentUser?.email || "aktuální uživatel"})
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              className="px-3 py-2.5 rounded-md border border-outline-variant/35 bg-white text-sm"
              type="password"
              placeholder="Aktuální heslo"
              value={pwCurrent}
              onChange={(e) => setPwCurrent(e.target.value)}
            />
            <input
              className="px-3 py-2.5 rounded-md border border-outline-variant/35 bg-white text-sm"
              type="password"
              placeholder="Nové heslo"
              value={pwNew}
              onChange={(e) => setPwNew(e.target.value)}
            />
            <input
              className="px-3 py-2.5 rounded-md border border-outline-variant/35 bg-white text-sm"
              type="password"
              placeholder="Potvrdit nové heslo"
              value={pwNew2}
              onChange={(e) => setPwNew2(e.target.value)}
            />
          </div>
          <button
            type="button"
            onClick={() => {
              if (pwNew !== pwNew2) {
                setError("Nová hesla se neshodují.");
                return;
              }
              void (async () => {
                try {
                  await props.onChangeOwnPassword(pwCurrent, pwNew);
                  setPwCurrent("");
                  setPwNew("");
                  setPwNew2("");
                  setError(null);
                } catch (err) {
                  setError(err instanceof Error ? err.message : String(err));
                }
              })();
            }}
            className="px-4 py-2 rounded-md bg-surface-container-high text-on-surface text-xs font-semibold uppercase tracking-wide"
          >
            Změnit heslo
          </button>
        </div>
      </section>
    </div>
  );
}

type InvoiceListFilter = "all" | "paid" | "unpaid" | "overdue";

function invoiceListRowUi(inv: StoredInvoice, today: string): "paid" | "unpaid" | "overdue" {
  if (inv.status === "paid") return "paid";
  if (inv.dueDate < today) return "overdue";
  return "unpaid";
}

function InvoicesListPage(props: {
  invoices: StoredInvoice[];
  supplierProfile: Supplier;
  onOpen: (i: StoredInvoice) => void;
  onSaveInvoiceStatus: (inv: StoredInvoice, status: InvoiceStatus) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onPdfError: (message: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<InvoiceListFilter>("all");
  const [payBusyId, setPayBusyId] = useState<number | null>(null);
  const [deleteBusyId, setDeleteBusyId] = useState<number | null>(null);
  const [pdfBusyId, setPdfBusyId] = useState<number | null>(null);

  const sorted = useMemo(
    () => [...props.invoices].sort((a, b) => b.id - a.id),
    [props.invoices],
  );

  const today = todayIso();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sorted.filter((inv) => {
      const dokladVs = (inv.number.trim() || inv.constantSymbol.trim()).toLowerCase();
      const buyer = inv.buyer.name.trim().toLowerCase();
      if (q && !dokladVs.includes(q) && !buyer.includes(q)) return false;
      const row = invoiceListRowUi(inv, today);
      if (tab === "paid") return row === "paid";
      if (tab === "unpaid") return row === "unpaid";
      if (tab === "overdue") return row === "overdue";
      return true;
    });
  }, [sorted, query, tab, today]);

  async function handlePaymentToggle(inv: StoredInvoice) {
    if (inv.status === "paid") {
      if (!confirm("Chcete zrušit proplacení? Faktura bude znovu vedena jako neuhrazená.")) return;
    }
    setPayBusyId(inv.id);
    try {
      const next: InvoiceStatus = inv.status === "paid" ? "unpaid" : "paid";
      await props.onSaveInvoiceStatus(inv, next);
    } catch {
      /* chyba v horní liště */
    } finally {
      setPayBusyId(null);
    }
  }

  async function handleDelete(inv: StoredInvoice) {
    const label = inv.number.trim() || inv.constantSymbol.trim() || String(inv.id);
    if (!confirm(`Opravdu smazat fakturu (${label})? Tuto akci nelze vrátit.`)) return;
    setDeleteBusyId(inv.id);
    try {
      await props.onDelete(inv.id);
    } catch {
      /* chyba v horní liště */
    } finally {
      setDeleteBusyId(null);
    }
  }

  function rowLocked(inv: StoredInvoice) {
    return payBusyId === inv.id || deleteBusyId === inv.id || pdfBusyId === inv.id;
  }

  async function handleDownloadPdf(inv: StoredInvoice) {
    setPdfBusyId(inv.id);
    try {
      const forPdf: StoredInvoice = {
        ...inv,
        supplier: structuredClone(props.supplierProfile),
      };
      await downloadInvoicePdf(forPdf);
    } catch (e) {
      props.onPdfError(e instanceof Error ? e.message : String(e));
    } finally {
      setPdfBusyId(null);
    }
  }

  const tabBtn = (id: InvoiceListFilter, label: string) => (
    <button
      key={id}
      type="button"
      onClick={() => setTab(id)}
      className={`px-4 py-2 rounded-lg text-sm font-medium geist-transition ${
        tab === id
          ? "bg-white text-primary shadow-geist-sm border border-outline-variant/40"
          : "text-on-surface-variant hover:text-on-surface"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="max-w-geist-content mx-auto space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-end">
        <div>
          <nav className="flex items-center gap-1.5 text-[11px] font-medium text-on-surface-variant/50 mb-1.5">
            <span>Dokumenty</span>
            <Icon name="chevron_right" className="text-xs text-on-surface-variant/35" />
            <span className="text-primary">Vydané faktury</span>
          </nav>
          <h1 className="text-xl font-semibold tracking-geist-heading leading-geist-tight text-on-surface">Vydané faktury</h1>
          <p className="text-on-surface-variant/55 text-[11px] font-medium tracking-wide mt-0.5">PŘEHLED DOKLADŮ</p>
        </div>
        <Link
          to="/vystavit-fakturu"
          className="inline-flex items-center justify-center gap-2 self-start sm:self-auto px-5 py-2.5 rounded-xl text-sm font-semibold bg-primary text-on-primary shadow-geist-md border border-primary/25 hover:brightness-105 active:scale-[0.98] geist-transition"
        >
          <Icon name="add" className="text-lg" />
          Nová faktura
        </Link>
      </header>

      <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-center justify-between rounded-2xl border border-outline-variant/35 bg-surface-container-low/80 p-2 shadow-geist-sm">
        <div className="relative w-full lg:max-w-md group">
          <Icon
            name="search"
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant/45 group-focus-within:text-primary geist-transition pointer-events-none"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Hledat podle VS nebo odběratele…"
            className="w-full pl-10 pr-4 py-2.5 text-sm bg-white/95 border border-outline-variant/40 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary/35 text-on-surface placeholder:text-on-surface-variant/60 shadow-geist-sm geist-transition"
            autoComplete="off"
          />
        </div>
        <div className="flex flex-wrap gap-1 bg-surface-container-high/40 p-1 rounded-xl border border-outline-variant/25">
          {tabBtn("all", "Všechny")}
          {tabBtn("paid", "Uhrazené")}
          {tabBtn("unpaid", "Neuhrazené")}
          {tabBtn("overdue", "Po splatnosti")}
        </div>
      </div>

      <div className="app-panel overflow-hidden p-0 hover:shadow-geist-md hover:ring-primary/10 rounded-2xl border border-outline-variant/30 shadow-[0_4px_40px_rgba(113,0,140,0.04)]">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse min-w-[980px]">
            <thead>
              <tr className="text-left border-b border-outline-variant/25 bg-surface-container-low/30">
                <th className="px-5 sm:px-6 py-4 text-[10px] font-semibold uppercase tracking-wide text-outline">
                  Číslo dokladu
                </th>
                <th className="px-4 py-4 text-[10px] font-semibold uppercase tracking-wide text-outline">Stav</th>
                <th className="px-4 py-4 text-[10px] font-semibold uppercase tracking-wide text-outline">Popis</th>
                <th className="px-4 py-4 text-[10px] font-semibold uppercase tracking-wide text-outline">Odběratel</th>
                <th className="px-4 py-4 text-[10px] font-semibold uppercase tracking-wide text-outline">Vystaveno</th>
                <th className="px-4 py-4 text-[10px] font-semibold uppercase tracking-wide text-outline">Splatnost</th>
                <th className="px-4 py-4 text-[10px] font-semibold uppercase tracking-wide text-outline text-right">Cena</th>
                <th className="px-5 sm:px-6 py-4 text-[10px] font-semibold uppercase tracking-wide text-outline text-right">
                  Akce
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/15">
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-14 text-center text-sm text-on-surface-variant">
                    {sorted.length === 0 ? "Zatím žádné faktury." : "Žádná faktura neodpovídá filtru."}
                  </td>
                </tr>
              )}
              {filtered.map((inv) => {
                const row = invoiceListRowUi(inv, today);
                const firstLine = inv.lineItems[0]?.description?.trim() || "—";
                const dokladVs = inv.number.trim() || inv.constantSymbol.trim() || "—";
                const overdueStyle = row === "overdue";
                return (
                  <tr key={inv.id} className="group hover:bg-surface-container-low/40 geist-transition">
                    <td
                      className={`px-5 sm:px-6 py-4 text-sm font-semibold tabular-nums ${
                        overdueStyle ? "text-error" : "text-on-surface"
                      }`}
                    >
                      {dokladVs}
                    </td>
                    <td className="px-4 py-4">
                      {row === "paid" && (
                        <span
                          className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-emerald-50 text-emerald-600"
                          title="Uhrazeno"
                        >
                          <Icon name="check_circle" filled className="text-lg" />
                        </span>
                      )}
                      {row === "unpaid" && (
                        <span
                          className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-surface-container-high text-on-surface-variant/55"
                          title="Neuhrazeno"
                        >
                          <Icon name="close" className="text-lg" />
                        </span>
                      )}
                      {row === "overdue" && (
                        <span
                          className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-error/10 text-error"
                          title="Neuhrazeno po splatnosti"
                        >
                          <Icon name="cancel" filled className="text-lg" />
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-sm font-medium text-on-surface/85 max-w-[200px] truncate" title={firstLine}>
                      {firstLine}
                    </td>
                    <td className="px-4 py-4 text-sm text-on-surface-variant max-w-[180px] truncate" title={inv.buyer.name}>
                      {inv.buyer.name || "—"}
                    </td>
                    <td className="px-4 py-4 text-sm tabular-nums text-on-surface-variant/80">{formatDateCs(inv.issueDate)}</td>
                    <td
                      className={`px-4 py-4 text-sm tabular-nums ${
                        overdueStyle ? "text-error font-semibold" : "text-on-surface-variant/80"
                      }`}
                    >
                      {formatDateCs(inv.dueDate)}
                    </td>
                    <td className="px-4 py-4 text-right text-sm font-semibold tabular-nums text-on-surface">
                      {formatCzk(invoiceTotal(inv))}
                    </td>
                    <td className="px-4 sm:px-6 py-4">
                      <div className="flex items-center justify-end gap-0.5 flex-wrap sm:flex-nowrap">
                        <button
                          type="button"
                          title={inv.status === "paid" ? "Uhrazenou fakturu nelze upravit" : "Upravit"}
                          aria-label="Upravit fakturu"
                          disabled={inv.status === "paid" || rowLocked(inv)}
                          onClick={() => props.onOpen(inv)}
                          className="p-2 rounded-lg text-on-surface-variant hover:bg-primary/10 hover:text-primary geist-transition cursor-pointer disabled:opacity-40"
                        >
                          <Icon name="edit" className="text-xl" />
                        </button>
                        <button
                          type="button"
                          title="Stáhnout PDF"
                          aria-label="Stáhnout PDF"
                          disabled={rowLocked(inv)}
                          onClick={() => void handleDownloadPdf(inv)}
                          className="p-2 rounded-lg text-on-surface-variant hover:bg-primary/10 hover:text-primary geist-transition cursor-pointer disabled:opacity-40"
                        >
                          {pdfBusyId === inv.id ? (
                            <span className="inline-block h-5 w-5 rounded-full border-2 border-primary/25 border-t-primary animate-spin" />
                          ) : (
                            <Icon name="download" className="text-xl" />
                          )}
                        </button>
                        <button
                          type="button"
                          title={inv.status === "paid" ? "Zrušit úhradu" : "Označit jako uhrazeno"}
                          aria-label={inv.status === "paid" ? "Zrušit úhradu" : "Označit jako uhrazeno"}
                          disabled={rowLocked(inv)}
                          onClick={() => void handlePaymentToggle(inv)}
                          className="p-2 rounded-lg text-on-surface-variant hover:bg-primary/10 hover:text-primary geist-transition cursor-pointer disabled:opacity-40"
                        >
                          {payBusyId === inv.id ? (
                            <span className="inline-block h-5 w-5 rounded-full border-2 border-primary/25 border-t-primary animate-spin" />
                          ) : inv.status === "paid" ? (
                            <Icon name="undo" className="text-xl" />
                          ) : (
                            <Icon name="credit_card" className="text-xl" />
                          )}
                        </button>
                        <button
                          type="button"
                          title={inv.status === "paid" ? "Uhrazenou fakturu nelze smazat" : "Smazat fakturu"}
                          aria-label="Smazat fakturu"
                          disabled={inv.status === "paid" || rowLocked(inv)}
                          onClick={() => void handleDelete(inv)}
                          className="p-2 rounded-lg text-on-surface-variant hover:bg-error/10 hover:text-error geist-transition cursor-pointer disabled:opacity-40"
                        >
                          {deleteBusyId === inv.id ? (
                            <span className="inline-block h-5 w-5 rounded-full border-2 border-primary/25 border-t-primary animate-spin" />
                          ) : (
                            <Icon name="delete" className="text-xl" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="px-5 sm:px-6 py-4 bg-surface-container-low/25 border-t border-outline-variant/15 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
          <p className="text-[11px] font-medium text-on-surface-variant/70">
            Zobrazeno {filtered.length} z {sorted.length} faktur
          </p>
        </div>
      </div>
    </div>
  );
}

function DashboardOverview(props: {
  invoices: StoredInvoice[];
  paidTotal: number;
  unpaidTotal: number;
  recent: StoredInvoice[];
  onOpen: (i: StoredInvoice) => void;
}) {
  const [period, setPeriod] = useState<"month" | "quarter" | "year">("month");
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  const totalSales = useMemo(
    () => props.invoices.reduce((sum, inv) => sum + invoiceTotal(inv), 0),
    [props.invoices],
  );

  const annualTurnover = useMemo(() => {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    return props.invoices.reduce((sum, inv) => {
      const dt = new Date(inv.issueDate);
      if (Number.isNaN(dt.getTime())) return sum;
      if (dt >= from && dt <= now) return sum + invoiceTotal(inv);
      return sum;
    }, 0);
  }, [props.invoices]);

  const dphLimit = 2_000_000;
  const dphPct = Math.max(0, Math.min(100, Math.round((annualTurnover / dphLimit) * 100)));

  const chartData = useMemo(() => {
    const now = new Date();
    const months = ["Led", "Úno", "Bře", "Dub", "Kvě", "Čvn", "Čvc", "Srp", "Zář", "Říj", "Lis", "Pro"];

    if (period === "month") {
      const points = Array.from({ length: 6 }, (_, i) => {
        const dt = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
        const key = `${dt.getFullYear()}-${dt.getMonth()}`;
        return { key, label: months[dt.getMonth()], paid: 0, total: 0 };
      });
      const map = new Map(points.map((p) => [p.key, p]));
      for (const inv of props.invoices) {
        const dt = new Date(inv.issueDate);
        if (Number.isNaN(dt.getTime())) continue;
        const key = `${dt.getFullYear()}-${dt.getMonth()}`;
        const point = map.get(key);
        if (!point) continue;
        const amount = invoiceTotal(inv);
        point.total += amount;
        if (inv.status === "paid") point.paid += amount;
      }
      return points;
    }

    if (period === "quarter") {
      const points = Array.from({ length: 4 }, (_, i) => {
        const dt = new Date(now.getFullYear(), now.getMonth() - (3 * (3 - i)), 1);
        const q = Math.floor(dt.getMonth() / 3) + 1;
        const key = `${dt.getFullYear()}-Q${q}`;
        return { key, label: `Q${q}/${String(dt.getFullYear()).slice(-2)}`, paid: 0, total: 0 };
      });
      const map = new Map(points.map((p) => [p.key, p]));
      for (const inv of props.invoices) {
        const dt = new Date(inv.issueDate);
        if (Number.isNaN(dt.getTime())) continue;
        const q = Math.floor(dt.getMonth() / 3) + 1;
        const key = `${dt.getFullYear()}-Q${q}`;
        const point = map.get(key);
        if (!point) continue;
        const amount = invoiceTotal(inv);
        point.total += amount;
        if (inv.status === "paid") point.paid += amount;
      }
      return points;
    }

    const points = Array.from({ length: 5 }, (_, i) => {
      const y = now.getFullYear() - (4 - i);
      return { key: String(y), label: String(y), paid: 0, total: 0 };
    });
    const map = new Map(points.map((p) => [p.key, p]));
    for (const inv of props.invoices) {
      const dt = new Date(inv.issueDate);
      if (Number.isNaN(dt.getTime())) continue;
      const point = map.get(String(dt.getFullYear()));
      if (!point) continue;
      const amount = invoiceTotal(inv);
      point.total += amount;
      if (inv.status === "paid") point.paid += amount;
    }
    return points;
  }, [period, props.invoices]);

  const maxChart = useMemo(() => Math.max(1, ...chartData.map((p) => Math.max(p.total, p.paid))), [chartData]);
  const chartScaleMax = useMemo(() => {
    if (maxChart <= 1000) return 1000;
    if (maxChart <= 10_000) return Math.ceil(maxChart / 1000) * 1000;
    if (maxChart <= 100_000) return Math.ceil(maxChart / 10_000) * 10_000;
    return Math.ceil(maxChart / 100_000) * 100_000;
  }, [maxChart]);
  const yTicks = useMemo(
    () => [1, 0.75, 0.5, 0.25, 0].map((ratio) => Math.round(chartScaleMax * ratio)),
    [chartScaleMax],
  );

  const expectedPayments = useMemo(() => {
    const today = new Date();
    return props.invoices
      .filter((inv) => inv.status !== "paid")
      .map((inv) => {
        const due = new Date(inv.dueDate);
        const daysToDue = Number.isNaN(due.getTime()) ? 0 : Math.ceil((due.getTime() - today.getTime()) / 86_400_000);
        return { inv, daysToDue };
      })
      .sort((a, b) => {
        const ad = new Date(a.inv.dueDate).getTime();
        const bd = new Date(b.inv.dueDate).getTime();
        return ad - bd;
      })
      .slice(0, 5);
  }, [props.invoices]);

  return (
    <div className="max-w-[1180px] mx-auto space-y-8">
      <header className="flex items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold tracking-[0.1em] text-on-surface/40 uppercase mb-1">Vítejte zpět</p>
          <h1 className="text-3xl font-black text-on-surface tracking-tight">Přehled financí</h1>
        </div>
        <Link
          to="/vystavit-fakturu"
          className="px-4 py-2 rounded-xl bg-primary text-on-primary text-xs font-bold uppercase tracking-wide"
        >
          Nová faktura
        </Link>
      </header>

      <section className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="bg-surface-container-lowest rounded-xl p-6">
          <p className="text-[11px] uppercase tracking-[0.05em] font-bold text-on-surface/50">Prodej</p>
          <p className="mt-4 text-2xl font-bold tabular-nums text-on-surface">{formatAmountCs(totalSales)} Kč</p>
        </div>
        <div className="bg-surface-container-lowest rounded-xl p-6">
          <p className="text-[11px] uppercase tracking-[0.05em] font-bold text-on-surface/50">Uhrazeno</p>
          <p className="mt-4 text-2xl font-bold tabular-nums text-emerald-600">{formatAmountCs(props.paidTotal)} Kč</p>
        </div>
        <div className="bg-surface-container-lowest rounded-xl p-6 border-l-4 border-primary/20">
          <p className="text-[11px] uppercase tracking-[0.05em] font-bold text-on-surface/50">Neuhrazeno</p>
          <p className="mt-4 text-2xl font-bold tabular-nums text-error">{formatAmountCs(props.unpaidTotal)} Kč</p>
        </div>
        <div className="bg-primary-container text-on-primary-container rounded-xl p-6 shadow-lg shadow-primary/10">
          <p className="text-[11px] uppercase tracking-[0.05em] font-bold opacity-65">Rozdíl (zisk)</p>
          <p className="mt-4 text-3xl font-black tabular-nums">{formatAmountCs(totalSales - props.unpaidTotal)} Kč</p>
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-8 bg-surface-container-lowest rounded-xl p-6 h-full flex flex-col">
          <div className="flex items-center justify-between gap-3 mb-8">
            <h2 className="text-sm font-black uppercase tracking-wider text-on-surface">Fakturace za období</h2>
            <div className="flex gap-1 bg-surface-container-low rounded-lg p-1">
              <button
                type="button"
                onClick={() => setPeriod("month")}
                className={`px-3 py-1 text-[10px] font-bold uppercase rounded-md cursor-pointer ${
                  period === "month" ? "bg-white shadow-sm text-primary" : "text-on-surface/40"
                }`}
              >
                Měsíc
              </button>
              <button
                type="button"
                onClick={() => setPeriod("quarter")}
                className={`px-3 py-1 text-[10px] font-bold uppercase rounded-md cursor-pointer ${
                  period === "quarter" ? "bg-white shadow-sm text-primary" : "text-on-surface/40"
                }`}
              >
                Kvartál
              </button>
              <button
                type="button"
                onClick={() => setPeriod("year")}
                className={`px-3 py-1 text-[10px] font-bold uppercase rounded-md cursor-pointer ${
                  period === "year" ? "bg-white shadow-sm text-primary" : "text-on-surface/40"
                }`}
              >
                Rok
              </button>
            </div>
          </div>
          <div className="h-64 flex gap-3 flex-1">
            <div className="w-20 h-full flex flex-col justify-between pr-1">
              {yTicks.map((tick, i) => (
                <span key={`${tick}-${i}`} className="text-[10px] font-semibold text-on-surface/35 tabular-nums leading-none">
                  {formatAmountCs(tick)} Kč
                </span>
              ))}
            </div>
            <div className="flex-1 h-full flex items-end justify-between gap-3">
            {chartData.map((p) => {
              const totalH = Math.max(4, Math.round((p.total / chartScaleMax) * 100));
              const paidH = Math.max(4, Math.round((p.paid / chartScaleMax) * 100));
              const showTip = hoveredKey === p.key;
              return (
                <div key={p.key} className="flex-1 flex flex-col items-center relative">
                  {showTip && (
                    <div className="absolute -top-14 z-20 rounded-lg border border-outline-variant/35 bg-white px-2.5 py-1.5 shadow-geist-md pointer-events-none">
                      <p className="text-[10px] font-bold text-on-surface">{p.label}</p>
                      <p className="text-[10px] text-on-surface-variant">Celkem: {formatCzk(p.total)}</p>
                      <p className="text-[10px] text-on-surface-variant">Uhrazeno: {formatCzk(p.paid)}</p>
                    </div>
                  )}
                  <div className="w-full h-52 flex items-end gap-1.5">
                    <div
                      className="w-1/2 bg-primary/20 rounded-t-md transition-all cursor-pointer"
                      style={{ height: `${paidH}%` }}
                      title={`Uhrazeno: ${formatCzk(p.paid)}`}
                      onMouseEnter={() => setHoveredKey(p.key)}
                      onMouseLeave={() => setHoveredKey((curr) => (curr === p.key ? null : curr))}
                    />
                    <div
                      className="w-1/2 bg-primary-container rounded-t-md transition-all cursor-pointer"
                      style={{ height: `${totalH}%` }}
                      title={`Celkem: ${formatCzk(p.total)}`}
                      onMouseEnter={() => setHoveredKey(p.key)}
                      onMouseLeave={() => setHoveredKey((curr) => (curr === p.key ? null : curr))}
                    />
                  </div>
                  <span className="mt-3 text-[10px] font-bold uppercase text-on-surface/35">{p.label}</span>
                </div>
              );
            })}
            </div>
          </div>
        </div>

        <div className="lg:col-span-4 flex flex-col gap-6 h-full">
          <div className="bg-surface-container-lowest rounded-xl p-6 flex-1">
            <h3 className="text-sm font-black uppercase tracking-wider text-on-surface mb-5">Limit plátce DPH</h3>
            <div className="flex items-end justify-between mb-3">
              <p className="text-3xl font-black tabular-nums text-on-surface">
                {Math.round(annualTurnover / 1000)}k <span className="text-xs font-bold text-on-surface/40">/ 2M Kč</span>
              </p>
              <span className="text-xs font-black text-primary px-2 py-1 rounded-md bg-primary/10">{dphPct}%</span>
            </div>
            <div className="h-3 rounded-full bg-surface-container-low overflow-hidden">
              <div className="h-full bg-primary-container rounded-full" style={{ width: `${dphPct}%` }} />
            </div>
            <p className="mt-3 text-[10px] italic text-on-surface/40">
              Aktuální obrat za posledních 12 po sobě jdoucích měsíců.
            </p>
          </div>

          <div className="bg-surface-container-low rounded-xl p-5 flex-1">
            <h3 className="text-xs font-black uppercase tracking-wider text-on-surface mb-4">Rychlé akce</h3>
            <div className="grid grid-cols-2 gap-3">
              <Link
                to="/vystavit-fakturu"
                className="rounded-xl bg-white p-4 flex flex-col items-center justify-center gap-2 hover:shadow-geist-sm geist-transition"
              >
                <Icon name="attach_file_add" className="text-primary" />
                <span className="text-[10px] font-bold uppercase text-on-surface">Nová faktura</span>
              </Link>
              <Link
                to="/klienti"
                className="rounded-xl bg-white p-4 flex flex-col items-center justify-center gap-2 hover:shadow-geist-sm geist-transition"
              >
                <Icon name="person_add" className="text-primary" />
                <span className="text-[10px] font-bold uppercase text-on-surface">Nový klient</span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-surface-container-lowest rounded-xl p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-sm font-black uppercase tracking-wider text-on-surface">Očekávané platby</h2>
          <Link
            to="/faktury"
            className="text-[10px] font-bold uppercase text-primary border-b-2 border-primary/20 hover:border-primary"
          >
            Zobrazit vše
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left">
            <thead>
              <tr className="border-b border-outline-variant/20">
                <th className="pb-3 text-[10px] font-bold uppercase tracking-widest text-on-surface/30">Číslo / klient</th>
                <th className="pb-3 text-[10px] font-bold uppercase tracking-widest text-on-surface/30">Termín</th>
                <th className="pb-3 text-[10px] font-bold uppercase tracking-widest text-on-surface/30">Částka</th>
                <th className="pb-3 text-[10px] font-bold uppercase tracking-widest text-on-surface/30">Stav termínu</th>
                <th className="pb-3 text-[10px] font-bold uppercase tracking-widest text-on-surface/30">Akce</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {expectedPayments.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-xs text-on-surface-variant">
                    Žádné očekávané platby.
                  </td>
                </tr>
              )}
              {expectedPayments.map(({ inv, daysToDue }) => (
                <tr key={inv.id} className="hover:bg-surface-container-low/70 transition-colors">
                  <td className="py-4">
                    <button type="button" onClick={() => props.onOpen(inv)} className="text-left cursor-pointer">
                      <span className="block text-sm font-bold text-on-surface">{inv.number}</span>
                      <span className="block text-[10px] font-medium uppercase text-on-surface/50">{inv.buyer.name || "—"}</span>
                    </button>
                  </td>
                  <td className="py-4 text-sm text-on-surface/80">{formatDateCs(inv.dueDate)}</td>
                  <td className="py-4 text-sm font-bold tabular-nums text-on-surface">{formatCzk(invoiceTotal(inv))}</td>
                  <td className="py-4">
                    {daysToDue >= 0 ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary">
                        za {daysToDue} {daysToDue === 1 ? "den" : "dní"}
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-error-container text-on-error-container">
                        po splatnosti {Math.abs(daysToDue)} {Math.abs(daysToDue) === 1 ? "den" : "dní"}
                      </span>
                    )}
                  </td>
                  <td className="py-4">
                    <button
                      type="button"
                      onClick={() => props.onOpen(inv)}
                      className="p-1 rounded-md text-on-surface/40 hover:text-primary cursor-pointer"
                    >
                      <Icon name="more_horiz" className="text-lg" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <footer className="pt-8 border-t border-outline-variant/15 flex justify-between items-center opacity-40">
        <p className="text-[10px] font-bold uppercase tracking-widest">© 2026 Fakturujto — moderní fakturace</p>
        <div className="flex gap-5">
          <a href="#" className="text-[10px] font-bold uppercase tracking-widest hover:text-primary">
            Nápověda
          </a>
          <a href="#" className="text-[10px] font-bold uppercase tracking-widest hover:text-primary">
            API Docs
          </a>
        </div>
      </footer>
    </div>
  );
}

function ClientsPage(props: { buyers: Buyer[]; onPick: (b: Buyer) => void }) {
  return (
    <div className="max-w-geist-content mx-auto space-y-6">
      <header className="mb-1">
        <h1 className="text-xl font-semibold tracking-geist-heading leading-geist-tight text-on-surface">Klienti</h1>
        <p className="text-on-surface-variant/55 text-[11px] font-medium tracking-wide mt-0.5">Z FAKTUR</p>
      </header>
      <section className="rounded-xl border border-outline-variant/40 bg-surface-container-low/90 backdrop-blur-sm p-5 sm:p-6 shadow-geist-sm ring-1 ring-primary/5">
        {props.buyers.length === 0 ? (
          <p className="text-on-surface-variant text-xs">Zatím žádní klienti z uložených faktur.</p>
        ) : (
          <ul className="space-y-2">
            {props.buyers.map((b) => (
              <li key={b.ico + b.name}>
                <button
                  type="button"
                  onClick={() => props.onPick(b)}
                  className="w-full text-left px-4 py-3 rounded-lg bg-white/80 border border-outline-variant/35 shadow-geist-sm hover:bg-white hover:shadow-geist-md geist-transition cursor-pointer"
                >
                  <p className="text-sm font-semibold text-on-surface">{b.name || "Bez názvu"}</p>
                  <p className="text-[11px] text-on-surface-variant mt-0.5">
                    IČ {b.ico || "—"}
                    {b.dic ? ` · DIČ ${b.dic}` : ""}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function SupplierForm(props: {
  initial: Supplier;
  onSave: (s: Supplier) => void;
  onCancel: () => void;
  busy: boolean;
  aresQuery: string;
  setAresQuery: (q: string) => void;
  aresSuggestions: Buyer[];
  aresLoading: boolean;
  aresEmpty: boolean;
  aresDropdownSuppressed: boolean;
  setAresDropdownSuppressed: (v: boolean) => void;
  fetchAresByIco: (ico: string) => Promise<Buyer>;
}) {
  const [s, setS] = useState(() => structuredClone(props.initial));

  useEffect(() => {
    setS(structuredClone(props.initial));
  }, [props.initial]);

  const onAutofillIbanSwift = useCallback((iban: string, swift: string | undefined) => {
    setS((prev) => ({
      ...prev,
      iban,
      ...(swift !== undefined ? { swift } : {}),
    }));
  }, []);

  const bankParts = parseStoredBankAccount(s.bankAccount);
  const bankAccountBodyInvalid =
    bankParts.body.trim() !== "" && !isValidAccountBody(bankParts.body);

  function applyBuyerFromAres(b: Buyer) {
    const addrLines = b.address
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean)
      .join("\n");
    setS((prev) => ({ ...prev, name: b.name, ico: b.ico, address: addrLines }));
    props.setAresQuery(b.name);
    props.setAresDropdownSuppressed(true);
  }

  return (
    <div className="max-w-geist-content mx-auto space-y-6">
      <header className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4 mb-2">
        <div>
          <h1 className="text-xl font-semibold tracking-geist-heading leading-geist-tight text-on-surface">Nastavení dodavatele</h1>
          <p className="text-on-surface-variant/55 text-[11px] font-medium tracking-wide mt-0.5">PROFIL PRO FAKTURY A QR PLATBU</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={props.onCancel}
            className="px-4 py-2 rounded-lg text-sm font-medium text-on-surface-variant hover:bg-surface-container-high geist-transition cursor-pointer"
          >
            Zrušit
          </button>
          <button
            type="button"
            disabled={props.busy || bankAccountBodyInvalid}
            onClick={() => props.onSave(s)}
            className="px-5 py-2 bg-primary text-on-primary rounded-lg text-sm font-semibold shadow-geist-md border border-primary/25 hover:brightness-105 active:scale-[0.98] geist-transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Uložit
          </button>
        </div>
      </header>
      <div className="app-panel p-5 sm:p-6 space-y-4 hover:shadow-geist-md hover:ring-primary/10">
        <div>
          <p className="text-[10px] font-semibold tracking-wide text-outline uppercase mb-2">Najít se v ARES</p>
          <p className="text-[11px] text-on-surface-variant mb-3 leading-snug">
            Vyhledejte svou firmu podle názvu nebo IČO — vyplní se jméno, adresa a IČ. Účet, kontakty a DPH doplňte ručně.
          </p>
          <div className="relative group">
            <Icon name="search" className="absolute left-3.5 top-1/2 -translate-y-1/2 text-outline pointer-events-none text-base" />
            <input
              className="w-full pl-10 pr-4 py-2.5 text-sm bg-white/95 backdrop-blur-sm border border-outline-variant/50 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary/35 text-on-surface placeholder:text-on-surface-variant/70 shadow-geist-sm geist-transition"
              placeholder="Název firmy nebo IČO (8 číslic)…"
              type="text"
              autoComplete="off"
              aria-autocomplete="list"
              aria-expanded={
                props.aresLoading || props.aresSuggestions.length > 0 || props.aresEmpty
              }
              value={props.aresQuery}
              onChange={(e) => {
                props.setAresDropdownSuppressed(false);
                props.setAresQuery(e.target.value);
              }}
            />
            {!props.aresDropdownSuppressed &&
              (props.aresSuggestions.length > 0 ||
                props.aresEmpty ||
                (props.aresLoading && props.aresSuggestions.length === 0)) &&
              isAresClientSearchQuery(props.aresQuery) && (
                <ul
                  className="absolute z-30 mt-1 w-full app-panel p-0 max-h-64 overflow-auto text-sm shadow-geist-md rounded-lg border-outline-variant/50"
                  role="listbox"
                >
                  {props.aresLoading && props.aresSuggestions.length === 0 && !props.aresEmpty && (
                    <li className="px-4 py-3 text-xs text-on-surface-variant flex items-center gap-2 border-b border-outline-variant/20">
                      <span className="h-3.5 w-3.5 shrink-0 rounded-full border-2 border-primary/25 border-t-primary animate-spin" />
                      Načítám z ARES…
                    </li>
                  )}
                  {props.aresEmpty && (
                    <li className="px-4 py-3 text-xs text-on-surface-variant border-b border-outline-variant/30">
                      Žádná shoda v ARES.
                    </li>
                  )}
                  {props.aresSuggestions.map((b) => (
                    <li key={b.ico + b.name} role="option">
                      <button
                        type="button"
                        className="w-full text-left px-4 py-2.5 geist-transition hover:bg-surface-container-low border-b border-outline-variant/20 last:border-b-0"
                        onClick={() => applyBuyerFromAres(b)}
                      >
                        <span className="font-medium text-on-surface text-sm block leading-snug">{b.name}</span>
                        <span className="text-[11px] text-on-surface-variant mt-0.5 block">
                          IČ {b.ico}
                          {b.dic ? ` · DIČ ${b.dic}` : ""}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
          </div>
        </div>
        <div className="border-t border-outline-variant/30 pt-4">
          <p className="text-[10px] font-semibold tracking-wide text-outline uppercase mb-3">Údaje dodavatele</p>
        </div>
        <LabeledField label="Název / jméno" value={s.name} onChange={(v) => setS({ ...s, name: v })} />
        <LabeledTextarea label="Adresa" value={s.address} onChange={(v) => setS({ ...s, address: v })} />
        <div>
          <LabeledField label="IČ" value={s.ico} onChange={(v) => setS({ ...s, ico: v })} />
          <div className="flex justify-end mt-1">
            <button
              type="button"
              disabled={props.busy || !s.ico.trim()}
              onClick={async () => {
                try {
                  const b = await props.fetchAresByIco(s.ico.trim());
                  applyBuyerFromAres(b);
                } catch {
                  /* chyba zobrazena v horní liště */
                }
              }}
              className="text-primary text-[10px] font-semibold uppercase tracking-wide hover:underline disabled:opacity-40 disabled:no-underline"
            >
              ARES podle IČ
            </button>
          </div>
        </div>
        <label className="flex items-center gap-2 text-xs text-on-surface-variant">
          <input
            type="checkbox"
            checked={s.neplavecDph}
            onChange={(e) => setS({ ...s, neplavecDph: e.target.checked })}
            className="rounded border-outline-variant"
          />
          Neplátce DPH
        </label>
        <BankAccountField
          value={s.bankAccount}
          onChange={(v) => setS({ ...s, bankAccount: v })}
          onAutofillIbanSwift={onAutofillIbanSwift}
        />
        <LabeledField label="IBAN" value={s.iban} onChange={(v) => setS({ ...s, iban: v })} />
        <LabeledField label="SWIFT / BIC" value={s.swift} onChange={(v) => setS({ ...s, swift: v })} />
        <LabeledField
          label="E-mail"
          value={s.email}
          onChange={(v) => setS({ ...s, email: v })}
        />
        <LabeledField
          label="Telefon"
          value={s.phone}
          onChange={(v) => setS({ ...s, phone: v })}
        />
        <LabeledField label="Web" value={s.web} onChange={(v) => setS({ ...s, web: v })} />
        <p className="text-[11px] italic text-on-surface-variant/90">Podnikatel je zapsán v živnostenském rejstříku.</p>
      </div>
    </div>
  );
}

function InvoiceEditor(props: {
  draft: Invoice;
  setDraft: (d: Invoice) => void;
  clientQuery: string;
  setClientQuery: (s: string) => void;
  setBuyerDropdownSuppressed: (v: boolean) => void;
  buyerDropdownSuppressed: boolean;
  buyerSuggestions: Buyer[];
  aresSearchLoading: boolean;
  aresDropdownEmpty: boolean;
  onSelectBuyer: (b: Buyer) => void;
  onSave: () => void;
  onSaveAndIssue: () => void;
  onDelete: () => void;
  onTogglePaid: () => void;
  onPdf: () => void;
  onCancel: () => void;
  busy: boolean;
  buyerDirectory: BuyerDirectoryEntry[];
  showPastBuyersDirectory: boolean;
  publicMode?: boolean;
}) {
  const { draft, setDraft } = props;
  const total = invoiceTotal(draft);
  const publicMode = props.publicMode === true;
  const paidLocked = !publicMode && draft.status === "paid";

  const filteredBuyerDirectory = useMemo(() => {
    const q = props.clientQuery.trim().toLowerCase();
    if (!q) return props.buyerDirectory;
    return props.buyerDirectory.filter((e) => {
      const hay = `${e.buyer.name} ${e.buyer.ico} ${e.buyer.dic} ${e.buyer.address}`.toLowerCase();
      return hay.includes(q);
    });
  }, [props.buyerDirectory, props.clientQuery]);

  const [issueStr, setIssueStr] = useState(() => formatDateCs(draft.issueDate));
  const [dueStr, setDueStr] = useState(() => formatDateCs(draft.dueDate));
  /** Při editaci ceny držíme řetězec z inputu — při každém přepisu formátování neshodí kurzor. */
  const [unitPriceEdit, setUnitPriceEdit] = useState<Record<number, string>>({});
  const [unitPriceFocusRow, setUnitPriceFocusRow] = useState<number | null>(null);
  const [buyerSearchFocused, setBuyerSearchFocused] = useState(false);
  const buyerSearchWrapRef = useRef<HTMLDivElement>(null);
  const buyerSearchInputRef = useRef<HTMLInputElement>(null);
  const unitPriceCursorPendingRef = useRef<{ row: number; pos: number } | null>(null);

  const showBuyerSearchDropdown = useMemo(() => {
    if (paidLocked) return false;
    if (!buyerSearchFocused || props.buyerDropdownSuppressed) return false;
    const q = props.clientQuery.trim();
    if (isAresClientSearchQuery(q)) {
      return (
        props.buyerSuggestions.length > 0 ||
        props.aresDropdownEmpty ||
        (props.aresSearchLoading && props.buyerSuggestions.length === 0)
      );
    }
    return props.showPastBuyersDirectory && props.buyerDirectory.length > 0;
  }, [
    paidLocked,
    buyerSearchFocused,
    props.buyerDropdownSuppressed,
    props.clientQuery,
    props.buyerSuggestions.length,
    props.aresDropdownEmpty,
    props.aresSearchLoading,
    props.showPastBuyersDirectory,
    props.buyerDirectory.length,
  ]);

  useEffect(() => {
    setIssueStr(formatDateCs(draft.issueDate));
    setDueStr(formatDateCs(draft.dueDate));
  }, [draft.issueDate, draft.dueDate, draft.id]);

  useEffect(() => {
    setUnitPriceEdit({});
    setUnitPriceFocusRow(null);
    setBuyerSearchFocused(false);
  }, [draft.id]);

  useLayoutEffect(() => {
    const p = unitPriceCursorPendingRef.current;
    if (!p) return;
    unitPriceCursorPendingRef.current = null;
    const el = document.querySelector<HTMLInputElement>(`input[data-unit-price-row="${p.row}"]`);
    if (el && document.activeElement === el) {
      el.setSelectionRange(p.pos, p.pos);
    }
  }, [unitPriceEdit]);

  function handleSelectBuyerFromSearch(b: Buyer) {
    setBuyerSearchFocused(false);
    buyerSearchInputRef.current?.blur();
    props.onSelectBuyer(b);
  }

  function handleBuyerSearchInputBlur(e: FocusEvent<HTMLInputElement>) {
    const related = e.relatedTarget as Node | null;
    window.requestAnimationFrame(() => {
      const root = buyerSearchWrapRef.current;
      if (!root) return;
      if (related && root.contains(related)) return;
      if (root.contains(document.activeElement)) return;
      setBuyerSearchFocused(false);
    });
  }

  function updateLine(i: number, patch: Partial<LineItem>) {
    const lineItems = draft.lineItems.map((l, idx) => (idx === i ? { ...l, ...patch } : l));
    setDraft({ ...draft, lineItems });
  }

  function addLine() {
    setUnitPriceEdit({});
    setUnitPriceFocusRow(null);
    setDraft({ ...draft, lineItems: [...draft.lineItems, emptyLine()] });
  }

  function removeLine(i: number) {
    setUnitPriceEdit({});
    setUnitPriceFocusRow(null);
    const lineItems = draft.lineItems.filter((_, idx) => idx !== i);
    setDraft({ ...draft, lineItems: lineItems.length ? lineItems : [emptyLine()] });
  }

  const bankLabel =
    draft.supplier.bankAccount.trim() ||
    (draft.supplier.iban ? `IBAN …${draft.supplier.iban.slice(-4)}` : "Doplňte účet v nastavení");

  const taxLabel = draft.supplier.neplavecDph ? "Základ daně (0 %)" : "Základ daně (DPH)";
  const isNew = draft.id == null;

  return (
    <>
      {!publicMode && (
      <header className="flex flex-col gap-4 lg:flex-row lg:justify-between lg:items-end mb-8 max-w-geist-content mx-auto">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 group">
            <h1 className="text-lg sm:text-xl font-semibold tracking-geist-heading leading-geist-tight text-on-surface">
              {isNew ? "Nová faktura vydaná" : "Faktura vydaná"} č. {draft.number}
            </h1>
            <button
              type="button"
              className="text-outline hover:text-primary geist-transition rounded-lg p-1 hover:bg-surface-container-low"
              title={
                paidLocked
                  ? "Zrušit úhradu — pak půjde fakturu znovu upravit nebo smazat"
                  : "Označit jako uhrazeno / změnit stav platby"
              }
              onClick={props.onTogglePaid}
            >
              <Icon name={draft.status === "paid" ? "check_circle" : "edit"} filled={draft.status === "paid"} className="text-base" />
            </button>
          </div>
          <p className="text-on-surface-variant/55 text-[11px] font-medium tracking-wide">
            {isNew ? "VYTVOŘENÍ NOVÉHO DOKLADU" : paidLocked ? "PROHLÍŽENÍ DOKLADU" : "ÚPRAVA DOKLADU"} ·{" "}
            {draft.status === "paid" ? "Uhrazeno" : "Neuhrazeno"}
          </p>
          <div className="flex flex-wrap gap-1.5 pt-1">
            <button
              type="button"
              disabled={props.busy}
              onClick={props.onPdf}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-primary border border-outline-variant/50 hover:bg-surface-container-low geist-transition cursor-pointer"
            >
              <Icon name="picture_as_pdf" className="text-base" />
              PDF
            </button>
            <button
              type="button"
              disabled={paidLocked}
              title={paidLocked ? "Uhrazenou fakturu nelze smazat" : undefined}
              onClick={props.onDelete}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-error border border-transparent hover:bg-error-container/20 geist-transition cursor-pointer disabled:opacity-40 disabled:pointer-events-none"
            >
              <Icon name="delete" className="text-base" />
              Smazat
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={props.onCancel}
            className="px-4 py-2 rounded-lg text-sm font-medium text-on-surface-variant hover:bg-surface-container-high geist-transition cursor-pointer"
          >
            Zrušit
          </button>
          <button
            type="button"
            disabled={props.busy || paidLocked}
            title={paidLocked ? "Nejprve zrušte úhradu" : undefined}
            onClick={props.onSave}
            className="px-5 py-2.5 min-h-11 rounded-md text-sm font-semibold text-white shadow-editorial-md hover:brightness-105 active:scale-[0.98] geist-transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: "linear-gradient(135deg, #71008c 0%, #9317b2 100%)" }}
          >
            Uložit fakturu
          </button>
        </div>
      </header>
      )}

      {paidLocked ? (
        <div className="max-w-geist-content mx-auto mb-4 rounded-xl border border-outline-variant/40 bg-surface-container-low/90 px-4 py-3 text-sm text-on-surface-variant flex gap-3 items-start shadow-editorial-sm">
          <Icon name="lock" className="text-primary shrink-0 text-lg" />
          <p className="leading-snug">
            Uhrazenou fakturu nelze měnit ani mazat. Chcete-li ji upravit, nejdřív klikněte na zelenou fajfku u čísla
            faktury a zrušte úhradu.
          </p>
        </div>
      ) : null}

      <div className="max-w-geist-content mx-auto space-y-6">
        {!publicMode && (
        <section className="relative z-30 rounded-xl bg-surface-container-low/90 backdrop-blur-[28px] p-6 sm:p-8 shadow-editorial-sm ring-1 ring-outline-variant/[0.15]">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-[10px] font-semibold tracking-wide text-outline uppercase">Odběratel</h2>
            <button
              type="button"
              disabled={paidLocked}
              onClick={() => {
                setBuyerSearchFocused(false);
                buyerSearchInputRef.current?.blur();
                setDraft({ ...draft, buyer: emptyBuyer() });
                props.setClientQuery("");
                props.setBuyerDropdownSuppressed(false);
              }}
              className="text-primary text-xs font-medium flex items-center gap-0.5 hover:underline min-h-11 px-1 -mr-1 rounded-md disabled:opacity-40 disabled:no-underline disabled:pointer-events-none"
            >
              <Icon name="person_add" className="text-sm" />
              Nový klient
            </button>
          </div>
          <div ref={buyerSearchWrapRef} className="relative group">
            <Icon name="search" className="absolute left-3.5 top-1/2 -translate-y-1/2 text-outline pointer-events-none text-base z-10" />
            <input
              ref={buyerSearchInputRef}
              readOnly={paidLocked}
              className={`w-full min-h-11 pl-10 pr-4 py-2.5 text-sm bg-surface-container-lowest/95 backdrop-blur-sm rounded-md text-on-surface placeholder:text-on-surface-variant/70 shadow-editorial-sm ring-1 ring-outline-variant/[0.15] border-0 focus:outline-none focus:ring-2 focus:ring-primary/25 geist-transition ${
                paidLocked ? "opacity-75 cursor-default bg-surface-container-low/50" : ""
              }`}
              placeholder="Vyhledejte odběratele podle názvu nebo IČO..."
              type="text"
              autoComplete="off"
              aria-autocomplete="list"
              aria-expanded={showBuyerSearchDropdown}
              value={props.clientQuery}
              onChange={(e) => props.setClientQuery(e.target.value)}
              onFocus={() => {
                if (paidLocked) return;
                setBuyerSearchFocused(true);
                props.setBuyerDropdownSuppressed(false);
              }}
              onBlur={handleBuyerSearchInputBlur}
            />
            {showBuyerSearchDropdown && (
                <ul
                  className="absolute left-0 right-0 z-50 mt-2 w-full max-h-[min(22rem,72vh)] overflow-y-auto overflow-x-hidden overscroll-y-contain scroll-py-1 text-sm rounded-xl bg-surface-container-lowest shadow-editorial-md ring-1 ring-outline-variant/40 border border-outline-variant/30 divide-y divide-outline-variant/[0.12] [scrollbar-gutter:stable]"
                  role="listbox"
                >
                  {!isAresClientSearchQuery(props.clientQuery.trim()) ? (
                    <>
                      {filteredBuyerDirectory.length === 0 ? (
                        <li className="px-4 py-4 text-xs text-on-surface-variant text-center">Žádný odběratel neodpovídá.</li>
                      ) : (
                        filteredBuyerDirectory.map((entry) => (
                          <li key={(entry.buyer.ico || "") + (entry.buyer.name || "")} role="option">
                            <button
                              type="button"
                              className="w-full text-left min-h-11 px-4 py-3 geist-transition hover:bg-surface-container-low/80"
                              onClick={() => handleSelectBuyerFromSearch(entry.buyer)}
                            >
                              <span className="font-medium text-on-surface text-sm block leading-snug">
                                {entry.buyer.name || "Bez názvu"}
                              </span>
                              <span className="text-[11px] text-on-surface-variant mt-0.5 block">
                                IČ {entry.buyer.ico || "—"}
                                {entry.buyer.dic ? ` · DIČ ${entry.buyer.dic}` : ""}
                              </span>
                              {entry.buyer.address ? (
                                <span className="text-[11px] text-outline mt-1 block line-clamp-2">{entry.buyer.address}</span>
                              ) : null}
                            </button>
                          </li>
                        ))
                      )}
                    </>
                  ) : (
                    <>
                      {props.aresSearchLoading && props.buyerSuggestions.length === 0 && !props.aresDropdownEmpty && (
                        <li className="px-4 py-3.5 min-h-11 text-xs text-on-surface-variant flex items-center gap-2 shrink-0">
                          <span className="h-3.5 w-3.5 shrink-0 rounded-full border-2 border-primary/25 border-t-primary animate-spin" />
                          Načítám z ARES…
                        </li>
                      )}
                      {props.aresDropdownEmpty && (
                        <li className="px-4 py-3.5 min-h-11 text-xs text-on-surface-variant shrink-0">
                          Žádná shoda v ARES ani v uložených fakturách.
                        </li>
                      )}
                      {props.buyerSuggestions.length > 0 ? (
                        <li className="p-0 list-none" role="presentation">
                          <div
                            className="max-h-[min(16rem,50vh)] overflow-y-auto overscroll-y-contain [scrollbar-gutter:stable] divide-y divide-outline-variant/[0.12]"
                            role="group"
                            aria-label="Výsledky z ARES"
                          >
                            {props.buyerSuggestions.map((b) => (
                              <div key={b.ico + b.name} role="option">
                                <button
                                  type="button"
                                  className="w-full text-left min-h-11 px-4 py-3 geist-transition hover:bg-surface-container-low/80"
                                  onClick={() => handleSelectBuyerFromSearch(b)}
                                >
                                  <span className="font-medium text-on-surface text-sm block leading-snug">{b.name}</span>
                                  <span className="text-[11px] text-on-surface-variant mt-0.5 block">
                                    IČ {b.ico}
                                    {b.dic ? ` · DIČ ${b.dic}` : ""}
                                  </span>
                                  {b.address ? (
                                    <span className="text-[11px] text-outline mt-1 block line-clamp-2">{b.address}</span>
                                  ) : null}
                                </button>
                              </div>
                            ))}
                          </div>
                        </li>
                      ) : null}
                    </>
                  )}
                </ul>
              )}
          </div>
          <div className="mt-6 flex flex-col md:flex-row gap-5">
            <div className="flex-1 p-5 rounded-xl bg-surface-container-lowest/90 backdrop-blur-sm shadow-editorial-sm ring-1 ring-outline-variant/[0.15]">
              <p className="text-[9px] font-semibold text-outline uppercase mb-1">Fakturační adresa</p>
              {draft.buyer.name || draft.buyer.address ? (
                <p className="text-on-surface-variant text-geist-content whitespace-pre-line">
                  {draft.buyer.name}
                  {draft.buyer.address ? `\n${draft.buyer.address}` : ""}
                </p>
              ) : (
                <p className="text-on-surface-variant italic text-xs">Vyberte klienta pro zobrazení údajů</p>
              )}
            </div>
            <div className="flex-1 p-5 rounded-xl bg-surface-container-lowest/90 backdrop-blur-sm shadow-editorial-sm ring-1 ring-outline-variant/[0.15]">
              <p className="text-[9px] font-semibold text-outline uppercase mb-1">Identifikace</p>
              <p className="text-on-surface-variant text-xs leading-snug">
                IČ: {draft.buyer.ico || "—"} · DIČ: {draft.buyer.dic || "—"}
              </p>
            </div>
          </div>
        </section>
        )}

        <section className="app-panel relative z-10 p-5 sm:p-6 grid grid-cols-1 md:grid-cols-2 gap-8 hover:shadow-geist-md hover:ring-primary/10">
          <div className="space-y-4">
            <h2 className="text-[10px] font-semibold tracking-wide text-outline uppercase">Datumy</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[9px] font-semibold text-outline uppercase mb-0.5 ml-0.5">Datum vystavení</label>
                <EditorialDateField
                  displayValue={issueStr}
                  onDisplayChange={setIssueStr}
                  onDisplayBlur={() => {
                    const p = parseDateCs(issueStr);
                    if (p) setDraft({ ...draft, issueDate: p });
                    setIssueStr(formatDateCs(p ?? draft.issueDate));
                  }}
                  isoValue={draft.issueDate}
                  onIsoChange={(iso) => {
                    setDraft({ ...draft, issueDate: iso });
                    setIssueStr(formatDateCs(iso));
                  }}
                  iconName="calendar_today"
                  calendarOpenLabel="Otevřít kalendář — datum vystavení"
                  disabled={paidLocked}
                />
              </div>
              <div>
                <label className="block text-[9px] font-semibold text-outline uppercase mb-0.5 ml-0.5">Datum splatnosti</label>
                <EditorialDateField
                  displayValue={dueStr}
                  onDisplayChange={setDueStr}
                  onDisplayBlur={() => {
                    const p = parseDateCs(dueStr);
                    if (p) setDraft({ ...draft, dueDate: p });
                    setDueStr(formatDateCs(p ?? draft.dueDate));
                  }}
                  isoValue={draft.dueDate}
                  onIsoChange={(iso) => {
                    setDraft({ ...draft, dueDate: iso });
                    setDueStr(formatDateCs(iso));
                  }}
                  iconName="event_available"
                  emphasis
                  calendarOpenLabel="Otevřít kalendář — datum splatnosti"
                  disabled={paidLocked}
                />
              </div>
            </div>
          </div>
          <div className="space-y-4">
            <h2 className="text-[10px] font-semibold tracking-wide text-outline uppercase">Platební údaje</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[9px] font-semibold text-outline uppercase mb-0.5 ml-0.5">Bankovní účet</label>
                {publicMode ? (
                  <div>
                    <input
                      className="w-full px-3 py-2.5 text-sm bg-surface-container-low/90 border border-outline-variant/50 rounded-lg focus:ring-2 focus:ring-primary/20 text-on-surface geist-transition"
                      value={draft.supplier.bankAccount}
                      onChange={(e) => setDraft({ ...draft, supplier: { ...draft.supplier, bankAccount: e.target.value } })}
                      placeholder="Např. 123456789/0800"
                    />
                  </div>
                ) : (
                  <div className="relative">
                    <select
                      className="w-full px-3 py-2.5 text-sm bg-surface-container-low/90 border border-outline-variant/50 rounded-lg focus:ring-2 focus:ring-primary/20 appearance-none text-on-surface geist-transition"
                      value="main"
                      disabled
                      aria-label="Bankovní účet"
                    >
                      <option value="main">{bankLabel}</option>
                    </select>
                    <Icon
                      name="expand_more"
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-outline pointer-events-none text-base"
                    />
                  </div>
                )}
              </div>
              <div>
                <label className="block text-[9px] font-semibold text-outline uppercase mb-0.5 ml-0.5">
                  Číslo dokladu / variabilní symbol
                </label>
                <input
                  readOnly={paidLocked}
                  className={`w-full px-3 py-2.5 text-sm bg-surface-container-low/90 border border-outline-variant/50 rounded-lg focus:ring-2 focus:ring-primary/20 tabular-nums geist-transition ${
                    paidLocked ? "opacity-75 cursor-default" : ""
                  }`}
                  value={draft.number}
                  onChange={(e) => setDraft({ ...draft, number: e.target.value })}
                />
              </div>
            </div>
          </div>
        </section>

        <section className="app-panel relative z-10 p-5 sm:p-6 grid grid-cols-1 md:grid-cols-3 gap-4 hover:shadow-geist-md hover:ring-primary/10">
          <h2 className="text-[10px] font-semibold tracking-wide text-outline uppercase md:col-span-3">
            Kontakt dodavatele (na faktuře)
          </h2>
          <LabeledField
            label="E-mail"
            readOnly={paidLocked}
            value={draft.supplier.email}
            onChange={(v) => setDraft({ ...draft, supplier: { ...draft.supplier, email: v } })}
          />
          <LabeledField
            label="Telefon"
            readOnly={paidLocked}
            value={draft.supplier.phone}
            onChange={(v) => setDraft({ ...draft, supplier: { ...draft.supplier, phone: v } })}
          />
          <LabeledField
            label="Web"
            readOnly={paidLocked}
            value={draft.supplier.web}
            onChange={(v) => setDraft({ ...draft, supplier: { ...draft.supplier, web: v } })}
          />
        </section>

        <section className="app-panel relative z-10 overflow-hidden p-0 hover:shadow-editorial-md">
          <div className="px-5 py-4 bg-surface-container-low/50">
            <h2 className="text-[10px] font-semibold tracking-wide text-outline uppercase">Položky faktury</h2>
          </div>
          <div className="p-3 overflow-x-auto">
            <div className="min-w-[720px] text-sm space-y-3">
              <div className="hidden sm:grid sm:grid-cols-[minmax(8rem,1fr)_6.5rem_4.5rem_4rem_6.5rem_2.75rem_2.75rem] gap-x-2 items-center px-5 py-2 text-[9px] font-semibold text-outline uppercase tracking-wide">
                <span>Popis položky</span>
                <span className="text-right">Cena / j.</span>
                <span className="text-center">Množství</span>
                <span>Jedn.</span>
                <span className="text-right">Celkem</span>
                <span className="text-center" title="Barevný pruh vlevo na PDF">
                  <Icon name="bookmark" className="text-base text-outline inline" />
                </span>
                <span />
              </div>
              {draft.lineItems.map((line, i) => {
                const nameNeedsInput = !line.description.trim();
                const isBlankNewLine =
                  nameNeedsInput && line.unitPrice === 0 && line.quantity <= 1 && line.unit === "ks";
                const priceDisplay =
                  unitPriceFocusRow === i
                    ? (unitPriceEdit[i] ??
                        (line.unitPrice === 0 ? "" : formatAmountCs(line.unitPrice)))
                    : formatAmountCs(line.unitPrice);
                return (
                  <div
                    key={i}
                    className="grid grid-cols-1 sm:grid-cols-[minmax(8rem,1fr)_6.5rem_4.5rem_4rem_6.5rem_2.75rem_2.75rem] gap-x-2 gap-y-2 items-center py-4 px-5 rounded-xl bg-surface-container-lowest/95 shadow-editorial-sm border border-outline-variant/25 ring-1 ring-outline-variant/[0.12] geist-transition hover:shadow-editorial-md focus-within:border-primary/25 focus-within:ring-primary/15"
                  >
                    <div className="min-w-0 rounded-md px-2.5 py-2 -mx-1 sm:mx-0 ring-1 ring-transparent focus-within:ring-primary/40 focus-within:bg-primary/[0.09] focus-within:shadow-[inset_0_0_0_1px_rgba(113,0,140,0.12)] geist-transition">
                      <input
                        readOnly={paidLocked}
                        className={`min-w-0 w-full bg-transparent border-none p-0 outline-none focus:outline-none focus-visible:outline-none focus:ring-0 text-sm font-medium caret-primary ${
                          nameNeedsInput
                            ? "text-outline-variant italic placeholder:text-outline-variant"
                            : "text-on-surface"
                        }${paidLocked ? " cursor-default" : ""}`}
                        placeholder={nameNeedsInput ? "Zadejte název položky..." : undefined}
                        type="text"
                        value={line.description}
                        onChange={(e) => updateLine(i, { description: e.target.value })}
                      />
                    </div>
                    <input
                      data-unit-price-row={i}
                      readOnly={paidLocked}
                      className={`min-w-0 w-full bg-transparent border-none p-0 outline-none focus:outline-none focus-visible:outline-none focus:ring-0 text-right tabular-nums text-sm ${
                        line.unitPrice === 0 && unitPriceFocusRow !== i ? "text-outline-variant" : ""
                      }${paidLocked ? " cursor-default" : ""}`}
                      type="text"
                      inputMode="decimal"
                      value={priceDisplay}
                      onFocus={() => {
                        if (paidLocked) return;
                        setUnitPriceFocusRow(i);
                        setUnitPriceEdit((prev) => ({
                          ...prev,
                          [i]: line.unitPrice === 0 ? "" : formatAmountCs(line.unitPrice),
                        }));
                      }}
                      onChange={(e) => {
                        const el = e.target;
                        const start = el.selectionStart ?? 0;
                        const { text, cursor } = formatAmountWhileTyping(el.value, start);
                        unitPriceCursorPendingRef.current = { row: i, pos: cursor };
                        setUnitPriceEdit((prev) => ({ ...prev, [i]: text }));
                        const compact = text.replace(/\s/g, "").replace(",", ".");
                        if (compact === "" || compact === "-") {
                          updateLine(i, { unitPrice: 0 });
                        } else {
                          const n = parseAmountCs(text);
                          if (n !== null) updateLine(i, { unitPrice: n });
                        }
                      }}
                      onBlur={() => {
                        const fromEdit = unitPriceEdit[i];
                        const raw =
                          fromEdit !== undefined ? fromEdit : formatAmountCs(line.unitPrice);
                        const n = parseAmountCs(raw.trim() === "" ? "0" : raw);
                        updateLine(i, { unitPrice: n !== null ? n : 0 });
                        setUnitPriceFocusRow((f) => (f === i ? null : f));
                        setUnitPriceEdit((prev) => {
                          const next = { ...prev };
                          delete next[i];
                          return next;
                        });
                      }}
                    />
                    <input
                      readOnly={paidLocked}
                      className={`min-w-0 w-full bg-transparent border-none p-0 outline-none focus:outline-none focus-visible:outline-none focus:ring-0 text-center tabular-nums text-sm sm:max-w-full max-w-[8rem] ${
                        isBlankNewLine ? "text-outline-variant" : ""
                      }${paidLocked ? " cursor-default" : ""}`}
                      type="text"
                      inputMode="decimal"
                      value={String(line.quantity)}
                      onChange={(e) => {
                        const n = parseFloat(e.target.value.replace(",", "."));
                        if (!Number.isNaN(n)) updateLine(i, { quantity: n });
                      }}
                    />
                    <input
                      readOnly={paidLocked}
                      className={`min-w-0 w-full bg-transparent border-none p-0 outline-none focus:outline-none focus-visible:outline-none focus:ring-0 text-left text-sm sm:max-w-full max-w-[8rem] ${
                        isBlankNewLine ? "text-outline-variant" : ""
                      }${paidLocked ? " cursor-default" : ""}`}
                      type="text"
                      value={line.unit}
                      onChange={(e) => updateLine(i, { unit: e.target.value })}
                    />
                    <div
                      className={`text-right font-semibold tabular-nums text-sm sm:pt-0 pt-0 ${
                        isBlankNewLine ? "text-outline-variant" : ""
                      }`}
                    >
                      {formatCzk(lineTotal(line))}
                    </div>
                    <div className="flex sm:justify-center justify-start">
                      <button
                        type="button"
                        disabled={paidLocked}
                        title={
                          line.highlighted
                            ? "Zrušit barevné zvýraznění na faktuře"
                            : "Zvýraznit řádek barevně (pruh vlevo)"
                        }
                        className={`geist-transition rounded-md p-1.5 ${
                          line.highlighted
                            ? "text-primary bg-primary/10 hover:bg-primary/15"
                            : "text-outline-variant hover:text-primary hover:bg-surface-container-low/90"
                        } disabled:opacity-35 disabled:pointer-events-none`}
                        onClick={() => updateLine(i, { highlighted: !line.highlighted })}
                        aria-pressed={line.highlighted === true}
                        aria-label="Barevné zvýraznění řádku"
                      >
                        <Icon name="bookmark" filled={line.highlighted === true} className="text-base" />
                      </button>
                    </div>
                    <div className="flex sm:justify-start justify-end">
                      <button
                        type="button"
                        disabled={paidLocked}
                        className="text-outline-variant hover:text-error geist-transition rounded-md p-1 hover:bg-error-container/15 disabled:opacity-35 disabled:pointer-events-none"
                        onClick={() => removeLine(i)}
                        aria-label="Odstranit řádek"
                      >
                        <Icon name="delete" className="text-base" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-6 mx-3 mb-2 rounded-xl px-5 py-4 bg-surface-container-low/50 shadow-editorial-sm ring-1 ring-outline-variant/[0.15]">
              <button
                type="button"
                disabled={paidLocked}
                onClick={addLine}
                className="flex items-center gap-2 min-h-11 px-3 py-2 text-primary text-xs font-semibold hover:bg-primary/10 rounded-md geist-transition disabled:opacity-40 disabled:pointer-events-none"
              >
                <Icon name="add" className="text-base" />
                Nový řádek
              </button>
            </div>
          </div>
        </section>

        <section
          className="text-white rounded-xl shadow-editorial-lg relative z-10 overflow-hidden group"
          style={{
            background: "linear-gradient(135deg, #71008c 0%, #9317b2 100%)",
          }}
        >
          <div className="absolute -top-10 -right-10 w-36 h-36 bg-white/10 rounded-full blur-3xl group-hover:scale-105 geist-transition" />
          <div className="absolute -bottom-6 -left-6 w-24 h-24 bg-white/5 rounded-full blur-2xl" />
          <div className="relative z-10 p-6 sm:p-8 flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex flex-col sm:flex-row items-center gap-4 w-full md:w-auto">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest opacity-70 mb-0.5">Celkem k úhradě</p>
                <div className="flex items-baseline gap-1.5">
                  <p className="text-2xl sm:text-3xl font-bold tracking-tight tabular-nums">{formatAmountCs(total)}</p>
                  <p className="text-sm font-medium opacity-85 uppercase">Kč</p>
                </div>
              </div>
              <div className="h-8 w-px bg-white/20 hidden md:block" />
              <div className="hidden sm:block text-center sm:text-left">
                <p className="text-[9px] font-semibold uppercase tracking-wide opacity-60 mb-0.5">{taxLabel}</p>
                <p className="text-sm font-semibold tabular-nums">{formatCzk(total)}</p>
              </div>
            </div>
            <button
              type="button"
              disabled={props.busy || paidLocked}
              title={paidLocked ? "Nejprve zrušte úhradu" : undefined}
              onClick={props.onSaveAndIssue}
              className="w-full md:w-auto px-7 py-3 bg-white text-primary text-sm font-bold rounded-lg border border-outline-variant/35 shadow-geist-sm hover:shadow-geist-md hover:border-primary/25 geist-transition active:scale-[0.98] whitespace-nowrap disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
            >
              VYSTAVIT FAKTURU
            </button>
          </div>
        </section>

      </div>
    </>
  );
}

function LabeledField(props: { label: string; value: string; onChange: (v: string) => void; readOnly?: boolean }) {
  return (
    <label className="block">
      <span className="text-[9px] font-semibold text-outline uppercase tracking-wide">{props.label}</span>
      <input
        readOnly={props.readOnly}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        className={`mt-0.5 w-full px-3 py-2.5 text-sm bg-surface-container-low/90 border border-outline-variant/50 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary/35 text-on-surface geist-transition ${
          props.readOnly ? "opacity-75 cursor-default" : ""
        }`}
      />
    </label>
  );
}

function LabeledTextarea(props: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-[9px] font-semibold text-outline uppercase tracking-wide">{props.label}</span>
      <textarea
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        rows={3}
        className="mt-0.5 w-full px-3 py-2.5 text-sm leading-geist-body bg-surface-container-low/90 border border-outline-variant/50 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary/35 text-on-surface geist-transition"
      />
    </label>
  );
}
