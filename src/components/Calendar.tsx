"use client";

import { ChevronLeft, ChevronRight, AlertTriangle } from "lucide-react";
import type { Company } from "@/lib/types";

interface Props {
  companies: Company[];
  year: number;
  month: number; // 1-12
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onToday: () => void;
}

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

interface DayEvent {
  companyId: string;
  name: string;
  bg: string;
  text: string;
}

/** 重複数に応じたセルの背景色を返す */
function conflictCellStyle(count: number): string {
  if (count >= 3) return "bg-red-100 ring-2 ring-red-300";
  if (count >= 2) return "bg-red-50 ring-1 ring-red-200";
  return "bg-white ring-1 ring-slate-100";
}

export default function Calendar({
  companies,
  year,
  month,
  onPrevMonth,
  onNextMonth,
  onToday,
}: Props) {
  const visibleCompanies = companies.filter((c) => c.visible);

  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();

  // その月に重複が何日あるか集計（ヘッダー表示用）
  let conflictDays = 0;

  // 日付セルを構築
  const cells: ({ day: number; events: DayEvent[]; count: number } | null)[] =
    [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) {
    const events: DayEvent[] = [];
    for (const c of visibleCompanies) {
      if (c.dates.some((d) => d.month === month && d.day === day)) {
        events.push({
          companyId: c.id,
          name: c.name,
          bg: c.color.bg,
          text: c.color.text,
        });
      }
    }
    if (events.length >= 2) conflictDays++;
    cells.push({ day, events, count: events.length });
  }
  // 末尾を7の倍数に揃える
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      {/* ヘッダー */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-black text-slate-800">
            {year}年 {month}月
          </h2>
          {conflictDays > 0 && (
            <span className="flex items-center gap-1 rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-700">
              <AlertTriangle size={13} />
              この月に {conflictDays} 日の重複
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={onPrevMonth}
            className="rounded-lg border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-50"
            aria-label="前の月"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            onClick={onToday}
            className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50"
          >
            今月
          </button>
          <button
            onClick={onNextMonth}
            className="rounded-lg border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-50"
            aria-label="次の月"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* 曜日 */}
      <div className="mb-1 grid grid-cols-7 gap-1.5">
        {WEEKDAYS.map((w, i) => (
          <div
            key={w}
            className={`py-1 text-center text-xs font-bold ${
              i === 0
                ? "text-red-500"
                : i === 6
                ? "text-blue-500"
                : "text-slate-400"
            }`}
          >
            {w}
          </div>
        ))}
      </div>

      {/* 日付グリッド */}
      <div className="grid grid-cols-7 gap-1.5">
        {cells.map((cell, idx) => {
          if (!cell) {
            return <div key={`empty-${idx}`} className="min-h-[92px]" />;
          }
          const weekday = idx % 7;
          return (
            <div
              key={cell.day}
              className={`min-h-[92px] rounded-xl p-1.5 transition ${conflictCellStyle(
                cell.count
              )}`}
            >
              <div className="mb-1 flex items-center justify-between">
                <span
                  className={`text-xs font-bold ${
                    weekday === 0
                      ? "text-red-500"
                      : weekday === 6
                      ? "text-blue-500"
                      : "text-slate-500"
                  }`}
                >
                  {cell.day}
                </span>
                {cell.count >= 2 && (
                  <span className="flex items-center gap-0.5 rounded bg-red-500 px-1 py-0.5 text-[9px] font-bold leading-none text-white">
                    ⚠️ {cell.count}社
                  </span>
                )}
              </div>

              <div className="space-y-1">
                {cell.events.map((e) => (
                  <div
                    key={e.companyId}
                    className="truncate rounded px-1.5 py-0.5 text-[11px] font-semibold"
                    style={{ backgroundColor: e.bg, color: e.text }}
                    title={e.name}
                  >
                    {e.name}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
