"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { setCookThisWeek, removeCookThisWeek } from "@/app/actions/recipes";
import {
  getDefaultCookThisWeekExpiry,
  formatReadable,
  isCookThisWeekActive,
  parseDayMonthYear,
  ymdToDMY,
  tryParseDMY,
  daysInMonth,
} from "@/lib/cook-this-week";

interface CookThisWeekButtonProps {
  recipeId: string;
  /** ISO string of current expiry, or null if not marked */
  initialCookThisWeekUntil: string | null;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
// Week header: Mon → Sun (Monday-first, Sunday is last/weekend)
const DAY_HEADERS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

/** Monday-first day-of-week index (0=Mon … 6=Sun) for a UTC date. */
function mondayFirstDOW(year: number, month: number, day: number): number {
  const utcDOW = new Date(Date.UTC(year, month, day)).getUTCDay(); // 0=Sun
  return (utcDOW + 6) % 7; // shift so Mon=0, Sun=6
}

interface CalendarState {
  year: number;
  month: number; // 0-indexed
}

export function CookThisWeekButton({
  recipeId,
  initialCookThisWeekUntil,
}: CookThisWeekButtonProps) {
  const rawInit =
    initialCookThisWeekUntil && isCookThisWeekActive(initialCookThisWeekUntil)
      ? initialCookThisWeekUntil
      : null;

  // ── Committed value (saved to DB) ──
  const [cookThisWeekUntil, setCookThisWeekUntilState] = useState<string | null>(rawInit);

  // ── Picker open state ──
  const [showPicker, setShowPicker] = useState(false);

  // ── Selected date in the picker (not yet saved) ──
  function getInitialSelection(): { year: number; month: number; day: number } {
    if (rawInit) {
      const d = new Date(rawInit);
      return { year: d.getUTCFullYear(), month: d.getUTCMonth(), day: d.getUTCDate() };
    }
    const def = getDefaultCookThisWeekExpiry();
    return { year: def.getUTCFullYear(), month: def.getUTCMonth(), day: def.getUTCDate() };
  }

  const [selected, setSelected] = useState<{ year: number; month: number; day: number }>(
    getInitialSelection
  );

  // ── Calendar navigation (which month is displayed) ──
  const [cal, setCal] = useState<CalendarState>({ year: selected.year, month: selected.month });

  // ── Manual text input ──
  const [manualInput, setManualInput] = useState<string>(
    ymdToDMY(selected.year, selected.month, selected.day)
  );
  const [inputError, setInputError] = useState<string | null>(null);

  const [isPending, startTransition] = useTransition();
  const pickerRef = useRef<HTMLDivElement>(null);
  const manualInputRef = useRef<HTMLInputElement>(null);

  // Today in UTC (for greying out past dates)
  const todayUTC = (() => {
    const t = new Date();
    return { year: t.getUTCFullYear(), month: t.getUTCMonth(), day: t.getUTCDate() };
  })();

  // ── Close picker on outside click ──
  useEffect(() => {
    if (!showPicker) return;
    function onOutside(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowPicker(false);
        setInputError(null);
      }
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [showPicker]);

  // ── Focus the manual input when the picker opens ──
  useEffect(() => {
    if (showPicker) {
      // Small delay so the popover is painted before focusing
      const id = setTimeout(() => manualInputRef.current?.focus(), 50);
      return () => clearTimeout(id);
    }
  }, [showPicker]);

  // ── Open picker: reset to current/default selection ──
  function openPicker() {
    const init = getInitialSelection();
    setSelected(init);
    setCal({ year: init.year, month: init.month });
    setManualInput(ymdToDMY(init.year, init.month, init.day));
    setInputError(null);
    setShowPicker(true);
  }

  // ── Calendar day click ──
  function handleDayClick(year: number, month: number, day: number) {
    setSelected({ year, month, day });
    setManualInput(ymdToDMY(year, month, day));
    setInputError(null);
  }

  // ── Manual input change: sync to calendar if valid ──
  function handleManualChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setManualInput(val);
    setInputError(null);
    const parsed = tryParseDMY(val);
    if (parsed) {
      setSelected(parsed);
      setCal({ year: parsed.year, month: parsed.month });
    }
  }

  function handleManualKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") handleSave();
    if (e.key === "Escape") { setShowPicker(false); setInputError(null); }
  }

