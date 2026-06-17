import type { PastelColor } from "./types";

/**
 * 企業ごとに割り振るパステルカラーのパレット。
 * Tailwind の purge を避けるため、色は inline style 用の hex で保持する。
 */
export const PASTEL_COLORS: PastelColor[] = [
  { name: "ブルー", bg: "#dbeafe", text: "#1e40af", accent: "#3b82f6" },
  { name: "グリーン", bg: "#dcfce7", text: "#166534", accent: "#22c55e" },
  { name: "パープル", bg: "#ede9fe", text: "#5b21b6", accent: "#8b5cf6" },
  { name: "オレンジ", bg: "#ffedd5", text: "#9a3412", accent: "#f97316" },
  { name: "ピンク", bg: "#fce7f3", text: "#9d174d", accent: "#ec4899" },
  { name: "ティール", bg: "#ccfbf1", text: "#115e59", accent: "#14b8a6" },
  { name: "イエロー", bg: "#fef9c3", text: "#854d0e", accent: "#eab308" },
  { name: "インディゴ", bg: "#e0e7ff", text: "#3730a3", accent: "#6366f1" },
];

/** すでに使われている色を避けて次の色を選ぶ */
export function pickColor(usedColorNames: string[]): PastelColor {
  const unused = PASTEL_COLORS.find((c) => !usedColorNames.includes(c.name));
  if (unused) return unused;
  // すべて使い切ったら巡回
  return PASTEL_COLORS[usedColorNames.length % PASTEL_COLORS.length];
}
