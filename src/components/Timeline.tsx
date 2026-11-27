import { useEffect, useMemo, useState } from 'react';
import type { Backend } from '../backend';
import { categoryColor } from '../lib/color';
import { clip, intersect, timelineWindow, totalMs, type Span } from '../lib/timeline';
import { formatDuration, formatTime } from '../lib/time';
import { effectiveStatus } from '../room/draw';
import { useNow } from '../hooks/useStudyTimer';
import type { Presence, Room, TimelineEntry, UserProfile } from '../types';

interface Bar extends Span {
  key: string;
  category: string;
  /** まだ勉強中（ストップ前）の区間 */
  live: boolean;
}

const TICKS = [6, 9, 12, 15, 18, 21, 0, 3, 6];

/**
 * 今日（6 時〜翌 6 時）のタイムライン。自分・相手・2 人が重なった時間の 3 段。
 * 保存済みの記録は部屋の timeline から、勉強中の区間は在席情報から出す。
 */
export function Timeline({ backend, room, profile }: { backend: Backend; room: Room; profile: UserProfile }) {
  const now = useNow(60 * 1000);
  const window = timelineWindow(now);
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [presence, setPresence] = useState<Presence[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => backend.watchTimeline(room.id, window.start, setEntries), [backend, room.id, window.start]);
  useEffect(() => backend.watchPresence(room.id, setPresence), [backend, room.id]);

  const partnerId = room.memberIds.find((id) => id !== profile.uid) ?? null;
  const partnerName = presence.find((p) => p.uid === partnerId)?.displayName ?? '相手';

  const barsOf = useMemo(
    () => (uid: string | null): Bar[] => {
      if (!uid) return [];
      const saved = entries
        .filter((e) => e.userId === uid)
        .map((e) => ({ key: e.id, category: e.category, start: e.startedAt, end: e.endedAt, live: false }));
      const p = presence.find((x) => x.uid === uid);
      const live =
        p && p.startedAt && effectiveStatus(p, now) === 'studying'
          ? [{ key: `live-${uid}`, category: p.category ?? '勉強', start: p.startedAt, end: now, live: true }]
          : [];
      return clip([...saved, ...live], window);
    },
    [entries, presence, now, window.start, window.end],
  );

  const mine = barsOf(profile.uid);
  const theirs = barsOf(partnerId);
  const together = intersect(mine, theirs);
  const togetherMs = totalMs(together);

  const pos = (s: Span) => ({
    left: `${((s.start - window.start) / (window.end - window.start)) * 100}%`,
    width: `${((s.end - s.start) / (window.end - window.start)) * 100}%`,
  });
  const nowPos = `${((now - window.start) / (window.end - window.start)) * 100}%`;

  // バーに触れたときの説明
  const span = (s: Span, live = false) => `${formatTime(s.start)}–${live ? '勉強中' : formatTime(s.end)}（${formatDuration((s.end - s.start) / 1000)}）`;
  const bar = [...mine, ...theirs].find((x) => x.key === selected);
  const overlap = together.find((_, i) => `t${i}` === selected);
  const detail = bar
    ? `${bar.category}　${span(bar, bar.live)}`
    : overlap
      ? `一緒に勉強した時間　${span(overlap)}`
      : null;

  const row = (label: string, bars: Bar[], cls = '') => (
    <div className={`tl-row ${cls}`}>
      <span className="tl-label">{label}</span>
      <div className="tl-track">
        {bars.map((b) => (
          <button
            key={b.key}
            type="button"
            className={`tl-bar ${b.live ? 'live' : ''} ${selected === b.key ? 'selected' : ''}`}
            style={{ ...pos(b), background: categoryColor(b.category) }}
            title={`${b.category} ${formatTime(b.start)}–${b.live ? '勉強中' : formatTime(b.end)}`}
            aria-label={`${label} ${b.category} ${formatTime(b.start)}から${b.live ? '勉強中' : `${formatTime(b.end)}まで`}`}
            onClick={() => setSelected(selected === b.key ? null : b.key)}
          />
        ))}
        <i className="tl-now" style={{ left: nowPos }} />
      </div>
    </div>
  );

  return (
    <div className="card timeline">
      <div className="row space">
        <h3>今日のタイムライン</h3>
        <span className="hint">
          {togetherMs >= 60 * 1000 ? `2人で一緒に ${formatDuration(togetherMs / 1000)}` : '6時〜翌6時'}
        </span>
      </div>
      <div className="tl-grid" role="group" aria-label="今日のタイムライン">
        {row('自分', mine)}
        {row(partnerId ? partnerName : '相手', theirs)}
        <div className="tl-row together">
          <span className="tl-label">重なり</span>
          <div className="tl-track">
            {together.map((s, i) => (
              <button
                key={i}
                type="button"
                className={`tl-bar together ${selected === `t${i}` ? 'selected' : ''}`}
                style={pos(s)}
                title={`一緒に ${formatTime(s.start)}–${formatTime(s.end)}`}
                aria-label={`2人の時間が重なった ${formatTime(s.start)}から${formatTime(s.end)}まで`}
                onClick={() => setSelected(selected === `t${i}` ? null : `t${i}`)}
              />
            ))}
            <i className="tl-now" style={{ left: nowPos }} />
          </div>
        </div>
        <div className="tl-row axis" aria-hidden>
          <span className="tl-label" />
          <div className="tl-track">
            {TICKS.map((h, i) => (
              <span key={i} className="tl-tick" style={{ left: `${(i / (TICKS.length - 1)) * 100}%` }}>
                {h}
              </span>
            ))}
          </div>
        </div>
      </div>
      <p className="hint tl-detail">
        {detail ??
          (partnerId
            ? 'バーに触れると、分野と時刻が出ます。共有されるのは分野と時刻だけで、2日後に消えます。'
            : '友達が部屋に入ると、ここに2人の時間が並びます。')}
      </p>
    </div>
  );
}