  // ── Calendar navigation ──
  function prevMonth() {
    setCal((c) => c.month === 0 ? { year: c.year - 1, month: 11 } : { year: c.year, month: c.month - 1 });
  }
  function nextMonth() {
    setCal((c) => c.month === 11 ? { year: c.year + 1, month: 0 } : { year: c.year, month: c.month + 1 });
  }

  // ── Save ──
  function handleSave() {
    try {
      parseDayMonthYear(manualInput); // throws if invalid
    } catch {
      setInputError("Enter a valid date in dd/mm/yyyy format");
      return;
    }

    // Build submission string from the selected tuple (source of truth for calendar clicks)
    const dateStr = ymdToDMY(selected.year, selected.month, selected.day);

    startTransition(async () => {
      const result = await setCookThisWeek(recipeId, dateStr);
      if (result.success && result.cookThisWeekUntil) {
        setCookThisWeekUntilState(result.cookThisWeekUntil);
        setShowPicker(false);
        setInputError(null);
      } else {
        setInputError(result.error ?? "Failed to save");
      }
    });
  }

  // ── Remove ──
  function handleRemove() {
    startTransition(async () => {
      const result = await removeCookThisWeek(recipeId);
      if (result.success) {
        setCookThisWeekUntilState(null);
        setShowPicker(false);
        setInputError(null);
      }
    });
  }

  // ── Build calendar grid ──
  function buildCalendarDays() {
    const { year, month } = cal;
    const totalDays = daysInMonth(year, month);
    // Monday-first offset: how many blank cells before day 1
    const startOffset = mondayFirstDOW(year, month, 1);
    // Total cells: pad to complete weeks
    const totalCells = Math.ceil((startOffset + totalDays) / 7) * 7;

    const cells: Array<{ day: number | null }> = [];
    for (let i = 0; i < totalCells; i++) {
      const dayNum = i - startOffset + 1;
      cells.push({ day: dayNum >= 1 && dayNum <= totalDays ? dayNum : null });
    }
    return cells;
  }

  const isMarked = cookThisWeekUntil !== null;
  const calDays = showPicker ? buildCalendarDays() : [];

