import { useEffect, useState } from 'react';
import { categoryColor } from '../lib/color';
import { formatClock } from '../lib/time';
import { elapsedSec, useNow, type ActiveTimer } from '../hooks/useStudyTimer';

interface Props {
  categories: string[];
  timer: ActiveTimer | null;
  onStart: (category: string) => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onChangeCategory: (category: string) => void;
}

const LAST_CATEGORY_KEY = 'studyroom:v1:lastCategory';
const FORGOT_STOP_SEC = 6 * 60 * 60;

/** 分野を選んでスタート / 休憩 / ストップ */
export function TimerBar({ categories, timer, onStart, onPause, onResume, onStop, onChangeCategory }: Props) {
  const now = useNow(1000, !!timer);
  const [category, setCategory] = useState(() => {
    const last = localStorage.getItem(LAST_CATEGORY_KEY);
    return last && categories.includes(last) ? last : categories[0] ?? '';
  });

  useEffect(() => {
    if (!categories.includes(category)) setCategory(categories[0] ?? '');
  }, [categories, category]);

  const elapsed = timer ? elapsedSec(timer, now) : 0;
  const running = !!timer?.segmentStartedAt;

  useEffect(() => {
    if (!timer) {
      document.title = 'study room';
      return;
    }
    const clock = formatClock(elapsed);
    document.title = `${running ? '●' : '☕'} ${clock} ${timer.category} | study room`;
  }, [timer, elapsed, running]);

  if (!timer) {
    return (
      <div className="timer-bar">
        <div className="category-picker" role="radiogroup" aria-label="分野">
          {categories.map((c) => (
            <button
              key={c}
              role="radio"
              aria-checked={category === c}
              className={`chip ${category === c ? 'selected' : ''}`}
              style={category === c ? { background: categoryColor(c), borderColor: categoryColor(c) } : undefined}
              onClick={() => setCategory(c)}
            >
              {c}
            </button>
          ))}
        </div>
        <button
          className="btn primary big"
          disabled={!category}
          onClick={() => {
            localStorage.setItem(LAST_CATEGORY_KEY, category);
            onStart(category);
          }}
        >
          ▶ スタート
        </button>
      </div>
    );
  }

  return (
    <div className={`timer-bar active ${running ? 'running' : 'paused'}`}>
      <div className="timer-info">
        <select
          className="category-select"
          value={timer.category}
          style={{ background: categoryColor(timer.category) }}
          onChange={(e) => onChangeCategory(e.target.value)}
          aria-label="分野を変更"
        >
          {[...new Set([timer.category, ...categories])].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <span className="clock" aria-live="off">
          {formatClock(elapsed)}
        </span>
        <span className="state">{running ? '勉強中' : '休憩中'}</span>
      </div>
      {elapsed > FORGOT_STOP_SEC && <p className="warn">ストップし忘れていませんか？</p>}
      <div className="row">
        {running ? (
          <button className="btn" onClick={onPause}>
            ☕ 休憩
          </button>
        ) : (
          <button className="btn primary" onClick={onResume}>
            ▶ 再開
          </button>
        )}
        <button className="btn danger" onClick={onStop}>
          ■ ストップして記録
        </button>
      </div>
    </div>
  );
}
