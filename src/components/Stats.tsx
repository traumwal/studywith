import { useEffect, useState } from 'react';
import type { Backend } from '../backend';
import { categoryColor } from '../lib/color';
import { totalsByCategory, totalsByDay, totalSec } from '../lib/stats';
import { addDays, formatDate, formatDuration, formatTime, startOfWeek, WEEKDAYS } from '../lib/time';
import type { StudySession, UserProfile } from '../types';

interface Props {
  backend: Backend;
  profile: UserProfile;
  /** 記録が増えたら変わる値（再読み込み用） */
  version: number;
}

export function Stats({ backend, profile, version }: Props) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(Date.now()));
  const [sessions, setSessions] = useState<StudySession[] | null>(null);
  const [prevTotal, setPrevTotal] = useState<number | null>(null);
  const [reload, setReload] = useState(0);
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSessions(null);
    const weekEnd = addDays(weekStart, 7);
    Promise.all([
      backend.listSessions(profile.uid, weekStart, weekEnd),
      backend.listSessions(profile.uid, addDays(weekStart, -7), weekStart),
    ])
      .then(([cur, prev]) => {
        if (cancelled) return;
        setSessions(cur);
        setPrevTotal(totalSec(prev));
      })
      .catch((e) => {
        console.error(e);
        if (!cancelled) setSessions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [backend, profile.uid, weekStart, version, reload]);

  const isThisWeek = weekStart === startOfWeek(Date.now());
  const list = sessions ?? [];
  const total = totalSec(list);
  const byCategory = totalsByCategory(list);
  const byDay = totalsByDay(list, weekStart);
  const maxCat = Math.max(1, ...byCategory.map((c) => c.sec));
  const maxDay = Math.max(1, ...byDay.map((d) => d.sec));

  return (
    <div className="stats">
      <div className="week-nav">
        <button className="btn ghost" onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="前の週">
          ◀
        </button>
        <span className="week-label">
          {formatDate(weekStart)} 〜 {formatDate(addDays(weekStart, 6))}
          {isThisWeek && <span className="badge">今週</span>}
        </span>
        <button
          className="btn ghost"
          onClick={() => setWeekStart(addDays(weekStart, 7))}
          disabled={isThisWeek}
          aria-label="次の週"
        >
          ▶
        </button>
      </div>

      <div className="card total-card">
        <span className="label">この週の合計</span>
        <span className="total">{formatDuration(total)}</span>
        {prevTotal !== null && sessions && (
          <span className="hint">前の週：{formatDuration(prevTotal)}</span>
        )}
      </div>

      {sessions === null ? (
        <p className="hint">読み込み中…</p>
      ) : (
        <>
          <div className="card">
            <h3>日ごと</h3>
            <div className="day-chart" role="img" aria-label="日ごとの勉強時間">
              {byDay.map((d, i) => (
                <div key={d.dayStart} className="day-col" title={`${formatDate(d.dayStart)} ${formatDuration(d.sec)}`}>
                  <span className="day-value">{d.sec >= 60 ? formatDuration(d.sec).replace('時間', 'h').replace('分', 'm') : ''}</span>
                  <div className="day-bar-area">
                    <div className="day-bar" style={{ height: `${(d.sec / maxDay) * 100}%` }}>
                      {d.byCategory.map((c) => (
                        <div
                          key={c.category}
                          style={{ flexGrow: c.sec, background: categoryColor(c.category) }}
                          title={`${c.category} ${formatDuration(c.sec)}`}
                        />
                      ))}
                    </div>
                  </div>
                  <span className="day-label">{WEEKDAYS[i]}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <h3>分野ごと</h3>
            {byCategory.length === 0 && <p className="hint">この週の記録はまだありません。</p>}
            <ul className="cat-list">
              {byCategory.map((c) => (
                <li key={c.category}>
                  <span className="cat-name">
                    <i className="dot" style={{ background: categoryColor(c.category) }} />
                    {c.category}
                  </span>
                  <div className="cat-bar-track">
                    <div className="cat-bar" style={{ width: `${(c.sec / maxCat) * 100}%`, background: categoryColor(c.category) }} />
                  </div>
                  <span className="cat-value">{formatDuration(c.sec)}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="card">
            <div className="row space">
              <h3>記録一覧</h3>
              <button className="btn small" onClick={() => setShowAdd((v) => !v)}>
                {showAdd ? '閉じる' : '＋ 手動で追加'}
              </button>
            </div>
            {showAdd && (
              <AddSessionForm
                categories={profile.categories}
                onAdd={async (s) => {
                  await backend.addSession(profile.uid, s);
                  setShowAdd(false);
                  setWeekStart(startOfWeek(s.startedAt));
                  setReload((n) => n + 1);
                }}
              />
            )}
            <ul className="session-list">
              {list.map((s) => (
                <li key={s.id}>
                  <span className="session-date">
                    {formatDate(s.startedAt)} {formatTime(s.startedAt)}–{formatTime(s.endedAt)}
                  </span>
                  <span className="session-cat">
                    <i className="dot" style={{ background: categoryColor(s.category) }} />
                    {s.category}
                  </span>
                  <span className="session-dur">{formatDuration(s.durationSec)}</span>
                  <button
                    className="icon-btn"
                    aria-label="この記録を削除"
                    title="削除"
                    onClick={async () => {
                      if (!confirm(`${s.category} ${formatDuration(s.durationSec)} の記録を削除しますか？`)) return;
                      await backend.deleteSession(profile.uid, s.id);
                      setReload((n) => n + 1);
                    }}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

function toLocalInput(ms: number) {
  const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
}

function AddSessionForm({
  categories,
  onAdd,
}: {
  categories: string[];
  onAdd: (s: Omit<StudySession, 'id'>) => Promise<void>;
}) {
  const [category, setCategory] = useState(categories[0] ?? '');
  const [start, setStart] = useState(() => toLocalInput(Date.now() - 60 * 60 * 1000));
  const [minutes, setMinutes] = useState(60);
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="add-session"
      onSubmit={async (e) => {
        e.preventDefault();
        const startedAt = new Date(start).getTime();
        if (!category || !Number.isFinite(startedAt) || minutes <= 0) return;
        setBusy(true);
        try {
          await onAdd({
            category,
            startedAt,
            endedAt: startedAt + minutes * 60000,
            durationSec: minutes * 60,
            source: 'manual',
          });
        } finally {
          setBusy(false);
        }
      }}
    >
      <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
        {categories.map((c) => (
          <option key={c}>{c}</option>
        ))}
      </select>
      <input className="input" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} required />
      <label className="row nowrap">
        <input
          className="input narrow"
          type="number"
          min={1}
          max={24 * 60}
          value={minutes}
          onChange={(e) => setMinutes(Number(e.target.value))}
        />
        分
      </label>
      <button className="btn primary" disabled={busy}>
        追加
      </button>
    </form>
  );
}
