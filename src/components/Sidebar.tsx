"use client";

import { Trash2, Eye, EyeOff, Building2 } from "lucide-react";
import type { Company } from "@/lib/types";

interface Props {
  companies: Company[];
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
}

export default function Sidebar({ companies, onToggle, onRemove }: Props) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800 text-white">
            <Building2 size={18} />
          </div>
          <h2 className="text-base font-bold text-slate-800">登録企業</h2>
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
          {companies.length}社
        </span>
      </div>

      {companies.length === 0 ? (
        <p className="rounded-lg bg-slate-50 px-3 py-6 text-center text-xs text-slate-400">
          まだ企業が登録されていません。
          <br />
          左のフォームから日程を追加してください。
        </p>
      ) : (
        <ul className="space-y-2">
          {companies.map((c) => (
            <li
              key={c.id}
              className="group rounded-xl border border-slate-200 p-3 transition hover:border-slate-300"
              style={{ opacity: c.visible ? 1 : 0.55 }}
            >
              <div className="flex items-center gap-2.5">
                <span
                  className="h-3.5 w-3.5 shrink-0 rounded-full"
                  style={{ backgroundColor: c.color.accent }}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-slate-800">
                    {c.name}
                  </p>
                  <p className="text-xs text-slate-400">{c.dates.length}日程</p>
                </div>

                <button
                  onClick={() => onToggle(c.id)}
                  title={c.visible ? "非表示にする" : "表示する"}
                  className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                >
                  {c.visible ? <Eye size={16} /> : <EyeOff size={16} />}
                </button>
                <button
                  onClick={() => onRemove(c.id)}
                  title="削除"
                  className="rounded-md p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 size={16} />
                </button>
              </div>

              <div className="mt-2 flex flex-wrap gap-1">
                {c.dates.map((d) => (
                  <span
                    key={`${d.month}-${d.day}`}
                    className="rounded px-1.5 py-0.5 text-[11px] font-medium"
                    style={{ backgroundColor: c.color.bg, color: c.color.text }}
                  >
                    {d.month}/{d.day}
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
