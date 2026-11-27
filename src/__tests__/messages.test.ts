import { describe, expect, it } from 'vitest';
import { DEFAULT_STAMPS, MAX_MESSAGE_LEN } from '../constants';
import { newProfile } from '../lib/profile';
import { autoMessageText, clampText, mergeMessages, stampsOf, toneOf } from '../lib/messages';
import { COMMENT_CROSS_MS, COMMENT_LANES, CommentScheduler } from '../room/comments';
import type { RoomMessage } from '../types';

describe('auto messages', () => {
  it('fills category and duration into the fixed text of each tone', () => {
    expect(autoMessageText('plain', 'auto-start', '英語')).toBe('英語 開始');
    expect(autoMessageText('plain', 'auto-break', '英語')).toBe('ちょっと休憩');
    expect(autoMessageText('plain', 'auto-stop', '英語', 50 * 60)).toBe('英語 50分 終わった');
    expect(autoMessageText('cat', 'auto-stop', 'TOEIC', 80 * 60)).toBe('TOEIC 1時間20分 できたにゃ');
    expect(autoMessageText('genki', 'auto-start', 'CG')).toBe('CG スタート！');
  });

  it('keeps messages within the length limit', () => {
    const long = 'あ'.repeat(60);
    expect([...autoMessageText('plain', 'auto-start', long)].length).toBe(MAX_MESSAGE_LEN);
    expect(clampText('  おつかれ  ')).toBe('おつかれ');
  });

  it('falls back to defaults for old profiles', () => {
    const p = newProfile('u1', 'ゆき');
    expect(stampsOf(p)).toEqual(DEFAULT_STAMPS);
    expect(toneOf(p)).toBe('plain');
    expect(toneOf({ ...p, tone: 'cat' })).toBe('cat');
  });

  it('merges live and fetched messages without duplicates, newest first', () => {
    const m = (id: string, createdAt: number): RoomMessage => ({ id, senderId: 'u', kind: 'stamp', text: id, createdAt });
    const merged = mergeMessages([m('a', 1), m('b', 3)], [m('b', 3), m('c', 2)], 10);
    expect(merged.map((x) => x.id)).toEqual(['b', 'c', 'a']);
    expect(mergeMessages([m('a', 1), m('b', 2)], [], 1).map((x) => x.id)).toEqual(['b']);
  });
});

describe('flowing comments', () => {
  const W = 240;
  // 1 文字 = 5px とみなす
  const scheduler = () => new CommentScheduler((t) => [...t].length * 5);
  const c = (id: string, text = 'おつかれ') => ({ id, text, color: '#f0643a', auto: false });

  it('enters from the right edge and leaves after about 10 seconds', () => {
    const s = scheduler();
    s.push(c('a'));
    expect(s.tick(0, W)[0]).toMatchObject({ x: W, y: COMMENT_LANES[0] });
    expect(s.tick(COMMENT_CROSS_MS / 2, W)[0].x).toBe(W / 2);
    expect(s.tick(COMMENT_CROSS_MS + 2000, W)).toHaveLength(0);
    expect(s.size).toBe(0);
  });

  it('uses the second lane, then waits until a lane frees up', () => {
    const s = scheduler();
    s.push(c('a'));
    s.push(c('b'));
    s.push(c('c'));
    const first = s.tick(0, W);
    expect(first.map((x) => x.lane)).toEqual([0, 1]);
    expect(s.size).toBe(3);
    // 前のコメント（幅 32px）＋間隔 12px が通り過ぎたら、同じレーンに次が入る
    const later = s.tick(3000, W);
    expect(later.map((x) => x.id)).toEqual(['a', 'b', 'c']);
    expect(later.find((x) => x.id === 'c')!.x).toBe(W);
  });
});
