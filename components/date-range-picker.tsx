'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';

type PeriodValue = {
  startDate: string;
  endDate: string;
};

type DateRangePickerProps = {
  value: PeriodValue;
  onChange: (value: PeriodValue) => void;
  className?: string;
};

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
const MONTH_FORMATTER = new Intl.DateTimeFormat('pt-BR', {
  month: 'long',
  year: 'numeric',
});

function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

function fromDateInputValue(value: string) {
  return new Date(`${value}T00:00:00`);
}

function formatDateInput(value: string) {
  const [year, month, day] = value.split('-');
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function parseDateInput(value: string) {
  const numbers = value.replace(/\D/g, '');
  if (numbers.length !== 8) return null;
  const day = numbers.slice(0, 2);
  const month = numbers.slice(2, 4);
  const year = numbers.slice(4, 8);
  const parsed = new Date(`${year}-${month}-${day}T00:00:00`);

  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getFullYear() !== Number(year) ||
    parsed.getMonth() + 1 !== Number(month) ||
    parsed.getDate() !== Number(day)
  ) {
    return null;
  }

  return `${year}-${month}-${day}`;
}

function maskDateInput(value: string) {
  const numbers = value.replace(/\D/g, '').slice(0, 8);
  if (numbers.length <= 2) return numbers;
  if (numbers.length <= 4) return `${numbers.slice(0, 2)}/${numbers.slice(2)}`;
  return `${numbers.slice(0, 2)}/${numbers.slice(2, 4)}/${numbers.slice(4)}`;
}

