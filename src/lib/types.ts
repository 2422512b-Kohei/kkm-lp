/** カレンダーで扱う年は今年（2026年）に固定 */
export const CURRENT_YEAR = 2026;

/** 抽出した候補日（年は CURRENT_YEAR を前提とする） */
export interface ScheduleDate {
  month: number; // 1-12
  day: number; // 1-31
}

/** 企業に割り当てるパステルカラー */
export interface PastelColor {
  name: string;
  /** チップ等の塗り */
  bg: string;
  /** チップの文字色 */
  text: string;
  /** 縁取り・ドット用の濃い色 */
  accent: string;
}

/** 登録された企業（＝1つの選考スケジュール群） */
export interface Company {
  id: string;
  name: string;
  color: PastelColor;
  dates: ScheduleDate[];
  /** カレンダー上での表示 / 非表示 */
  visible: boolean;
  /** 元の入力テキスト（編集・再表示用） */
  rawText: string;
}
