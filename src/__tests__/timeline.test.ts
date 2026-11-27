import { describe, expect, it } from 'vitest';
import type { Backend } from '../backend';
import { TIMELINE_KEEP_MS } from '../constants';
import { removeSession, saveSession } from '../lib/record';
import { clip, intersect, timelineWindow, totalMs, union } from '../lib/timeline';
import type { StudySession, TimelineEntry } from '../types';

const at = (h: number, m = 0, day = 27) => new Date(2026, 10, day, h, m).getTime();
const MIN = 60 * 1000;

describe('timeline window', () => {
  it('runs from 6:00 to 6:00 the next day in local time', () => {
    expect(timelineWindow(at(21))).toEqual({ start: at(6), end: at(6, 0, 28) });
    // 夜中の 2 時は「前の日」の続き
    expect(timelineWindow(at(2))).toEqual({ start: at(6, 0, 26), end: at(6) });
    expect(timelineWindow(at(6))).toEqual({ start: at(6), end: at(6, 0, 28) });
  });

  it('cuts spans at the edges of the window', () => {
    const w = timelineWindow(at(12));
    expect(clip([{ start: at(5), end: at(7) }], w)).toEqual([{ start: at(6), end: at(7) }]);
    expect(clip([{ start: at(3), end: at(5) }], w)).toEqual([]);
  });
});

describe('overlap of two people', () => {
  it('merges overlapping spans of one person', () => {
    expect(union([{ start: at(9), end: at(10) }, { start: at(9, 30), end: at(11) }, { start: at(13), end: at(14) }])).toEqual([
      { start: at(9), end: at(11) },
      { start: at(13), end: at(14) },
    ]);
  });

  it('finds the time both were studying', () => {
    const me = [{ start: at(20), end: at(22) }, { start: at(23), end: at(23, 30) }];
    const partner = [{ start: at(21), end: at(23, 15) }];
    const both = intersect(me, partner);
    expect(both).toEqual([{ start: at(21), end: at(22) }, { start: at(23), end: at(23, 15) }]);
    expect(totalMs(both)).toBe(75 * MIN);
    expect(intersect(me, [])).toEqual([]);
  });
});

describe('saving and deleting records', () => {
  function fakeBackend() {
    const sessions: StudySession[] = [];
    const timeline = new Map<string, TimelineEntry & { roomId: string }>();
    const backend = {
      addSession: async (_uid: string, s: Omit<StudySession, 'id'>) => {
        const id = `s${sessions.length + 1}`;
        sessions.push({ ...s, id });
        return id;
      },
      deleteSession: async (_uid: string, id: string) => {
        sessions.splice(sessions.findIndex((s) => s.id === id), 1);
      },
      addTimeline: async (roomId: string, e: TimelineEntry) => void timeline.set(e.id, { ...e, roomId }),
      deleteTimeline: async (_roomId: string, id: string) => void timeline.delete(id),
    } as unknown as Backend;
    return { backend, sessions, timeline };
  }
  const session = (endedAt: number) => ({ category: '英語', startedAt: endedAt - 50 * MIN, endedAt, durationSec: 3000, source: 'manual' as const });

  it('copies only category and times to the room, with the same id', async () => {
    const { backend, sessions, timeline } = fakeBackend();
    const id = await saveSession(backend, 'u1', 'ROOM01', session(Date.now()));
    expect(sessions[0].roomId).toBe('ROOM01');
    expect(timeline.get(id)).toEqual({ id, roomId: 'ROOM01', userId: 'u1', category: '英語', startedAt: sessions[0].startedAt, endedAt: sessions[0].endedAt });
    await removeSession(backend, 'u1', sessions[0]);
    expect(sessions).toHaveLength(0);
    expect(timeline.size).toBe(0);
  });

  it('does not copy records older than 2 days or when not in a room', async () => {
    const { backend, sessions, timeline } = fakeBackend();
    await saveSession(backend, 'u1', 'ROOM01', session(Date.now() - TIMELINE_KEEP_MS - MIN));
    await saveSession(backend, 'u1', null, session(Date.now()));
    expect(sessions).toHaveLength(2);
    expect(sessions.every((s) => s.roomId === undefined)).toBe(true);
    expect(timeline.size).toBe(0);
  });
});
