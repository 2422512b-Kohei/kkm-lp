"use client";

import { useEffect, useState } from "react";
import { CalendarDays, AlertTriangle, Info } from "lucide-react";
import InputForm from "@/components/InputForm";
import Sidebar from "@/components/Sidebar";
import Calendar from "@/components/Calendar";
import { pickColor } from "@/lib/colors";
import { CURRENT_YEAR, type Company, type ScheduleDate } from "@/lib/types";

const STORAGE_KEY = "intern-schedule-overlap:companies:v1";

export default function Home() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [month, setMonth] = useState<number>(6); // 2026年6月始まり
  const [loaded, setLoaded] = useState(false);

  // 起動時に localStorage から読み込み
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Company[];
        if (Array.isArray(parsed)) setCompanies(parsed);
      }
    } catch {
      // 壊れたデータは無視
    }
    setLoaded(true);
  }, []);

  // 変更があるたびに保存（初回読み込み完了後のみ）
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(companies));
    } catch {
      // 容量超過などは無視
    }
  }, [companies, loaded]);

  const addCompany = (
    name: string,
    dates: ScheduleDate[],
    rawText: string
  ) => {
    setCompanies((prev) => {
      const color = pickColor(prev.map((c) => c.color.name));
      const company: Company = {
        id:
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name,
        color,
        dates,
        visible: true,
        rawText,
      };
      return [...prev, company];
    });
    // 追加した最初の日付の月へジャンプ（利便性）
    if (dates.length > 0) setMonth(dates[0].month);
  };

  const toggleCompany = (id: string) => {
    setCompanies((prev) =>
      prev.map((c) => (c.id === id ? { ...c, visible: !c.visible } : c))
    );
  };

  const removeCompany = (id: string) => {
    setCompanies((prev) => prev.filter((c) => c.id !== id));
  };

  const prevMonth = () => setMonth((m) => (m <= 1 ? 1 : m - 1));
  const nextMonth = () => setMonth((m) => (m >= 12 ? 12 : m + 1));
  const goToday = () => setMonth(6);

  // 全体の重複サマリー（表示中の企業のみ）
  const visible = companies.filter((c) => c.visible);
  const dayMap = new Map<string, number>();
  for (const c of visible) {
    for (const d of c.dates) {
      const key = `${d.month}-${d.day}`;
      dayMap.set(key, (dayMap.get(key) ?? 0) + 1);
    }
  }
  const totalConflicts = Array.from(dayMap.values()).filter((n) => n >= 2)
    .length;

  return (
    <main className="min-h-screen">
      {/* ヘッダーバー */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-6 py-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white">
            <CalendarDays size={22} />
          </div>
          <div>
            <h1 className="text-lg font-black tracking-tight text-slate-900">
              インターン日程かぶりチェッカー
            </h1>
            <p className="text-xs text-slate-500">
              候補日程を貼り付けて、{CURRENT_YEAR}年の重複を一目で確認
            </p>
          </div>
          <div className="ml-auto">
            {totalConflicts > 0 ? (
              <span className="flex items-center gap-1.5 rounded-full bg-red-100 px-3.5 py-1.5 text-sm font-bold text-red-700">
                <AlertTriangle size={15} />
                重複 {totalConflicts} 日
              </span>
            ) : (
              <span className="flex items-center gap-1.5 rounded-full bg-emerald-100 px-3.5 py-1.5 text-sm font-bold text-emerald-700">
                <Info size={15} />
                重複なし
              </span>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-5 px-6 py-6 lg:grid-cols-[340px_1fr]">
        {/* 左カラム: 入力 + 企業管理 */}
        <div className="space-y-5">
          <InputForm onAdd={addCompany} />
          <Sidebar
            companies={companies}
            onToggle={toggleCompany}
            onRemove={removeCompany}
          />
        </div>

        {/* 右カラム: カレンダー */}
        <div className="space-y-4">
          <Calendar
            companies={companies}
            year={CURRENT_YEAR}
            month={month}
            onPrevMonth={prevMonth}
            onNextMonth={nextMonth}
            onToday={goToday}
          />

          {/* 凡例 */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-xs text-slate-500">
            <span className="font-semibold text-slate-600">凡例:</span>
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-5 rounded bg-red-50 ring-1 ring-red-200" />
              2社重複
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-5 rounded bg-red-100 ring-2 ring-red-300" />
              3社以上重複
            </span>
            <span className="flex items-center gap-1.5">
              <span className="rounded bg-red-500 px-1 py-0.5 text-[9px] font-bold text-white">
                ⚠️ N社
              </span>
              重複している日数
            </span>
          </div>
        </div>
      </div>
    </main>
  );
}
