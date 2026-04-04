import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  CZECH_BANKS,
  findCzechBankByCode,
  isValidAccountBody,
  joinBankAccount,
  parseStoredBankAccount,
} from "../data/bank-codes";
import { computeCzechIban, formatIbanSpaced } from "../lib/czech-iban";

type Props = {
  value: string;
  onChange: (full: string) => void;
  /**
   * Dopočítaný český IBAN (s mezerami) a SWIFT z tabulky bank.
   * `swift === undefined` → pole SWIFT v formuláři neměnit.
   */
  onAutofillIbanSwift?: (iban: string, swift: string | undefined) => void;
};

const DROPDOWN_Z = 10000;

export function BankAccountField({ value, onChange, onAutofillIbanSwift }: Props) {
  const listId = useId();
  const bankWrapRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [body, setBody] = useState(() => parseStoredBankAccount(value).body);
  const [bankCode, setBankCode] = useState(() => parseStoredBankAccount(value).bankCode);
  const [bankInput, setBankInput] = useState(() => parseStoredBankAccount(value).bankCode);
  const [bankOpen, setBankOpen] = useState(false);
  const [bodyTouched, setBodyTouched] = useState(false);
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number; width: number } | null>(
    null,
  );

  useEffect(() => {
    const p = parseStoredBankAccount(value);
    setBody(p.body);
    setBankCode(p.bankCode);
    setBankInput(p.bankCode);
  }, [value]);

  useEffect(() => {
    if (!onAutofillIbanSwift) return;
    const digitsOnly = bankCode.replace(/\D/g, "");
    const hasAccountInput = body.trim() !== "" || digitsOnly.length > 0;
    if (!hasAccountInput) return;

    if (digitsOnly.length !== 4 || !body.trim() || !isValidAccountBody(body)) {
      onAutofillIbanSwift("", undefined);
      return;
    }
    const ibanRaw = computeCzechIban(digitsOnly, body);
    if (!ibanRaw) {
      onAutofillIbanSwift("", undefined);
      return;
    }
    const row = findCzechBankByCode(digitsOnly);
    const swift =
      row?.swift && row.swift.trim() !== "" ? row.swift.trim() : undefined;
    onAutofillIbanSwift(formatIbanSpaced(ibanRaw), swift);
  }, [body, bankCode, onAutofillIbanSwift]);

  useEffect(() => {
    if (!bankOpen) return;
    function onDocDown(e: MouseEvent) {
      const t = e.target as Node;
      if (bankWrapRef.current?.contains(t)) return;
      if (popoverRef.current?.contains(t)) return;
      setBankOpen(false);
      if (!/^\d*$/.test(bankInput.replace(/\s/g, ""))) {
        setBankInput(bankCode);
      }
    }
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, [bankOpen, bankInput, bankCode]);

  const filteredBanks = useMemo(() => {
    const q = bankInput.trim().toLowerCase();
    if (!q) return CZECH_BANKS;
    const digits = q.replace(/\D/g, "");
    if (/^\d*$/.test(q.replace(/\s/g, "")) && digits.length > 0) {
      return CZECH_BANKS.filter((b) => b.code.startsWith(digits));
    }
    return CZECH_BANKS.filter(
      (b) => b.code.includes(q) || b.name.toLowerCase().includes(q),
    );
  }, [bankInput]);

  useLayoutEffect(() => {
    if (!bankOpen) {
      setPopoverPos(null);
      return;
    }
    function updatePos() {
      const el = bankWrapRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const gap = 8;
      const maxW = 288;
      const width = Math.min(maxW, window.innerWidth - gap * 2);
      let left = r.right - width;
      if (left < gap) left = gap;
      if (left + width > window.innerWidth - gap) {
        left = Math.max(gap, window.innerWidth - width - gap);
      }
      let top = r.bottom + gap;
      const estH = 280;
      if (top + estH > window.innerHeight - gap && r.top > estH + gap) {
        top = r.top - estH - gap;
      }
      if (top < gap) top = gap;
      setPopoverPos({ top, left, width });
    }
    updatePos();
    window.addEventListener("scroll", updatePos, true);
    window.addEventListener("resize", updatePos);
    return () => {
      window.removeEventListener("scroll", updatePos, true);
      window.removeEventListener("resize", updatePos);
    };
  }, [bankOpen, bankInput]);

  const bodyInvalid = body.trim() !== "" && !isValidAccountBody(body);
  const showBodyError = bodyTouched && bodyInvalid;

  function commitBody(next: string) {
    setBody(next);
    onChange(joinBankAccount(next, bankCode));
  }

  function commitBankCodeDigits(digits: string) {
    const d = digits.replace(/\D/g, "").slice(0, 4);
    setBankCode(d);
    setBankInput(d);
    onChange(joinBankAccount(body, d));
  }

  function pickBank(code: string) {
    setBankCode(code);
    setBankInput(code);
    onChange(joinBankAccount(body, code));
    setBankOpen(false);
  }

  return (
    <div>
      <span className="block text-[9px] font-semibold text-outline uppercase tracking-wide mb-0.5 ml-0.5">
        Číslo účtu
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="např. 19-1234567890"
          aria-invalid={showBodyError}
          className={`min-w-[10rem] flex-1 min-h-11 px-3 py-2.5 text-sm bg-surface-container-lowest/95 rounded-md shadow-editorial-sm ring-1 tabular-nums geist-transition border-0 focus:outline-none focus:ring-2 focus:ring-primary/25 ${
            showBodyError ? "ring-error/50 focus:ring-error/30" : "ring-outline-variant/[0.15]"
          }`}
          value={body}
          onChange={(e) => {
            setBodyTouched(true);
            commitBody(e.target.value);
          }}
          onBlur={() => setBodyTouched(true)}
        />
        <span className="text-on-surface-variant text-sm font-medium select-none" aria-hidden>
          /
        </span>
        <div ref={bankWrapRef} className="relative w-[7.5rem] shrink-0">
          <input
            type="text"
            inputMode="text"
            autoComplete="off"
            placeholder="kód"
            aria-label="Kód banky"
            aria-expanded={bankOpen}
            aria-controls={listId}
            className="w-full min-h-11 px-3 py-2.5 text-sm bg-surface-container-lowest/95 rounded-md shadow-editorial-sm ring-1 ring-outline-variant/[0.15] border-0 focus:outline-none focus:ring-2 focus:ring-primary/25 geist-transition tabular-nums"
            value={bankInput}
            onChange={(e) => {
              const v = e.target.value;
              setBankInput(v);
              const compact = v.replace(/\s/g, "");
              if (compact === "" || /^\d*$/.test(compact)) {
                commitBankCodeDigits(compact);
              }
              setBankOpen(true);
            }}
            onFocus={() => setBankOpen(true)}
          />
        </div>
        {bankOpen && filteredBanks.length > 0 && popoverPos
          ? createPortal(
              <div
                ref={popoverRef}
                id={listId}
                role="listbox"
                className="max-h-52 overflow-auto rounded-xl bg-surface-container-lowest/98 py-1 shadow-editorial-lg ring-1 ring-outline-variant/[0.2] backdrop-blur-[20px] text-sm isolate"
                style={{
                  position: "fixed",
                  top: popoverPos.top,
                  left: popoverPos.left,
                  width: popoverPos.width,
                  zIndex: DROPDOWN_Z,
                }}
              >
                {filteredBanks.map((b) => (
                  <div key={b.code} role="option">
                    <button
                      type="button"
                      className="w-full text-left px-3 py-2.5 geist-transition hover:bg-surface-container-low/90 border-b border-outline-variant/[0.1] last:border-0"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => pickBank(b.code)}
                    >
                      <span className="font-semibold tabular-nums text-primary">{b.code}</span>
                      <span className="block text-[11px] text-on-surface-variant mt-0.5 leading-snug">
                        {b.name}
                      </span>
                    </button>
                  </div>
                ))}
              </div>,
              document.body,
            )
          : null}
      </div>
      <p className="text-[10px] text-on-surface-variant mt-1.5 leading-snug">
        Formát čísla: volitelná předvolba (2–6 číslic), pomlčka, číslo účtu (2–10 číslic), např.{" "}
        <span className="tabular-nums">19-1234567890</span>. Při platném účtu a čtyřmístném kódu banky se
        vyplní <strong className="font-medium text-on-surface">IBAN</strong> (ISO 7064 mod 97) a{" "}
        <strong className="font-medium text-on-surface">SWIFT</strong> z číselníku.
      </p>
      {showBodyError ? (
        <p className="text-[10px] text-error font-medium mt-1">
          Neplatný tvar čísla účtu (očekává se např. 19-1234567890).
        </p>
      ) : null}
    </div>
  );
}
