"use client";

import { useState } from "react";
import { Plus, Sparkles } from "lucide-react";
import { parseDates, guessCompanyName } from "@/lib/parse";
import type { ScheduleDate } from "@/lib/types";

interface Props {
  onAdd: (name: string, dates: ScheduleDate[], rawText: string) => void;
}

const PLACEHOLDER = `例:
関西電力 全6日程
第1回:7月21日(火)、第2回:8月4日(火)、第3回:9月8日(火)

または
A社 8/4, 8/5, 9/1`;

export default function InputForm({ onAdd }: Props) {
  const [name, setName] = useState("");
  const [text, setText] = useState("");

  // 入力中のプレビュー（抽出される日付）
  const preview = parseDates(text);
  const effectiveName = name.trim() || guessCompanyName(text);

  const handleAdd = () => {
    const dates = parseDates(text);
    if (dates.length === 0) return;
    const finalName = name.trim() || guessCompanyName(text) || "名称未設定";
    onAdd(finalName, dates, text);
    setName("");
    setText("");
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white">
          <Plus size={18} />
        </div>
        <h2 className="text-base font-bold text-slate-800">日程を追加</h2>
      </div>

      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500">
            企業名（空欄なら1行目から自動取得）
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例: 関西電力"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500">
            日程テキスト（コピペでOK）
          </label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={PLACEHOLDER}
            rows={6}
            className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm leading-relaxed outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
          />
        </div>

        {/* 抽出プレビュー */}
        {text.trim().length > 0 && (
          <div className="rounded-lg bg-slate-50 p-3">
            <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-500">
              <Sparkles size={13} />
              抽出結果プレビュー
              {effectiveName && (
                <span className="text-indigo-600">／ {effectiveName}</span>
              )}
            </div>
            {preview.length === 0 ? (
              <p className="text-xs text-slate-400">
                日付が見つかりません（「7月21日」や「8/4」の形式で入力してください）
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {preview.map((d) => (
                  <span
                    key={`${d.month}-${d.day}`}
                    className="rounded-md bg-white px-2 py-0.5 text-xs font-medium text-slate-700 ring-1 ring-slate-200"
                  >
                    {d.month}/{d.day}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        <button
          onClick={handleAdd}
          disabled={preview.length === 0}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          <Plus size={16} />
          カレンダーに追加
          {preview.length > 0 && `（${preview.length}件）`}
        </button>
      </div>
    </div>
  );
}
