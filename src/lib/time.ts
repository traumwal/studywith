const DAY_MS = 24 * 60 * 60 * 1000;

/** 秒を「1時間5分」「45分」のように表す */
export function formatDuration(sec: number): string {
  const totalMin = Math.floor(Math.max(0, sec) / 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}分`;
  if (m === 0) return `${h}時間`;
  return `${h}時間${m}分`;
}

/** タイマー表示用 01:23:45 */
export function formatClock(sec: number): string {
  const s = Math.floor(Math.max(0, sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(r)}`;
}

/** その日を含む週の月曜 0:00（ローカル時刻）を返す */
export function startOfWeek(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  const diff = (d.getDay() + 6) % 7; // 月曜=0
  d.setDate(d.getDate() - diff);
  return d.getTime();
}

export function addDays(ms: number, days: number): number {
  const d = new Date(ms);
  d.setDate(d.getDate() + days);
  return d.getTime();
}

export function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function formatDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function formatTime(ms: number): string {
  const d = new Date(ms);
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export const WEEKDAYS = ['月', '火', '水', '木', '金', '土', '日'];

export { DAY_MS };
