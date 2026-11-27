import { TIMELINE_DAY_START_HOUR } from '../constants';
import { addDays } from './time';

/** タイムラインの帯の 1 区間 */
export interface Span {
  start: number;
  end: number;
}

/** now を含む「6 時〜翌 6 時」（見ている人の現地時刻） */
export function timelineWindow(now: number): Span {
  const d = new Date(now);
  d.setHours(TIMELINE_DAY_START_HOUR, 0, 0, 0);
  if (d.getTime() > now) d.setDate(d.getDate() - 1);
  const start = d.getTime();
  return { start, end: addDays(start, 1) };
}

/** 枠からはみ出した部分を切る（6 時をまたぐ記録は端で切る） */
export function clip<T extends Span>(spans: T[], window: Span): T[] {
  return spans
    .map((s) => ({ ...s, start: Math.max(s.start, window.start), end: Math.min(s.end, window.end) }))
    .filter((s) => s.end > s.start);
}

/** 重なっている区間をまとめる */
export function union(spans: Span[]): Span[] {
  const sorted = [...spans].sort((a, b) => a.start - b.start);
  const out: Span[] = [];
  for (const s of sorted) {
    const last = out.at(-1);
    if (last && s.start <= last.end) last.end = Math.max(last.end, s.end);
    else out.push({ start: s.start, end: s.end });
  }
  return out;
}

/** 2 人の時間が重なった区間 */
export function intersect(a: Span[], b: Span[]): Span[] {
  const A = union(a);
  const B = union(b);
  const out: Span[] = [];
  let i = 0;
  let j = 0;
  while (i < A.length && j < B.length) {
    const start = Math.max(A[i].start, B[j].start);
    const end = Math.min(A[i].end, B[j].end);
    if (end > start) out.push({ start, end });
    if (A[i].end < B[j].end) i++;
    else j++;
  }
  return out;
}

export function totalMs(spans: Span[]): number {
  return union(spans).reduce((sum, s) => sum + (s.end - s.start), 0);
}