  return (
    <div className="relative" ref={pickerRef}>
      {/* ── Trigger button ── */}
      <button
        type="button"
        onClick={openPicker}
        disabled={isPending}
        className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
          isPending ? "opacity-50" : ""
        } ${
          isMarked
            ? "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-400 dark:hover:bg-emerald-900"
            : "border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        }`}
      >
        {/* Calendar icon */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill={isMarked ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth={isMarked ? 0 : 2}
          className="h-4 w-4"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5"
          />
        </svg>
        {isMarked ? (
          <span>
            Cook by{" "}
            <span className="font-semibold">{formatReadable(cookThisWeekUntil!)}</span>
          </span>
        ) : (
          "Cook this week"
        )}
      </button>

      {/* ── Picker popover ── */}
      {showPicker && (
        <div
          role="dialog"
          aria-label="Pick a cook-by date"
          className="absolute left-0 top-full z-50 mt-2 w-72 rounded-xl border border-zinc-200 bg-white p-4 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
        >
          <p className="mb-3 text-sm font-semibold text-zinc-800 dark:text-zinc-100">
            Cook by date
          </p>

          {/* ── Calendar header ── */}
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={prevMonth}
              disabled={isPending}
              aria-label="Previous month"
              className="rounded-md p-1 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800 disabled:opacity-40 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </button>
            <span className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
              {MONTH_NAMES[cal.month]} {cal.year}
            </span>
            <button
              type="button"
              onClick={nextMonth}
              disabled={isPending}
              aria-label="Next month"
              className="rounded-md p-1 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800 disabled:opacity-40 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
              </svg>
            </button>
          </div>

          {/* ── Day-of-week headers ── */}
          <div className="mb-1 grid grid-cols-7 text-center">
            {DAY_HEADERS.map((d) => (
              <div
                key={d}
                className={`pb-1 text-[10px] font-semibold uppercase tracking-wide ${
                  d === "Su"
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-zinc-400 dark:text-zinc-500"
                }`}
              >
                {d}
              </div>
            ))}
          </div>

          {/* ── Calendar day grid ── */}
          <div className="grid grid-cols-7 gap-y-0.5 text-center text-sm">
            {calDays.map((cell, i) => {
              if (!cell.day) {
                return <div key={i} />;
              }
              const { year, month } = cal;
              const day = cell.day;

              const isSelected =
                selected.year === year &&
                selected.month === month &&
                selected.day === day;

              const isPast =
                year < todayUTC.year ||
                (year === todayUTC.year && month < todayUTC.month) ||
                (year === todayUTC.year && month === todayUTC.month && day < todayUTC.day);

              const isToday =
                year === todayUTC.year &&
                month === todayUTC.month &&
                day === todayUTC.day;

              // Sunday = column index 6 in Monday-first layout
              const isSunday = i % 7 === 6;

              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => !isPast && handleDayClick(year, month, day)}
                  disabled={isPast || isPending}
                  aria-label={`${day} ${MONTH_NAMES[month]} ${year}`}
                  aria-pressed={isSelected}
                  className={[
                    "mx-auto flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium transition-colors",
                    isSelected
                      ? "bg-primary text-white shadow-sm"
                      : isPast
                      ? "cursor-default text-zinc-300 dark:text-zinc-600"
                      : isToday
                      ? "font-bold text-primary ring-1 ring-primary hover:bg-primary/10"
                      : isSunday
                      ? "text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950"
                      : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800",
                  ].join(" ")}
                >
                  {day}
                </button>
              );
            })}
          </div>

          {/* ── Manual text input ── */}
          <div className="mt-3 border-t border-zinc-100 pt-3 dark:border-zinc-800">
            <label
              htmlFor="cook-this-week-manual-input"
              className="mb-1 block text-xs text-zinc-500 dark:text-zinc-400"
            >
              Or type manually{" "}
              <span className="font-mono text-zinc-400 dark:text-zinc-500">(dd/mm/yyyy)</span>
            </label>
            <input
              ref={manualInputRef}
              id="cook-this-week-manual-input"
              type="text"
              value={manualInput}
              onChange={handleManualChange}
              onKeyDown={handleManualKeyDown}
              placeholder="dd/mm/yyyy"
              maxLength={10}
              disabled={isPending}
              className={`w-full rounded-lg border px-3 py-1.5 font-mono text-sm text-zinc-900 placeholder-zinc-400 shadow-sm focus:outline-none focus:ring-2 disabled:opacity-50 dark:bg-zinc-800 dark:text-zinc-50 dark:placeholder-zinc-500 ${
                inputError
                  ? "border-red-400 focus:border-red-400 focus:ring-red-200 dark:border-red-600 dark:focus:ring-red-900"
                  : "border-zinc-200 focus:border-primary focus:ring-primary/20 dark:border-zinc-700"
              }`}
            />
            {/* aria-live so screen readers announce validation errors */}
            <p
              aria-live="polite"
              className="mt-1 min-h-[1rem] text-xs text-red-600 dark:text-red-400"
            >
              {inputError ?? ""}
            </p>
          </div>

          {/* ── Action buttons ── */}
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={isPending}
              className="flex-1 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-dark disabled:opacity-50"
            >
              {isPending ? "Saving…" : isMarked ? "Update" : "Mark"}
            </button>
            {isMarked && (
              <button
                type="button"
                onClick={handleRemove}
                disabled={isPending}
                className="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
              >
                Remove
              </button>
            )}
            <button
              type="button"
              onClick={() => { setShowPicker(false); setInputError(null); }}
              className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
