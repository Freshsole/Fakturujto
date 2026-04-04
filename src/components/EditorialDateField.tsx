import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const WEEKDAYS_CS = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"];

function parseIsoLocal(iso: string): Date | null {
  const m = iso.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  const d = parseInt(m[3], 10);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return dt;
}

function toIsoLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function monthGrid(year: number, monthIndex: number): { date: Date; inMonth: boolean }[] {
  const first = new Date(year, monthIndex, 1);
  const mondayOffset = (first.getDay() + 6) % 7;
  const start = new Date(year, monthIndex, 1 - mondayOffset);
  const out: { date: Date; inMonth: boolean }[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    out.push({ date: d, inMonth: d.getMonth() === monthIndex });
  }
  return out;
}

function isInRange(iso: string, minY: number, maxY: number): boolean {
  const y = parseInt(iso.slice(0, 4), 10);
  return y >= minY && y <= maxY;
}

function Icon({ name, className = "text-base" }: { name: string; className?: string }) {
  return <span className={`material-symbols-outlined ${className}`}>{name}</span>;
}

export type EditorialDateFieldProps = {
  displayValue: string;
  onDisplayChange: (v: string) => void;
  onDisplayBlur: () => void;
  isoValue: string;
  onIsoChange: (iso: string) => void;
  iconName: string;
  emphasis?: boolean;
  calendarOpenLabel: string;
  /** Uhrazená faktura — jen prohlížení, bez kalendáře. */
  disabled?: boolean;
};

