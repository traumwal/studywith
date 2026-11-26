import type { StudySession } from '../types';
import { addDays, startOfDay } from './time';

export interface CategoryTotal {
  category: string;
  sec: number;
}

export function totalsByCategory(sessions: StudySession[]): CategoryTotal[] {
  const map = new Map<string, number>();
  for (const s of sessions) map.set(s.category, (map.get(s.category) ?? 0) + s.durationSec);
  return [...map.entries()]
    .map(([category, sec]) => ({ category, sec }))
    .sort((a, b) => b.sec - a.sec);
}

export interface DayTotal {
  dayStart: number;
  sec: number;
  byCategory: CategoryTotal[];
}

/** weekStart から 7 日分の日別合計。セッションは開始した日に数える */
export function totalsByDay(sessions: StudySession[], weekStart: number): DayTotal[] {
  const days: DayTotal[] = [];
  for (let i = 0; i < 7; i++) {
    const dayStart = addDays(weekStart, i);
    const inDay = sessions.filter((s) => startOfDay(s.startedAt) === dayStart);
    days.push({
      dayStart,
      sec: inDay.reduce((a, s) => a + s.durationSec, 0),
      byCategory: totalsByCategory(inDay),
    });
  }
  return days;
}

export function totalSec(sessions: StudySession[]): number {
  return sessions.reduce((a, s) => a + s.durationSec, 0);
}
