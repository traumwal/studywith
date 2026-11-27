import { describe, expect, it } from 'vitest';
import { totalsByCategory, totalsByDay, totalSec } from '../lib/stats';
import { addDays, formatClock, formatDuration, startOfWeek } from '../lib/time';
import { normalizeRoomCode, generateRoomCode } from '../lib/code';
import { categoryColor } from '../lib/color';
import { deskSetOf, effectiveStatus, roomSize, seatPosition, studiedSec } from '../room/draw';
import { elapsedSec } from '../hooks/useStudyTimer';
import { DEFAULT_AVATAR, PRESENCE_STALE_MS } from '../constants';
import type { Presence, StudySession } from '../types';

const s = (category: string, startedAt: number, min: number): StudySession => ({
  id: `${category}-${startedAt}`,
  category,
  startedAt,
  endedAt: startedAt + min * 60000,
  durationSec: min * 60,
  source: 'manual',
});

describe('time', () => {
  it('formats durations', () => {
    expect(formatDuration(0)).toBe('0分');
    expect(formatDuration(45 * 60 + 30)).toBe('45分');
    expect(formatDuration(3600)).toBe('1時間');
    expect(formatDuration(3600 + 20 * 60)).toBe('1時間20分');
    expect(formatClock(3725)).toBe('01:02:05');
  });

  it('weeks start on Monday', () => {
    const wed = new Date(2026, 10, 25, 15, 30).getTime(); // 2026-11-25 (水)
    const mon = new Date(startOfWeek(wed));
    expect(mon.getDay()).toBe(1);
    expect(mon.getDate()).toBe(23);
    expect(mon.getHours()).toBe(0);
    const sun = new Date(2026, 10, 29, 23, 0).getTime();
    expect(startOfWeek(sun)).toBe(mon.getTime());
  });
});

describe('stats', () => {
  const week = startOfWeek(new Date(2026, 10, 25).getTime());
  const list = [
    s('TOEIC', week + 10 * 3600e3, 30),
    s('TOEIC', addDays(week, 2) + 9 * 3600e3, 45),
    s('CG', addDays(week, 2) + 20 * 3600e3, 90),
  ];

  it('totals by category, largest first', () => {
    expect(totalsByCategory(list)).toEqual([
      { category: 'CG', sec: 5400 },
      { category: 'TOEIC', sec: 4500 },
    ]);
    expect(totalSec(list)).toBe(9900);
  });

  it('totals by day', () => {
    const days = totalsByDay(list, week);
    expect(days).toHaveLength(7);
    expect(days.map((d) => d.sec / 60)).toEqual([30, 0, 135, 0, 0, 0, 0]);
    expect(days[2].byCategory[0].category).toBe('CG');
  });
});

describe('room code', () => {
  it('normalizes input', () => {
    expect(normalizeRoomCode(' abc-234 ')).toBe('ABC234');
  });
  it('generates readable codes', () => {
    const code = generateRoomCode();
    expect(code).toMatch(/^[A-HJ-KM-NP-Z2-9]{6}$/);
  });
  it('category colors are stable', () => {
    expect(categoryColor('TOEIC')).toBe(categoryColor('TOEIC'));
  });
});

describe('presence', () => {
  const now = 1_000_000_000_000;
  const base: Presence = {
    uid: 'u',
    displayName: 'a',
    avatar: DEFAULT_AVATAR,
    status: 'studying',
    category: 'TOEIC',
    startedAt: now - 10 * 60000,
    accumulatedSec: 300,
    updatedAt: now - 1000,
  };

  it('treats stale presence as offline', () => {
    expect(effectiveStatus(base, now)).toBe('studying');
    expect(effectiveStatus({ ...base, updatedAt: now - PRESENCE_STALE_MS - 1 }, now)).toBe('offline');
    expect(effectiveStatus(undefined, now)).toBe('offline');
  });

  it('computes studied time excluding breaks', () => {
    expect(studiedSec(base, now)).toBe(900);
    expect(studiedSec({ ...base, status: 'break', startedAt: null }, now)).toBe(300);
  });

  it('timer elapsed', () => {
    expect(elapsedSec({ category: 'x', startedAt: 0, accumulatedSec: 60, segmentStartedAt: now - 30000 }, now)).toBe(90);
    expect(elapsedSec({ category: 'x', startedAt: 0, accumulatedSec: 60, segmentStartedAt: null }, now)).toBe(60);
  });

  it('desk set falls back to the default for old avatars', () => {
    expect(deskSetOf({ ...DEFAULT_AVATAR, desk: undefined }).id).toBe('ash');
    expect(deskSetOf({ ...DEFAULT_AVATAR, desk: 'walnut' }).id).toBe('walnut');
    expect(deskSetOf(undefined).id).toBe('ash');
  });

  it('room layout has at least two seats side by side', () => {
    // 席は最低 2 つ。2 人までは同じ広さで、増えたら横に広がる
    expect(roomSize(1)).toEqual(roomSize(2));
    expect(roomSize(3).width).toBeGreaterThan(roomSize(2).width);
    const { width } = roomSize(2);
    const a = seatPosition(0, 2, width);
    const b = seatPosition(1, 2, width);
    expect(a.deskY).toBe(b.deskY);
    expect((a.cx + b.cx) / 2).toBe(width / 2);
  });
});