export function EditorialDateField({
  displayValue,
  onDisplayChange,
  onDisplayBlur,
  isoValue,
  onIsoChange,
  iconName,
  emphasis,
  calendarOpenLabel,
  disabled = false,
}: EditorialDateFieldProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const parsed = parseIsoLocal(isoValue);
  const [viewYear, setViewYear] = useState(() => parsed?.getFullYear() ?? new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => parsed?.getMonth() ?? new Date().getMonth());

  useLayoutEffect(() => {
    if (!open) return;
    const d = parseIsoLocal(isoValue);
    if (d) {
      setViewYear(d.getFullYear());
      setViewMonth(d.getMonth());
    }
  }, [open, isoValue]);

  const updatePopoverPosition = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gap = 8;
    const minW = 280;
    const maxW = 320;
    const width = Math.min(maxW, Math.max(minW, r.width));
    let left = r.left;
    if (left + width > window.innerWidth - gap) {
      left = Math.max(gap, window.innerWidth - width - gap);
    }
    const estH = 360;
    let top = r.bottom + gap;
    if (top + estH > window.innerHeight - gap && r.top > estH + gap) {
      top = r.top - estH - gap;
    }
    if (top < gap) top = gap;
    setPopoverPos({ top, left, width });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setPopoverPos(null);
      return;
    }
    updatePopoverPosition();
    window.addEventListener("scroll", updatePopoverPosition, true);
    window.addEventListener("resize", updatePopoverPosition);
    return () => {
      window.removeEventListener("scroll", updatePopoverPosition, true);
      window.removeEventListener("resize", updatePopoverPosition);
    };
  }, [open, viewYear, viewMonth, updatePopoverPosition]);

  useEffect(() => {
    if (!open) return;
    function onDocDown(e: MouseEvent) {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t)) return;
      if (popoverRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  const today = new Date();
  const grid = monthGrid(viewYear, viewMonth);
  const monthTitle = new Intl.DateTimeFormat("cs-CZ", { month: "long", year: "numeric" }).format(
    new Date(viewYear, viewMonth, 1),
  );

  function goPrevMonth() {
    setViewMonth((m) => {
      if (m === 0) {
        setViewYear((y) => y - 1);
        return 11;
      }
      return m - 1;
    });
  }

  function goNextMonth() {
    setViewMonth((m) => {
      if (m === 11) {
        setViewYear((y) => y + 1);
        return 0;
      }
      return m + 1;
    });
  }

  function selectDay(d: Date) {
    const iso = toIsoLocal(d);
    if (!isInRange(iso, 2000, 2099)) return;
    onIsoChange(iso);
    setOpen(false);
  }

  const inputClass = emphasis
    ? "w-full min-h-11 pl-3 pr-12 py-2.5 text-sm bg-surface-container-lowest/95 rounded-md shadow-editorial-sm ring-1 ring-outline-variant/[0.15] border-0 focus:outline-none focus:ring-2 focus:ring-primary/25 geist-transition font-medium text-primary"
    : "w-full min-h-11 pl-3 pr-12 py-2.5 text-sm bg-surface-container-lowest/95 rounded-md shadow-editorial-sm ring-1 ring-outline-variant/[0.15] border-0 focus:outline-none focus:ring-2 focus:ring-primary/25 geist-transition text-on-surface";

  const disabledInputClass = disabled ? " opacity-75 cursor-default bg-surface-container-low/50" : "";
  const btnClass = emphasis
    ? "absolute right-1 top-1/2 -translate-y-1/2 min-h-9 min-w-9 flex items-center justify-center rounded-md text-primary hover:bg-primary/10 geist-transition"
    : "absolute right-1 top-1/2 -translate-y-1/2 min-h-9 min-w-9 flex items-center justify-center rounded-md text-outline hover:text-primary hover:bg-surface-container-low/90 geist-transition";

  return (
    <div ref={wrapRef} className="relative flex items-stretch">
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        readOnly={disabled}
        className={inputClass + disabledInputClass}
        value={displayValue}
        onChange={(e) => onDisplayChange(e.target.value)}
        onBlur={onDisplayBlur}
      />
      <button
        type="button"
        className={btnClass + (disabled ? " opacity-40 pointer-events-none cursor-not-allowed" : "")}
        aria-label={calendarOpenLabel}
        aria-expanded={open}
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
      >
        <Icon name={iconName} className="text-base" />
      </button>

      {open && !disabled && popoverPos
        ? createPortal(
            <div
              ref={popoverRef}
              className="rounded-xl bg-surface-container-lowest/98 p-4 shadow-editorial-lg ring-1 ring-outline-variant/[0.2] backdrop-blur-[24px] isolate"
              style={{
                position: "fixed",
                top: popoverPos.top,
                left: popoverPos.left,
                width: popoverPos.width,
                zIndex: 10000,
              }}
              role="dialog"
              aria-label="Kalendář"
            >
              <div className="flex items-center justify-between gap-2 mb-3">
                <button
                  type="button"
                  className="min-h-9 min-w-9 flex items-center justify-center rounded-lg text-on-surface hover:bg-surface-container-low/90 geist-transition"
                  aria-label="Předchozí měsíc"
                  onClick={goPrevMonth}
                >
                  <Icon name="chevron_left" className="text-xl" />
                </button>
                <span className="text-sm font-semibold text-on-surface tracking-tight px-1 text-center flex-1">
                  {monthTitle}
                </span>
                <button
                  type="button"
                  className="min-h-9 min-w-9 flex items-center justify-center rounded-lg text-on-surface hover:bg-surface-container-low/90 geist-transition"
                  aria-label="Další měsíc"
                  onClick={goNextMonth}
                >
                  <Icon name="chevron_right" className="text-xl" />
                </button>
              </div>

              <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase tracking-wide text-outline mb-2">
                {WEEKDAYS_CS.map((d) => (
                  <div key={d} className="py-1">
                    {d}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1">
                {grid.map(({ date: d, inMonth }) => {
                  const iso = toIsoLocal(d);
                  const ok = isInRange(iso, 2000, 2099);
                  const selected = parsed !== null && sameDay(d, parsed);
                  const isToday = sameDay(d, today);
                  return (
                    <button
                      key={iso + String(inMonth)}
                      type="button"
                      disabled={!ok}
                      onClick={() => selectDay(d)}
                      className={[
                        "min-h-10 min-w-9 rounded-lg text-sm tabular-nums geist-transition",
                        !ok ? "opacity-25 cursor-not-allowed" : "",
                        !inMonth ? "text-outline-variant/70" : "text-on-surface",
                        selected
                          ? "bg-gradient-to-br from-primary to-primary-container text-white font-semibold shadow-sm ring-1 ring-primary/30"
                          : isToday
                            ? "ring-1 ring-primary/35 bg-primary/[0.08] font-medium text-primary"
                            : ok && inMonth
                              ? "hover:bg-surface-container-low/95 hover:ring-1 hover:ring-outline-variant/20"
                              : ok
                                ? "hover:bg-surface-container-low/60"
                                : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      {d.getDate()}
                    </button>
                  );
                })}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
