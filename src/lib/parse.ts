import type { ScheduleDate } from "./types";

/**
 * テキストから「月」「日」をすべて抽出する。
 *
 * 対応する書式の例:
 *   - 「7月21日(火)」「9 月 8 日」 ……  ◯月◯日 形式
 *   - 「8/4」「8 / 4」「8/4, 8/5」 ……  ◯/◯ 形式
 *
 * 年は今年（CURRENT_YEAR）固定のため、結果には month / day のみを返す。
 * 重複（同じ月日）は除去し、月日順にソートして返す。
 */
export function parseDates(text: string): ScheduleDate[] {
  const results: ScheduleDate[] = [];
  const seen = new Set<string>();

  const push = (month: number, day: number) => {
    if (!Number.isInteger(month) || !Number.isInteger(day)) return;
    if (month < 1 || month > 12) return;
    if (day < 1 || day > 31) return;
    const key = `${month}-${day}`;
    if (seen.has(key)) return;
    seen.add(key);
    results.push({ month, day });
  };

  // ◯月◯日 形式（間のスペースも許容）
  const jpRe = /(\d{1,2})\s*月\s*(\d{1,2})\s*日/g;
  let m: RegExpExecArray | null;
  while ((m = jpRe.exec(text)) !== null) {
    push(Number(m[1]), Number(m[2]));
  }

  // ◯/◯ 形式（前後が数字の場合（例 2026/7/21 の年部分）は除外）
  const slashRe = /(?<![\d/])(\d{1,2})\s*\/\s*(\d{1,2})(?![\d/])/g;
  while ((m = slashRe.exec(text)) !== null) {
    push(Number(m[1]), Number(m[2]));
  }

  results.sort((a, b) => a.month - b.month || a.day - b.day);
  return results;
}

/** 入力テキストの1行目を企業名として推定する（空行はスキップ） */
export function guessCompanyName(text: string): string {
  const firstLine = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (!firstLine) return "";
  // 「A社 8/4, 8/5」のように同じ行に日付がある場合は、日付より前を企業名とする
  const beforeDate = firstLine.split(/(\d{1,2}\s*月|\d{1,2}\s*\/)/)[0].trim();
  return (beforeDate || firstLine).replace(/[、,:：].*$/, "").trim();
}