function getCurrentMonthPeriod() {
  const now = new Date();
  return {
    startDate: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`,
    endDate: toDateInputValue(now),
  };
}

function getLastMonthPeriod() {
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
  return {
    startDate: toDateInputValue(firstDay),
    endDate: toDateInputValue(lastDay),
  };
}

function getLastWeekPeriod() {
  const now = new Date();
  const currentDay = now.getDay();
  const lastSunday = new Date(now);
  lastSunday.setDate(now.getDate() - currentDay - 7);
  const lastSaturday = new Date(lastSunday);
  lastSaturday.setDate(lastSunday.getDate() + 6);
  return {
    startDate: toDateInputValue(lastSunday),
    endDate: toDateInputValue(lastSaturday),
  };
}

function buildCalendarDays(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return day;
  });
}

function compareDateOnly(a: string, b: string) {
  return fromDateInputValue(a).getTime() - fromDateInputValue(b).getTime();
}

function isBetween(day: string, startDate: string, endDate: string) {
  return compareDateOnly(day, startDate) >= 0 && compareDateOnly(day, endDate) <= 0;
}

function ManualDateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [displayValue, setDisplayValue] = useState(formatDateInput(value));

  useEffect(() => {
    setDisplayValue(formatDateInput(value));
  }, [value]);

  const commit = () => {
    const parsed = parseDateInput(displayValue);
    if (parsed) {
      onChange(parsed);
      return;
    }
    setDisplayValue(formatDateInput(value));
  };

  return (
    <label className="text-xs font-semibold text-gray-500">
      {label}
      <input
        type="text"
        inputMode="numeric"
        value={displayValue}
        onChange={(event) => setDisplayValue(maskDateInput(event.target.value))}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
        placeholder="dd/mm/aaaa"
        className="mt-1 h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
      />
    </label>
  );
}

export function DateRangePicker({ value, onChange, className = '' }: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [selecting, setSelecting] = useState<'start' | 'end'>('start');
  const [visibleMonth, setVisibleMonth] = useState(() => fromDateInputValue(value.startDate));
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setDraft(value);
    setVisibleMonth(fromDateInputValue(value.startDate));
  }, [value]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const days = useMemo(() => buildCalendarDays(visibleMonth), [visibleMonth]);
  const monthLabel = MONTH_FORMATTER.format(visibleMonth);
  const formattedMonthLabel = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);

  const applyPeriod = (next: PeriodValue) => {
    const ordered =
      compareDateOnly(next.startDate, next.endDate) <= 0
        ? next
        : { startDate: next.endDate, endDate: next.startDate };
    setDraft(ordered);
    onChange(ordered);
  };

  const updateDraft = (field: keyof PeriodValue, nextValue: string) => {
    const next = { ...draft, [field]: nextValue };
    setDraft(next);
  };

  const selectDay = (day: string) => {
    if (selecting === 'start') {
      const next = {
        startDate: day,
        endDate: compareDateOnly(day, draft.endDate) > 0 ? day : draft.endDate,
      };
      setDraft(next);
      setSelecting('end');
      return;
    }

    const next =
      compareDateOnly(day, draft.startDate) < 0
        ? { startDate: day, endDate: draft.startDate }
        : { startDate: draft.startDate, endDate: day };
    applyPeriod(next);
    setSelecting('start');
    setOpen(false);
  };

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex min-h-11 w-full items-center gap-3 rounded-md border border-gray-300 bg-white px-3 text-left text-sm text-gray-900 shadow-sm transition hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-100"
      >
        <CalendarDays className="size-4 shrink-0 text-blue-600" />
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-semibold text-gray-500">Período</span>
          <span className="block truncate">
            {formatDateInput(value.startDate)} até {formatDateInput(value.endDate)}
          </span>
        </span>
      </button>

      {open ? (
        <div className="fixed left-1/2 top-24 z-50 max-h-[calc(100vh-7rem)] w-[min(calc(100vw-2rem),42rem)] -translate-x-1/2 overflow-y-auto rounded-lg border border-gray-200 bg-white p-3 shadow-xl">
          <div className="grid gap-3 lg:grid-cols-[10rem_1fr]">
            <div className="grid content-start gap-2">
              {[
                ['Este mês', getCurrentMonthPeriod()],
                ['Semana passada', getLastWeekPeriod()],
                ['Mês passado', getLastMonthPeriod()],
              ].map(([label, preset]) => (
                <button
                  key={label as string}
                  type="button"
                  onClick={() => {
                    applyPeriod(preset as PeriodValue);
                    setOpen(false);
                  }}
                  className="rounded-md px-3 py-2 text-left text-sm font-medium text-gray-700 hover:bg-blue-50 hover:text-blue-700"
                >
                  {label as string}
                </button>
              ))}
              <div className="mt-2 grid grid-cols-2 gap-2 lg:grid-cols-1">
                <ManualDateField
                  label="De"
                  value={draft.startDate}
                  onChange={(next) => updateDraft('startDate', next)}
                />
                <ManualDateField
                  label="Até"
                  value={draft.endDate}
                  onChange={(next) => updateDraft('endDate', next)}
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  applyPeriod(draft);
                  setOpen(false);
                }}
                className="mt-1 rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Aplicar
              </button>
            </div>

            <div>
              <div className="mb-3 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() =>
                    setVisibleMonth(
                      new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1)
                    )
                  }
                  className="rounded-md border border-gray-200 p-2 text-gray-600 hover:bg-gray-50"
                  aria-label="Mês anterior"
                >
                  <ChevronLeft className="size-4" />
                </button>
                <div className="text-sm font-semibold text-gray-950">{formattedMonthLabel}</div>
                <button
                  type="button"
                  onClick={() =>
                    setVisibleMonth(
                      new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1)
                    )
                  }
                  className="rounded-md border border-gray-200 p-2 text-gray-600 hover:bg-gray-50"
                  aria-label="Próximo mês"
                >
                  <ChevronRight className="size-4" />
                </button>
              </div>
              <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-gray-400">
                {WEEKDAYS.map((weekday) => (
                  <div key={weekday} className="py-1">
                    {weekday}
                  </div>
                ))}
              </div>
              <div className="mt-1 grid grid-cols-7 gap-1">
                {days.map((day) => {
                  const dayValue = toDateInputValue(day);
                  const isCurrentMonth = day.getMonth() === visibleMonth.getMonth();
                  const isStart = dayValue === draft.startDate;
                  const isEnd = dayValue === draft.endDate;
                  const selected = isBetween(dayValue, draft.startDate, draft.endDate);

                  return (
                    <button
                      key={dayValue}
                      type="button"
                      onClick={() => selectDay(dayValue)}
                      className={`h-9 rounded-md text-sm transition ${
                        isStart || isEnd
                          ? 'bg-blue-600 font-semibold text-white'
                          : selected
                            ? 'bg-blue-50 text-blue-700'
                            : isCurrentMonth
                              ? 'text-gray-800 hover:bg-gray-100'
                              : 'text-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {day.getDate()}
                    </button>
                  );
                })}
              </div>
              <div className="mt-3 text-xs text-gray-500">
                Clique uma vez para escolher o início e outra vez para escolher o fim.
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function getDefaultPeriod() {
  return getCurrentMonthPeriod();
}

export function addDays(value: string, days: number) {
  const date = fromDateInputValue(value);
  date.setDate(date.getDate() + days);
  return toDateInputValue(date);
}

export function formatDateInputLabel(value: string) {
  return formatDateInput(value);
}
